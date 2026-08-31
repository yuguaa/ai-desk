import { useEffect, useMemo, useRef, useState } from "react";
import { isTauriRuntime, listPiProjects, readPiSession, renamePiSession } from "@/lib/pi-bridge";
import { reorderConversationQueue, type QueuedConversationTurn } from "@/lib/conversation-queue";
import {
  createPiCommandId,
  listPiProcesses,
  listenPiRuntime,
  sendPiCommand,
  startPiProcess,
  stopPiProcess,
  type PiConversationState,
  type PiExtensionResponse,
  type PiProcessStatus,
  type PiRuntimeEvent,
} from "@/lib/pi-runtime";
import {
  applyPiExtensionUiRequest,
  applyPiProcessStderr,
  applyPiRpcResponse,
  clearActiveExtensionRequest,
  EMPTY_PI_CONVERSATION_STATE,
  settlePendingPiCommand,
  trackPendingPiCommand,
} from "@/lib/pi-runtime-state";
import {
  EMPTY_PROJECT,
  normalizePiProjects,
  projectFromPath,
  sortConversationsByPinned,
} from "@/lib/workspace-data";
import { pickProjectDirectory } from "@/lib/workspace-bridge";
import { addProjectPreference, archiveConversationPreference, isProjectTrusted, loadWorkspacePreferences, normalizeProjectPath, removeProjectPreference, saveWorkspacePreferences, setConversationPinnedPreference, setProjectTrustedPreference } from "@/lib/workspace-preferences";
import { formatMessageTime, projectPiSession, textFromContent, type TimelineItem } from "@/lib/pi-session";
import type { ConversationRecord, Project } from "@/types/workspace";

type TimelineMap = Record<string, TimelineItem[]>;
type ProcessMap = Record<string, PiProcessStatus>;
export type SubmittedConversationTurn = { conversationId: string; turnIndex: number; prompt: string };
type TurnPreparation = (turn: SubmittedConversationTurn) => Promise<unknown>;
type EditingQueuedTurn = { conversationId: string; turnId: string };
type PendingManualSteer = { turn: QueuedConversationTurn; beforeRun?: TurnPreparation };
type PendingPiCommand = {
  commandId: string;
  commandType: string;
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (event: Record<string, unknown>) => void;
  reject: (reason: unknown) => void;
};
type StreamingToolState = {
  itemId: string;
  toolCallId: string;
  name: string;
  command: string;
  output: string;
  status: "completed" | "running" | "error";
};
type StreamingMessageState = {
  messageKey: string;
  insertAt: number;
  itemIds: string[];
  textBlocks: Map<number, string>;
  thinkingBlocks: Map<number, string>;
  toolBlocks: Map<number, StreamingToolState>;
};

const RPC_RESPONSE_TIMEOUT = 30_000;
const CANCELLED_CONVERSATION_EXECUTION = Symbol("cancelled-conversation-execution");

export function useWorkspace() {
  const runtimeIsTauri = isTauriRuntime();
  const workspacePreferencesRef = useRef(loadWorkspacePreferences());
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [timelines, setTimelines] = useState<TimelineMap>({});
  const [draft, setDraftState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [processes, setProcesses] = useState<ProcessMap>({});
  const [activeTurnIndexes, setActiveTurnIndexes] = useState<Record<string, number>>({});
  const [completedConversationIds, setCompletedConversationIds] = useState<string[]>([]);
  const [piStates, setPiStates] = useState<Record<string, PiConversationState>>({});
  const [queuedTurnsByConversation, setQueuedTurnsByConversation] = useState<Record<string, QueuedConversationTurn[]>>({});
  const [editingQueuedTurn, setEditingQueuedTurn] = useState<EditingQueuedTurn | null>(null);
  const [pinnedConversationIds, setPinnedConversationIds] = useState(workspacePreferencesRef.current.pinnedConversationIds);
  const [activeProjectTrusted, setActiveProjectTrustedState] = useState(false);
  const activeConversationRef = useRef(activeConversationId);
  const activeProjectRef = useRef(activeProjectId);
  const activeProjectTrustedRef = useRef(activeProjectTrusted);
  const projectsRef = useRef(projects);
  const conversationsRef = useRef(conversations);
  const timelinesRef = useRef(timelines);
  const conversationDraftsRef = useRef(new Map<string, string>());
  const processRef = useRef(new Map<string, PiProcessStatus>());
  const streamMessagesRef = useRef(new Map<string, StreamingMessageState>());
  const toolCallsRef = useRef(new Map<string, { itemId: string; name: string }>());
  const pendingResponsesRef = useRef(new Map<string, PendingPiCommand>());
  const activeTurnIndexesRef = useRef<Record<string, number>>({});
  const queuedTurnsRef = useRef<Record<string, QueuedConversationTurn[]>>({});
  const queuedTurnPreparationsRef = useRef(new Map<string, TurnPreparation | undefined>());
  const queueDispatchingRef = useRef(new Set<string>());
  const pendingManualSteersRef = useRef(new Map<string, PendingManualSteer[]>());
  const pausedConversationQueuesRef = useRef(new Set<string>());
  const conversationExecutionEpochRef = useRef(new Map<string, number>());
  const editingQueuedTurnRef = useRef<EditingQueuedTurn | null>(null);
  const sessionLoadRef = useRef(0);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? EMPTY_PROJECT;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const activeProjectConversations = useMemo(() => conversations.filter((conversation) => conversation.projectId === activeProjectId), [activeProjectId, conversations]);
  const timeline = timelines[activeConversationId] ?? [];
  const queuedTurns = queuedTurnsByConversation[activeConversationId] ?? [];
  const editingQueuedTurnId = editingQueuedTurn?.conversationId === activeConversationId ? editingQueuedTurn.turnId : null;
  const activeConversationState = piStates[activeConversationId] ?? EMPTY_PI_CONVERSATION_STATE;

  activeConversationRef.current = activeConversationId;
  activeProjectRef.current = activeProjectId;
  activeProjectTrustedRef.current = activeProjectTrusted;
  projectsRef.current = projects;
  conversationsRef.current = conversations;
  timelinesRef.current = timelines;

  const setDraft = (value: string) => {
    const conversationId = activeConversationRef.current;
    if (conversationId) {
      if (value) conversationDraftsRef.current.set(conversationId, value);
      else conversationDraftsRef.current.delete(conversationId);
    }
    setDraftState(value);
  };

  const restoreConversationDraft = (conversationId: string) => {
    setDraftState(conversationDraftsRef.current.get(conversationId) ?? "");
  };

  const setProcessStatus = (status: PiProcessStatus) => {
    const previous = processRef.current.get(status.conversationId);
    processRef.current.set(status.conversationId, status);
    setProcesses((current) => ({ ...current, [status.conversationId]: status }));
    setCompletedConversationIds((current) => {
      if (status.busy) return current.filter((id) => id !== status.conversationId);
      if (!previous?.busy || activeConversationRef.current === status.conversationId || current.includes(status.conversationId)) return current;
      return [...current, status.conversationId];
    });
  };

  const setConversationState = (conversationId: string, update: (state: PiConversationState | undefined) => PiConversationState) => {
    setPiStates((current) => ({
      ...current,
      [conversationId]: update(current[conversationId]),
    }));
  };

  const patchTimeline = (conversationId: string, update: (items: TimelineItem[]) => TimelineItem[]) => {
    setTimelines((current) => {
      const next = { ...current, [conversationId]: update(current[conversationId] ?? []) };
      timelinesRef.current = next;
      return next;
    });
  };

  const appendTimeline = (conversationId: string, item: TimelineItem) => {
    patchTimeline(conversationId, (items) => [...items, item]);
  };

  const appendRuntimeError = (conversationId: string, message: string, key: string = createPiCommandId("runtime-error")) => {
    if (!message.trim()) return;
    appendTimeline(conversationId, {
      id: `pi-error-${key}`,
      type: "assistant",
      text: message,
      time: "Pi runtime",
    });
  };

  const sendRpcCommand = (conversationId: string, command: Record<string, unknown>, options: { expectsResponse?: boolean } = {}) => {
    const commandId = typeof command.id === "string" && command.id.trim() ? command.id : createPiCommandId(String(command.type ?? conversationId) || "pi");
    const payload: Record<string, unknown> = { ...command, id: commandId };
    const expectsResponse = options.expectsResponse ?? payload.type !== "extension_ui_response";

    if (!expectsResponse) return sendPiCommand(conversationId, payload).then(() => undefined);

    setConversationState(conversationId, (state) => trackPendingPiCommand(state, commandId));

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        const pendingKey = `${conversationId}:${commandId}`;
        if (!pendingResponsesRef.current.delete(pendingKey)) return;
        const error = new Error(`${String(payload.type ?? "Pi RPC")} 响应超时`);
        setConversationState(conversationId, (state) => settlePendingPiCommand(state, commandId));
        appendRuntimeError(conversationId, error.message, commandId);
        reject(error);
      }, RPC_RESPONSE_TIMEOUT);
      pendingResponsesRef.current.set(`${conversationId}:${commandId}`, {
        commandId,
        commandType: String(payload.type ?? ""),
        timeoutId,
        resolve,
        reject,
      });
      sendPiCommand(conversationId, payload).catch((reason) => {
        pendingResponsesRef.current.delete(`${conversationId}:${commandId}`);
        globalThis.clearTimeout(timeoutId);
        setConversationState(conversationId, (state) => settlePendingPiCommand(state, commandId));
        appendRuntimeError(conversationId, reason instanceof Error ? reason.message : String(reason), commandId);
        reject(reason);
      });
    });
  };

  const syncPiState = (conversationId: string) => Promise.all([
    sendRpcCommand(conversationId, { type: "get_state" }),
    sendRpcCommand(conversationId, { type: "get_available_models" }),
    sendRpcCommand(conversationId, { type: "get_available_thinking_levels" }),
    sendRpcCommand(conversationId, { type: "get_session_stats" }),
  ]).then(() => undefined);

  const refreshContextUsage = (conversationId: string) => sendRpcCommand(conversationId, { type: "get_session_stats" }).then(() => undefined);

  const patchProcess = (conversationId: string, patch: Partial<PiProcessStatus>) => {
    const current = processRef.current.get(conversationId);
    if (!current) return;
    setProcessStatus({ ...current, ...patch });
  };

  const setActiveTurnIndex = (conversationId: string, turnIndex: number | null) => {
    const current = activeTurnIndexesRef.current;
    const next = turnIndex === null ? omitKey(current, conversationId) : { ...current, [conversationId]: turnIndex };
    activeTurnIndexesRef.current = next;
    setActiveTurnIndexes(next);
  };

  const patchConversationQueue = (conversationId: string, update: (turns: QueuedConversationTurn[]) => QueuedConversationTurn[]) => {
    const nextTurns = update(queuedTurnsRef.current[conversationId] ?? []);
    if (!nextTurns.length) pausedConversationQueuesRef.current.delete(conversationId);
    const next = nextTurns.length
      ? { ...queuedTurnsRef.current, [conversationId]: nextTurns }
      : omitKey(queuedTurnsRef.current, conversationId);
    queuedTurnsRef.current = next;
    setQueuedTurnsByConversation(next);
    return nextTurns;
  };

  const clearQueuedTurnEditing = () => {
    editingQueuedTurnRef.current = null;
    setEditingQueuedTurn(null);
  };

  const leaveQueuedTurnEditing = (nextConversationId: string) => {
    const editing = editingQueuedTurnRef.current;
    if (!editing || editing.conversationId === nextConversationId) return;
    clearQueuedTurnEditing();
    pumpConversationQueue(editing.conversationId);
  };

  const removeIdleProcess = (conversationId: string) => {
    const current = processRef.current.get(conversationId);
    if (!current || current.busy) return Promise.resolve();
    return stopPiProcess(conversationId)
      .catch(() => undefined)
      .then(() => {
        processRef.current.delete(conversationId);
        setProcesses((currentProcesses) => omitKey(currentProcesses, conversationId));
      });
  };

  const rejectPendingCommands = (conversationId: string, reason: unknown) => {
    [...pendingResponsesRef.current.entries()]
      .filter(([key]) => key.startsWith(`${conversationId}:`))
      .forEach(([key, pending]) => {
        pendingResponsesRef.current.delete(key);
        globalThis.clearTimeout(pending.timeoutId);
        pending.reject(reason);
      });
    setConversationState(conversationId, (state) => ({
      ...(state ?? EMPTY_PI_CONVERSATION_STATE),
      pendingCommandIds: [],
      activeExtensionRequest: null,
      extensionRequestQueue: [],
    }));
  };

  const loadConversationTimeline = (conversation: ConversationRecord) => {
    if (!conversation.sessionFile) {
      setTimelines((current) => ({ ...current, [conversation.id]: current[conversation.id] ?? [] }));
      return Promise.resolve();
    }
    const requestId = ++sessionLoadRef.current;
    return readPiSession(conversation.sessionFile)
      .then((session) => {
        if (requestId !== sessionLoadRef.current) return;
        setTimelines((current) => ({ ...current, [conversation.id]: session ? projectPiSession(session.activeEntries) : [] }));
      })
      .catch(() => {
        if (requestId === sessionLoadRef.current) setTimelines((current) => ({ ...current, [conversation.id]: [] }));
      });
  };

  const ensureProcess = (conversation: ConversationRecord, projectOverride?: Project, trustOverride?: boolean) => {
    const existing = processRef.current.get(conversation.id);
    if (existing) {
      syncPiState(conversation.id).catch(() => undefined);
      return Promise.resolve(existing);
    }
    const project = projectOverride ?? projectsRef.current.find((item) => item.id === conversation.projectId);
    if (!project) return Promise.reject(new Error("当前对话所属项目不存在"));
    const projectTrusted = trustOverride ?? isProjectTrusted(workspacePreferencesRef.current, project.path);
    return startPiProcess(conversation.id, project.path, conversation.sessionFile, projectTrusted)
      .then((status) => {
        if (status) setProcessStatus(status);
        return status ? syncPiState(conversation.id).then(() => status) : status;
      });
  };

  const restartIdleProjectProcesses = (project: Project, trusted: boolean) => Promise.all(
    conversationsRef.current
      .filter((conversation) => conversation.projectId === project.id)
      .filter((conversation) => {
        const status = processRef.current.get(conversation.id);
        return Boolean(status && !status.busy);
      })
      .map((conversation) => stopPiProcess(conversation.id)
        .catch(() => undefined)
        .then(() => {
          processRef.current.delete(conversation.id);
          setProcesses((current) => omitKey(current, conversation.id));
          return ensureProcess(conversation, project, trusted);
        })),
  ).then(() => undefined);

  const applyPiProjects = (items: Awaited<ReturnType<typeof listPiProjects>>, reloadActiveTimeline = true) => {
    const currentProjects = projectsRef.current;
    const currentConversations = conversationsRef.current;
    const normalized = normalizePiProjects(items, workspacePreferencesRef.current);
    const hiddenProjectIds = new Set(workspacePreferencesRef.current.hiddenProjectRoots.map(normalizeProjectPath));
    const diskConversationIds = new Set(normalized.nextConversations.map((conversation) => conversation.id));
    const liveConversations = currentConversations.filter((conversation) => !hiddenProjectIds.has(conversation.projectId) && !diskConversationIds.has(conversation.id) && (processRef.current.has(conversation.id) || conversation.id === activeConversationRef.current));
    const nextConversations = sortConversationsByPinned([...normalized.nextConversations, ...liveConversations], workspacePreferencesRef.current.pinnedConversationIds);
    const diskProjectIds = new Set(normalized.nextProjects.map((project) => project.id));
    const liveProjects = currentProjects.filter((project) => !hiddenProjectIds.has(project.id) && !diskProjectIds.has(project.id) && (nextConversations.some((conversation) => conversation.projectId === project.id) || project.id === activeProjectRef.current));
    const nextProjects = [...normalized.nextProjects, ...liveProjects];
    const firstProject = nextProjects[0];
    const currentProject = nextProjects.find((project) => project.id === activeProjectRef.current);
    const currentConversation = nextConversations.find((conversation) => conversation.id === activeConversationRef.current);
    const preferredConversation = currentConversation ?? (currentProject ? undefined : nextConversations[0]);
    const preferredProject = currentProject ?? (preferredConversation ? nextProjects.find((project) => project.id === preferredConversation.projectId) : firstProject);

    setProjects(nextProjects);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);

    if (!preferredProject) {
      activeProjectRef.current = "";
      activeConversationRef.current = "";
      setActiveProjectId("");
      setActiveConversationId("");
      setActiveProjectTrustedState(false);
      setDraftState("");
      return;
    }

    activeProjectRef.current = preferredProject.id;
    setActiveProjectId(preferredProject.id);
    setActiveProjectTrustedState(isProjectTrusted(workspacePreferencesRef.current, preferredProject.path));

    if (!preferredConversation) {
      activeConversationRef.current = "";
      setActiveConversationId("");
      setDraftState("");
      return;
    }

    activeConversationRef.current = preferredConversation.id;
    setActiveConversationId(preferredConversation.id);
    restoreConversationDraft(preferredConversation.id);
    if (reloadActiveTimeline) loadConversationTimeline(preferredConversation);
    ensureProcess(preferredConversation, preferredProject).catch(() => undefined);
  };

  const refreshProjects = () => {
    setIsLoading(true);
    return listPiProjects()
      .then(applyPiProjects)
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  };

  const refreshProjectMetadata = () => listPiProjects()
    .then((items) => applyPiProjects(items, false))
    .catch(() => undefined);

  function applyRuntimeEvent(payload: PiRuntimeEvent) {
    const { conversationId, event } = payload;
    const type = String(event.type ?? "");

    if (type === "response") {
      applyPiResponse(conversationId, event);
      return;
    }
    if (type === "agent_start") {
      patchProcess(conversationId, { busy: true });
      flushPendingManualSteers(conversationId, "steer");
      return;
    }
    if (type === "agent_settled") {
      patchProcess(conversationId, { busy: false });
      setActiveTurnIndex(conversationId, null);
      streamMessagesRef.current.delete(conversationId);
      refreshContextUsage(conversationId).catch(() => undefined);
      flushPendingManualSteers(conversationId, "prompt");
      pumpConversationQueue(conversationId);
      /*
       * 运行事件已经维护了活动时间线，结束后这里只同步项目和会话元数据。
       * 重新读取磁盘时间线会更换消息 key，并让展开的工具输出重新挂载后折叠。
       */
      refreshProjectMetadata();
      return;
    }
    if (type === "message_start") {
      applyMessageStart(conversationId, event);
      return;
    }
    if (type === "message_update") {
      applyMessageUpdate(conversationId, event);
      return;
    }
    if (type === "message_end") {
      applyMessageEnd(conversationId, event);
      return;
    }
    if (type === "tool_execution_start") {
      patchProcess(conversationId, { busy: true });
      upsertTool(conversationId, String(event.toolCallId ?? ""), String(event.toolName ?? "tool"), formatArguments(event.args), "", "running");
      return;
    }
    if (type === "tool_execution_update") {
      upsertTool(conversationId, String(event.toolCallId ?? ""), String(event.toolName ?? "tool"), formatArguments(event.args), textFromContent((event.partialResult as Record<string, unknown> | undefined)?.content), "running");
      return;
    }
    if (type === "tool_execution_end") {
      const result = textFromContent((event.result as Record<string, unknown> | undefined)?.content) || textFromContent(event.content);
      upsertTool(conversationId, String(event.toolCallId ?? ""), String(event.toolName ?? "tool"), formatArguments(event.args), result, event.isError === true ? "error" : "completed");
      return;
    }
    if (type === "extension_ui_request") {
      setConversationState(conversationId, (state) => applyPiExtensionUiRequest(state, event));
      if (conversationId === activeConversationRef.current && event.method === "set_editor_text" && typeof event.text === "string") setDraft(event.text);
      if (event.method === "setTitle" && typeof event.title === "string") document.title = event.title;
      return;
    }
    if (type === "process_stderr") {
      const message = String(event.message ?? "").trim();
      if (!message) return;
      setConversationState(conversationId, (state) => applyPiProcessStderr(state, message));
      appendRuntimeError(conversationId, message, createPiCommandId("stderr"));
      return;
    }
    if (type === "process_error") {
      const message = String(event.message ?? "Pi 进程返回错误");
      setConversationState(conversationId, (state) => applyPiProcessStderr(state, message));
      appendRuntimeError(conversationId, message, createPiCommandId("process-error"));
      setActiveTurnIndex(conversationId, null);
      queueDispatchingRef.current.delete(conversationId);
      pendingManualSteersRef.current.delete(conversationId);
    }
  }

  function applyPiResponse(conversationId: string, event: Record<string, unknown>) {
    const responseId = typeof event.id === "string" ? event.id : "";
    const pendingKey = responseId ? `${conversationId}:${responseId}` : "";
    const pending = pendingKey ? pendingResponsesRef.current.get(pendingKey) : undefined;

    if (pendingKey) pendingResponsesRef.current.delete(pendingKey);
    if (pending) globalThis.clearTimeout(pending.timeoutId);

    setConversationState(conversationId, (state) => settlePendingPiCommand(applyPiRpcResponse(state, event), responseId));

    if (event.success === false) {
      const error = typeof event.error === "string" && event.error.trim() ? event.error : "Pi RPC 请求失败";
      appendRuntimeError(conversationId, pending?.commandType ? `${pending.commandType}: ${error}` : error, responseId || createPiCommandId("rpc-error"));
      pending?.reject(new Error(error));
      return;
    }

    if (String(event.command ?? "") === "abort") {
      patchProcess(conversationId, { busy: false });
      setActiveTurnIndex(conversationId, null);
    }
    pending?.resolve(event);
  }

  function applyMessageStart(conversationId: string, event: Record<string, unknown>) {
    const message = event.message as Record<string, unknown> | undefined;
    if (!message || String(message.role ?? "") !== "assistant") return;
    const previous = streamMessagesRef.current.get(conversationId);
    if (previous) patchTimeline(conversationId, (items) => replaceTimelineSegment(items, previous.itemIds, previous.insertAt, []));
    streamMessagesRef.current.set(conversationId, {
      messageKey: typeof message.id === "string" ? message.id : createPiCommandId("message"),
      insertAt: (timelinesRef.current[conversationId] ?? []).length,
      itemIds: [],
      textBlocks: new Map(),
      thinkingBlocks: new Map(),
      toolBlocks: new Map(),
    });
  }

  function applyMessageUpdate(conversationId: string, event: Record<string, unknown>) {
    const delta = event.assistantMessageEvent as Record<string, unknown> | undefined;
    if (!delta) return;
    const deltaType = String(delta.type ?? "");
    const stream = ensureStreamingMessage(conversationId);
    const contentIndex = parseContentIndex(delta.contentIndex);

    if (deltaType === "text_delta") {
      stream.textBlocks.set(contentIndex, `${stream.textBlocks.get(contentIndex) ?? ""}${String(delta.delta ?? "")}`);
      syncStreamingMessageTimeline(conversationId, stream);
      return;
    }
    if (deltaType === "thinking_delta") {
      stream.thinkingBlocks.set(contentIndex, `${stream.thinkingBlocks.get(contentIndex) ?? ""}${String(delta.delta ?? "")}`);
      syncStreamingMessageTimeline(conversationId, stream);
      return;
    }
    if (deltaType === "toolcall_start") {
      const toolCallId = String(delta.id ?? createPiCommandId("tool"));
      const name = String(delta.toolName ?? "tool");
      const itemId = buildToolItemId(conversationId, toolCallId, stream.messageKey, contentIndex, name);
      toolCallsRef.current.set(`${conversationId}:${toolCallId}`, { itemId, name });
      stream.toolBlocks.set(contentIndex, { itemId, toolCallId, name, command: "", output: "", status: "running" });
      syncStreamingMessageTimeline(conversationId, stream);
      return;
    }
    if (deltaType === "toolcall_delta") {
      const currentTool = stream.toolBlocks.get(contentIndex);
      if (!currentTool) return;
      const toolCallId = String(delta.id ?? currentTool.toolCallId);
      stream.toolBlocks.set(contentIndex, { ...currentTool, toolCallId, command: `${currentTool.command}${String(delta.delta ?? "")}` });
      if (toolCallId) toolCallsRef.current.set(`${conversationId}:${toolCallId}`, { itemId: currentTool.itemId, name: currentTool.name });
      syncStreamingMessageTimeline(conversationId, stream);
      return;
    }
    if (deltaType === "toolcall_end" && delta.toolCall && typeof delta.toolCall === "object") {
      const call = delta.toolCall as Record<string, unknown>;
      const currentTool = stream.toolBlocks.get(contentIndex);
      const toolCallId = String(call.id ?? currentTool?.toolCallId ?? "");
      const name = String(call.toolName ?? call.name ?? currentTool?.name ?? "tool");
      const itemId = currentTool?.itemId ?? buildToolItemId(conversationId, toolCallId, stream.messageKey, contentIndex, name);
      stream.toolBlocks.set(contentIndex, {
        itemId,
        toolCallId,
        name,
        command: formatArguments(call.arguments ?? call.input),
        output: currentTool?.output ?? "",
        status: currentTool?.status ?? "running",
      });
      if (toolCallId) toolCallsRef.current.set(`${conversationId}:${toolCallId}`, { itemId, name });
      syncStreamingMessageTimeline(conversationId, stream);
    }
  }

  function applyMessageEnd(conversationId: string, event: Record<string, unknown>) {
    const message = event.message as Record<string, unknown> | undefined;
    if (!message) return;
    const role = String(message.role ?? "");

    if (role === "user") {
      return;
    }

    if (role === "assistant") {
      const stream = streamMessagesRef.current.get(conversationId);
      const messageKey = stream?.messageKey ?? (typeof message.id === "string" ? message.id : createPiCommandId("message"));
      const insertAt = stream?.insertAt ?? (timelinesRef.current[conversationId] ?? []).length;
      const items = buildFinalAssistantItems(conversationId, messageKey, message);
      patchTimeline(conversationId, (current) => replaceTimelineSegment(current, stream?.itemIds ?? [], insertAt, items));
      streamMessagesRef.current.delete(conversationId);
      return;
    }

    if (role === "toolResult") {
      upsertTool(conversationId, String(message.toolCallId ?? ""), String(message.toolName ?? "tool"), "", textFromContent(message.content), message.isError === true ? "error" : "completed");
    }
  }

  function ensureStreamingMessage(conversationId: string) {
    const current = streamMessagesRef.current.get(conversationId);
    if (current) return current;
    const next: StreamingMessageState = {
      messageKey: createPiCommandId("message"),
      insertAt: (timelinesRef.current[conversationId] ?? []).length,
      itemIds: [],
      textBlocks: new Map(),
      thinkingBlocks: new Map(),
      toolBlocks: new Map(),
    };
    streamMessagesRef.current.set(conversationId, next);
    return next;
  }

  function syncStreamingMessageTimeline(conversationId: string, stream: StreamingMessageState) {
    const nextItems = buildStreamingMessageItems(stream);
    patchTimeline(conversationId, (current) => replaceTimelineSegment(current, stream.itemIds, stream.insertAt, nextItems));
    stream.itemIds = nextItems.map((item) => item.id);
  }

  function buildStreamingMessageItems(stream: StreamingMessageState): TimelineItem[] {
    const indices = [...new Set([...stream.textBlocks.keys(), ...stream.thinkingBlocks.keys(), ...stream.toolBlocks.keys()])].sort((a, b) => a - b);
    return indices.flatMap((contentIndex) => {
      const items: TimelineItem[] = [];
      const thinking = stream.thinkingBlocks.get(contentIndex);
      const tool = stream.toolBlocks.get(contentIndex);
      const text = stream.textBlocks.get(contentIndex);
      if (thinking) items.push({ id: `${stream.messageKey}-thinking-${contentIndex}`, type: "reasoning", text: thinking, status: "running", messageId: stream.messageKey, contentIndex });
      if (tool) items.push({ id: tool.itemId, type: "tool", name: tool.name, command: tool.command, output: tool.output, status: tool.status, messageId: stream.messageKey, contentIndex, toolCallId: tool.toolCallId || undefined });
      if (text) items.push({ id: `${stream.messageKey}-text-${contentIndex}`, type: "assistant", text, time: "正在生成", streaming: true, messageId: stream.messageKey, contentIndex });
      return items;
    });
  }

  function buildFinalAssistantItems(conversationId: string, messageKey: string, message: Record<string, unknown>) {
    const timestamp = runtimeMessageTime(message);
    const content = message.content;

    if (typeof content === "string") {
      return [{ id: `${messageKey}-text-0`, type: "assistant", text: content, time: timestamp, messageId: messageKey, contentIndex: 0 }] satisfies TimelineItem[];
    }
    if (!Array.isArray(content)) return [] as TimelineItem[];

    return content.flatMap((part, contentIndex) => {
      if (!part || typeof part !== "object") return [] as TimelineItem[];
      const value = part as Record<string, unknown>;
      const partType = String(value.type ?? "");

      if (partType === "thinking" && typeof value.thinking === "string") {
        return [{ id: `${messageKey}-thinking-${contentIndex}`, type: "reasoning", text: value.thinking, status: "completed", messageId: messageKey, contentIndex } satisfies TimelineItem];
      }
      if (partType === "text" && typeof value.text === "string") {
        return [{ id: `${messageKey}-text-${contentIndex}`, type: "assistant", text: value.text, time: timestamp, messageId: messageKey, contentIndex } satisfies TimelineItem];
      }
      if (partType === "toolCall") {
        const toolCallId = typeof value.id === "string" ? value.id : "";
        const name = String(value.name ?? value.toolName ?? "tool");
        const itemId = buildToolItemId(conversationId, toolCallId, messageKey, contentIndex, name);
        const currentTool = getTimelineToolById(conversationId, itemId);
        if (toolCallId) toolCallsRef.current.set(`${conversationId}:${toolCallId}`, { itemId, name });
        return [{
          id: itemId,
          type: "tool",
          name,
          command: formatArguments(value.arguments ?? value.input) || currentTool?.command || "",
          output: currentTool?.output ?? "",
          status: currentTool?.status ?? "running",
          messageId: messageKey,
          contentIndex,
          toolCallId: toolCallId || undefined,
        } satisfies TimelineItem];
      }

      return [] as TimelineItem[];
    });
  }

  function getTimelineToolById(conversationId: string, itemId: string) {
    return (timelinesRef.current[conversationId] ?? []).find((item): item is Extract<TimelineItem, { type: "tool" }> => item.type === "tool" && item.id === itemId);
  }

  function upsertTool(conversationId: string, toolCallId: string, name: string, command: string, output: string, status: "completed" | "running" | "error") {
    const currentStream = streamMessagesRef.current.get(conversationId);
    const toolRef = toolCallId ? toolCallsRef.current.get(`${conversationId}:${toolCallId}`) : undefined;
    const streamEntry = currentStream
      ? [...currentStream.toolBlocks.entries()].find(([, tool]) => (toolCallId && tool.toolCallId === toolCallId) || tool.itemId === toolRef?.itemId)
      : undefined;

    if (currentStream && streamEntry) {
      const [contentIndex, currentTool] = streamEntry;
      const itemId = toolRef?.itemId ?? currentTool.itemId;
      const nextName = name || currentTool.name;
      currentStream.toolBlocks.set(contentIndex, {
        ...currentTool,
        itemId,
        toolCallId: toolCallId || currentTool.toolCallId,
        name: nextName,
        command: command || currentTool.command,
        output: output || currentTool.output,
        status,
      });
      if (toolCallId) toolCallsRef.current.set(`${conversationId}:${toolCallId}`, { itemId, name: nextName });
      syncStreamingMessageTimeline(conversationId, currentStream);
      return;
    }

    const itemId = toolRef?.itemId ?? buildToolItemId(conversationId, toolCallId, "tool", 0, name);
    if (toolCallId) toolCallsRef.current.set(`${conversationId}:${toolCallId}`, { itemId, name });
    patchTimeline(conversationId, (items) => {
      const existing = items.find((item): item is Extract<TimelineItem, { type: "tool" }> => item.type === "tool" && item.id === itemId);
      const nextItem: TimelineItem = {
        id: itemId,
        type: "tool",
        name: name || existing?.name || "tool",
        command: command || existing?.command || "",
        output: output || existing?.output || "",
        status,
        toolCallId: toolCallId || existing?.toolCallId,
      };
      return upsertItem(items, nextItem);
    });
  }

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let stopped = false;

    listenPiRuntime(applyRuntimeEvent, ({ conversationId, code }) => {
      processRef.current.delete(conversationId);
      streamMessagesRef.current.delete(conversationId);
      queueDispatchingRef.current.delete(conversationId);
      pendingManualSteersRef.current.delete(conversationId);
      setActiveTurnIndex(conversationId, null);
      rejectPendingCommands(conversationId, new Error("Pi 进程已退出"));
      setProcesses((current) => omitKey(current, conversationId));
      if (code && code !== 0) appendRuntimeError(conversationId, `Pi 进程已退出（code ${code}）`, createPiCommandId("exit"));
    }).then((unlisten) => {
      if (stopped) {
        unlisten();
        return null;
      }
      dispose = unlisten;
      return listPiProcesses();
    }).then((items) => {
      if (!items || stopped) return;
      items.forEach(setProcessStatus);
      return refreshProjects();
    }).catch(() => undefined);

    return () => {
      stopped = true;
      dispose?.();
      pendingResponsesRef.current.forEach((pending) => {
        globalThis.clearTimeout(pending.timeoutId);
        pending.reject(new Error("工作区已关闭"));
      });
      pendingResponsesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const trusted = activeProject.path ? isProjectTrusted(workspacePreferencesRef.current, activeProject.path) : false;
    if (trusted !== activeProjectTrustedRef.current) setActiveProjectTrustedState(trusted);
  }, [activeProject.path]);

  function selectConversation(conversation: ConversationRecord) {
    const previousConversationId = activeConversationRef.current;
    leaveQueuedTurnEditing(conversation.id);
    if (previousConversationId && previousConversationId !== conversation.id) removeIdleProcess(previousConversationId).catch(() => undefined);
    activeConversationRef.current = conversation.id;
    setCompletedConversationIds((current) => current.filter((id) => id !== conversation.id));
    setActiveConversationId(conversation.id);
    restoreConversationDraft(conversation.id);
    setActiveProjectId(conversation.projectId);
    const project = projectsRef.current.find((item) => item.id === conversation.projectId);
    setActiveProjectTrustedState(project ? isProjectTrusted(workspacePreferencesRef.current, project.path) : false);
    loadConversationTimeline(conversation);
    ensureProcess(conversation)
      .then(() => pumpConversationQueue(conversation.id))
      .catch((reason) => appendRuntimeError(conversation.id, reason instanceof Error ? reason.message : String(reason), createPiCommandId("start-error")));
  }

  function selectProject(projectId: string) {
    const firstConversation = conversationsRef.current.find((conversation) => conversation.projectId === projectId);
    if (firstConversation) {
      selectConversation(firstConversation);
      return;
    }
    const previousConversationId = activeConversationRef.current;
    leaveQueuedTurnEditing("");
    if (previousConversationId) removeIdleProcess(previousConversationId).catch(() => undefined);
    activeConversationRef.current = "";
    setActiveProjectId(projectId);
    setActiveConversationId("");
    setDraftState("");
    const project = projectsRef.current.find((item) => item.id === projectId);
    setActiveProjectTrustedState(project ? isProjectTrusted(workspacePreferencesRef.current, project.path) : false);
  }

  function createConversationForProject(project: Project) {
    const previousConversationId = activeConversationRef.current;
    leaveQueuedTurnEditing("");
    if (previousConversationId) removeIdleProcess(previousConversationId).catch(() => undefined);
    const id = createPiCommandId("conversation");
    const conversation = { id, projectId: project.id, title: "新对话", preview: "", time: "刚刚", modifiedAt: new Date().toISOString() };
    const nextConversations = sortConversationsByPinned([conversation, ...conversationsRef.current], workspacePreferencesRef.current.pinnedConversationIds);
    conversationsRef.current = nextConversations;
    activeProjectRef.current = project.id;
    activeConversationRef.current = id;
    setActiveProjectId(project.id);
    setActiveProjectTrustedState(isProjectTrusted(workspacePreferencesRef.current, project.path));
    setConversations(nextConversations);
    setActiveConversationId(id);
    restoreConversationDraft(id);
    setTimelines((current) => ({ ...current, [id]: [] }));
    ensureProcess(conversation, project).catch((reason) => appendRuntimeError(id, reason instanceof Error ? reason.message : String(reason), createPiCommandId("start-error")));
  }

  function createConversation(projectId = activeProjectId) {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    createConversationForProject(project);
  }

  function createProject() {
    return pickProjectDirectory().then((path) => {
      if (!path) return;
      const normalizedPath = normalizeProjectPath(path);
      const nextPreferences = addProjectPreference(workspacePreferencesRef.current, normalizedPath);
      workspacePreferencesRef.current = nextPreferences;
      saveWorkspacePreferences(nextPreferences);
      const existing = projectsRef.current.find((project) => project.id === normalizedPath);
      const project = existing ?? projectFromPath(normalizedPath);
      if (!existing) {
        const nextProjects = [...projectsRef.current, project];
        projectsRef.current = nextProjects;
        setProjects(nextProjects);
      }
      createConversationForProject(project);
    });
  }

  function clearConversationWorkspaceState(conversationIds: string[]) {
    const removedIds = new Set(conversationIds);
    if (editingQueuedTurnRef.current && removedIds.has(editingQueuedTurnRef.current.conversationId)) clearQueuedTurnEditing();
    conversationIds.forEach((conversationId) => {
      processRef.current.delete(conversationId);
      streamMessagesRef.current.delete(conversationId);
      queueDispatchingRef.current.delete(conversationId);
      pendingManualSteersRef.current.delete(conversationId);
      pausedConversationQueuesRef.current.delete(conversationId);
      conversationExecutionEpochRef.current.delete(conversationId);
      conversationDraftsRef.current.delete(conversationId);
      (queuedTurnsRef.current[conversationId] ?? []).forEach((turn) => queuedTurnPreparationsRef.current.delete(turn.id));
    });
    [...toolCallsRef.current.keys()].filter((key) => conversationIds.some((conversationId) => key.startsWith(`${conversationId}:`))).forEach((key) => toolCallsRef.current.delete(key));
    const nextQueues = omitKeys(queuedTurnsRef.current, removedIds);
    const nextActiveTurnIndexes = omitKeys(activeTurnIndexesRef.current, removedIds);
    queuedTurnsRef.current = nextQueues;
    activeTurnIndexesRef.current = nextActiveTurnIndexes;
    setQueuedTurnsByConversation(nextQueues);
    setActiveTurnIndexes(nextActiveTurnIndexes);
    setProcesses((current) => omitKeys(current, removedIds));
    setCompletedConversationIds((current) => current.filter((id) => !removedIds.has(id)));
    setPiStates((current) => omitKeys(current, removedIds));
    setTimelines((current) => omitKeys(current, removedIds));
  }

  function removeProject(projectId: string) {
    const project = projectsRef.current.find((item) => item.id === projectId);
    const projectConversations = conversationsRef.current.filter((conversation) => conversation.projectId === projectId);
    if (!project || projectConversations.some((conversation) => processRef.current.get(conversation.id)?.busy)) return Promise.resolve();
    const conversationIds = projectConversations.map((conversation) => conversation.id);
    const stops = conversationIds.filter((conversationId) => processRef.current.has(conversationId)).map((conversationId) => stopPiProcess(conversationId));
    return Promise.all(stops).then(() => {
      const nextPreferences = removeProjectPreference(workspacePreferencesRef.current, project.path);
      const nextProjects = projectsRef.current.filter((item) => item.id !== projectId);
      const nextConversations = conversationsRef.current.filter((conversation) => conversation.projectId !== projectId);
      workspacePreferencesRef.current = nextPreferences;
      projectsRef.current = nextProjects;
      conversationsRef.current = nextConversations;
      saveWorkspacePreferences(nextPreferences);
      clearConversationWorkspaceState(conversationIds);
      setProjects(nextProjects);
      setConversations(nextConversations);

      if (activeProjectRef.current !== projectId) return;
      const nextProject = nextProjects[0];
      if (!nextProject) {
        activeProjectRef.current = "";
        activeConversationRef.current = "";
        setActiveProjectId("");
        setActiveConversationId("");
        setActiveProjectTrustedState(false);
        setDraftState("");
        return;
      }
      const nextConversation = nextConversations.find((conversation) => conversation.projectId === nextProject.id);
      if (nextConversation) {
        selectConversation(nextConversation);
        return;
      }
      activeProjectRef.current = nextProject.id;
      activeConversationRef.current = "";
      setActiveProjectId(nextProject.id);
      setActiveConversationId("");
      setActiveProjectTrustedState(isProjectTrusted(nextPreferences, nextProject.path));
      setDraftState("");
    }).catch(() => undefined);
  }

  function archiveConversation(conversationId: string) {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation || processRef.current.get(conversationId)?.busy) return Promise.resolve();
    return stopPiProcess(conversationId).then(() => {
      if (editingQueuedTurnRef.current?.conversationId === conversationId) clearQueuedTurnEditing();
      const nextPreferences = archiveConversationPreference(workspacePreferencesRef.current, conversationId);
      workspacePreferencesRef.current = nextPreferences;
      saveWorkspacePreferences(nextPreferences);
      setPinnedConversationIds(nextPreferences.pinnedConversationIds);
      const nextConversations = conversationsRef.current.filter((item) => item.id !== conversationId);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      clearConversationWorkspaceState([conversationId]);
      if (activeConversationRef.current !== conversationId) return;
      const nextConversation = nextConversations.find((item) => item.projectId === conversation.projectId);
      if (nextConversation) {
        selectConversation(nextConversation);
        return;
      }
      activeConversationRef.current = "";
      setActiveConversationId("");
      setDraftState("");
    }).catch(() => undefined);
  }

  function setConversationPinned(conversationId: string, pinned: boolean) {
    if (!conversationsRef.current.some((conversation) => conversation.id === conversationId)) return;
    const nextPreferences = setConversationPinnedPreference(workspacePreferencesRef.current, conversationId, pinned);
    const nextConversations = sortConversationsByPinned(conversationsRef.current, nextPreferences.pinnedConversationIds);
    workspacePreferencesRef.current = nextPreferences;
    conversationsRef.current = nextConversations;
    saveWorkspacePreferences(nextPreferences);
    setPinnedConversationIds(nextPreferences.pinnedConversationIds);
    setConversations(nextConversations);
  }

  function renameConversation(conversationId: string, name: string) {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    const nextName = name.trim().slice(0, 256);
    if (!conversation || !nextName || nextName === conversation.title) return Promise.resolve();
    const persist = conversation.sessionFile
      ? renamePiSession(conversation.sessionFile, nextName)
      : ensureProcess(conversation).then(() => sendRpcCommand(conversationId, { type: "set_session_name", name: nextName }));
    return persist
      .then(() => {
        const nextConversations = conversationsRef.current.map((item) => item.id === conversationId ? { ...item, title: nextName } : item);
        conversationsRef.current = nextConversations;
        setConversations(nextConversations);
      })
      .catch(() => undefined);
  }

  function updateConversationSummary(conversation: ConversationRecord, text: string, modifiedAt: string) {
    const nextConversations = sortConversationsByPinned(conversationsRef.current.map((item) => item.id === conversation.id ? { ...item, title: item.title === "新对话" ? text.slice(0, 22) : item.title, preview: text, time: "刚刚", modifiedAt } : item), workspacePreferencesRef.current.pinnedConversationIds);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
  }

  function executeConversationTurn(conversation: ConversationRecord, text: string, beforeRun: TurnPreparation | undefined, commandType: "prompt" | "steer") {
    const messageId = Date.now();
    const turnIndex = (timelinesRef.current[conversation.id] ?? []).filter((item) => item.type === "user").length;
    const executionEpoch = conversationExecutionEpochRef.current.get(conversation.id) ?? 0;
    const ensureExecutionActive = () => {
      if ((conversationExecutionEpochRef.current.get(conversation.id) ?? 0) !== executionEpoch) throw CANCELLED_CONVERSATION_EXECUTION;
    };
    const submittedTurn = { conversationId: conversation.id, turnIndex, prompt: text };
    appendTimeline(conversation.id, { id: `u-${messageId}-${turnIndex}`, type: "user", text, time: formatMessageTime(Date.now()) });
    setActiveTurnIndex(conversation.id, turnIndex);

    if (!runtimeIsTauri) {
      appendTimeline(conversation.id, { id: `a-${messageId + 1}`, type: "assistant", text: "当前为浏览器预览。请使用 Tauri 运行 Pi 进程。", time: "桌面运行时" });
      setActiveTurnIndex(conversation.id, null);
      return { submittedTurn, execution: Promise.resolve() };
    }

    const execution = (beforeRun ? beforeRun(submittedTurn) : Promise.resolve())
      .then(() => {
        ensureExecutionActive();
        return ensureProcess(conversation);
      })
      .then(() => {
        ensureExecutionActive();
        return sendRpcCommand(conversation.id, { type: commandType, message: text });
      })
      .then(() => undefined)
      .catch((reason) => {
        setActiveTurnIndex(conversation.id, null);
        if (reason === CANCELLED_CONVERSATION_EXECUTION || (conversationExecutionEpochRef.current.get(conversation.id) ?? 0) !== executionEpoch) return;
        appendRuntimeError(conversation.id, reason instanceof Error ? reason.message : String(reason), createPiCommandId(commandType === "steer" ? "steer-error" : "send-error"));
        flushPendingManualSteers(conversation.id, "prompt");
        pumpConversationQueue(conversation.id);
        return Promise.reject(reason);
      });

    return { submittedTurn, execution };
  }

  function flushPendingManualSteers(conversationId: string, commandType: "prompt" | "steer") {
    if (pausedConversationQueuesRef.current.has(conversationId)) return;
    const pending = pendingManualSteersRef.current.get(conversationId) ?? [];
    if (!pending.length) return;
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) {
      pendingManualSteersRef.current.delete(conversationId);
      return;
    }

    const dispatches = commandType === "prompt" ? pending.slice(0, 1) : pending;
    const remaining = commandType === "prompt" ? pending.slice(1) : [];
    if (remaining.length) pendingManualSteersRef.current.set(conversationId, remaining);
    else pendingManualSteersRef.current.delete(conversationId);

    dispatches.forEach(({ turn, beforeRun }) => {
      const { execution } = executeConversationTurn(conversation, turn.prompt, beforeRun, commandType);
      execution.catch(() => undefined);
    });
  }

  function pumpConversationQueue(conversationId: string) {
    if (!conversationId || pausedConversationQueuesRef.current.has(conversationId) || queueDispatchingRef.current.has(conversationId)) return;
    const queue = queuedTurnsRef.current[conversationId] ?? [];
    const nextTurn = queue[0];
    if (!nextTurn) return;
    if (editingQueuedTurnRef.current?.conversationId === conversationId && editingQueuedTurnRef.current.turnId === nextTurn.id) return;

    const runtimeBusy = Boolean(processRef.current.get(conversationId)?.busy);
    const preparingTurn = !runtimeBusy && activeTurnIndexesRef.current[conversationId] !== undefined;
    if (preparingTurn) return;
    if (runtimeBusy) return;

    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) return;

    patchConversationQueue(conversationId, (turns) => turns.slice(1));
    queueDispatchingRef.current.add(conversationId);
    const beforeRun = queuedTurnPreparationsRef.current.get(nextTurn.id);
    queuedTurnPreparationsRef.current.delete(nextTurn.id);

    const { execution } = executeConversationTurn(conversation, nextTurn.prompt, beforeRun, "prompt");
    execution
      .catch(() => undefined)
      .finally(() => {
        queueDispatchingRef.current.delete(conversationId);
        pumpConversationQueue(conversationId);
      });
  }

  function sendMessage(beforeRun?: TurnPreparation) {
    const text = draft.trim();
    if (!text || !activeProject.id) return;
    const modifiedAt = new Date().toISOString();
    const conversation = activeConversation ?? { id: createPiCommandId("conversation"), projectId: activeProjectId, title: text.slice(0, 22), preview: text, time: "刚刚", modifiedAt };

    if (!activeConversation) {
      const nextConversations = sortConversationsByPinned([conversation, ...conversationsRef.current], workspacePreferencesRef.current.pinnedConversationIds);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      activeConversationRef.current = conversation.id;
      setActiveConversationId(conversation.id);
      setTimelines((current) => ({ ...current, [conversation.id]: current[conversation.id] ?? [] }));
    }

    const editing = editingQueuedTurnRef.current;
    if (editing?.conversationId === conversation.id) {
      const queue = queuedTurnsRef.current[conversation.id] ?? [];
      const turnIndex = queue.findIndex((turn) => turn.id === editing.turnId);
      if (turnIndex < 0) {
        clearQueuedTurnEditing();
        appendRuntimeError(conversation.id, "待编辑的队列任务不存在", createPiCommandId("queue-edit-error"));
        return;
      }
      if (beforeRun) queuedTurnPreparationsRef.current.set(editing.turnId, beforeRun);
      patchConversationQueue(conversation.id, (turns) => turns.map((turn) => turn.id === editing.turnId ? { ...turn, prompt: text } : turn));
      clearQueuedTurnEditing();
      updateConversationSummary(conversation, text, modifiedAt);
      setDraft("");
      pumpConversationQueue(conversation.id);
      return {
        conversationId: conversation.id,
        turnIndex: (timelinesRef.current[conversation.id] ?? []).filter((item) => item.type === "user").length + turnIndex,
        prompt: text,
      } satisfies SubmittedConversationTurn;
    }

    updateConversationSummary(conversation, text, modifiedAt);
    setDraft("");

    const currentQueue = queuedTurnsRef.current[conversation.id] ?? [];
    const busy = Boolean(
      processRef.current.get(conversation.id)?.busy
      || activeTurnIndexesRef.current[conversation.id] !== undefined
      || queueDispatchingRef.current.has(conversation.id)
      || currentQueue.length,
    );

    if (busy) {
      const queuedTurn: QueuedConversationTurn = {
        id: createPiCommandId("queue"),
        conversationId: conversation.id,
        prompt: text,
        createdAt: Date.now(),
      };
      queuedTurnPreparationsRef.current.set(queuedTurn.id, beforeRun);
      patchConversationQueue(conversation.id, (turns) => [...turns, queuedTurn]);
      pumpConversationQueue(conversation.id);
      return {
        conversationId: conversation.id,
        turnIndex: (timelinesRef.current[conversation.id] ?? []).filter((item) => item.type === "user").length + currentQueue.length,
        prompt: text,
      } satisfies SubmittedConversationTurn;
    }

    const { submittedTurn, execution } = executeConversationTurn(conversation, text, beforeRun, "prompt");
    execution.catch(() => undefined);
    return submittedTurn;
  }

  function reorderQueuedTurn(sourceId: string, targetId: string, conversationId = activeConversationId) {
    if (!conversationId) return;
    if (editingQueuedTurnRef.current?.conversationId === conversationId) return;
    patchConversationQueue(conversationId, (turns) => reorderConversationQueue(turns, sourceId, targetId));
  }

  function removeQueuedTurn(turnId: string, conversationId = activeConversationId) {
    if (!conversationId) return;
    if (editingQueuedTurnRef.current?.conversationId === conversationId) return;
    queuedTurnPreparationsRef.current.delete(turnId);
    patchConversationQueue(conversationId, (turns) => turns.filter((turn) => turn.id !== turnId));
  }

  function steerQueuedTurn(turnId: string, conversationId = activeConversationId) {
    if (!conversationId) return;
    if (editingQueuedTurnRef.current?.conversationId === conversationId) return;
    const selected = (queuedTurnsRef.current[conversationId] ?? []).find((turn) => turn.id === turnId);
    if (!selected) return;
    patchConversationQueue(conversationId, (turns) => turns.filter((turn) => turn.id !== turnId));
    const beforeRun = queuedTurnPreparationsRef.current.get(turnId);
    queuedTurnPreparationsRef.current.delete(turnId);

    const runtimeBusy = Boolean(processRef.current.get(conversationId)?.busy);
    const preparingTurn = !runtimeBusy && activeTurnIndexesRef.current[conversationId] !== undefined;
    if (preparingTurn) {
      const pending = pendingManualSteersRef.current.get(conversationId) ?? [];
      pendingManualSteersRef.current.set(conversationId, [...pending, { turn: selected, beforeRun }]);
      return;
    }

    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) return;
    const { execution } = executeConversationTurn(conversation, selected.prompt, beforeRun, runtimeBusy ? "steer" : "prompt");
    execution.catch(() => undefined);
  }

  function editQueuedTurn(turnId: string, conversationId = activeConversationId) {
    if (!conversationId || editingQueuedTurnRef.current) return;
    const turn = (queuedTurnsRef.current[conversationId] ?? []).find((item) => item.id === turnId);
    if (!turn) return;
    const editing = { conversationId, turnId };
    editingQueuedTurnRef.current = editing;
    setEditingQueuedTurn(editing);
    setDraft(turn.prompt);
  }

  function abortConversation(conversationId = activeConversationId) {
    if (!conversationId || !runtimeIsTauri) return;
    conversationExecutionEpochRef.current.set(conversationId, (conversationExecutionEpochRef.current.get(conversationId) ?? 0) + 1);
    if ((queuedTurnsRef.current[conversationId] ?? []).length || pendingManualSteersRef.current.has(conversationId)) pausedConversationQueuesRef.current.add(conversationId);
    else pausedConversationQueuesRef.current.delete(conversationId);
    setActiveTurnIndex(conversationId, null);
    sendRpcCommand(conversationId, { type: "abort" }).then(() => patchProcess(conversationId, { busy: false })).catch(() => undefined);
  }

  function setConversationModel(modelKey: string) {
    const state = piStates[activeConversationId];
    const model = state?.availableModels.find((item) => `${item.provider}/${item.id}` === modelKey);
    if (!model) return;
    sendRpcCommand(activeConversationId, { type: "set_model", provider: model.provider, modelId: model.id })
      .then(() => syncPiState(activeConversationId))
      .catch(() => undefined);
  }

  function setConversationThinkingLevel(level: string) {
    if (!level) return;
    sendRpcCommand(activeConversationId, { type: "set_thinking_level", level })
      .then(() => syncPiState(activeConversationId))
      .catch(() => undefined);
  }

  function updateActiveProjectTrusted(trusted: boolean) {
    if (!activeProject.path) return Promise.resolve();
    const nextPreferences = setProjectTrustedPreference(workspacePreferencesRef.current, activeProject.path, trusted);
    workspacePreferencesRef.current = nextPreferences;
    saveWorkspacePreferences(nextPreferences);
    setActiveProjectTrustedState(trusted);
    return restartIdleProjectProcesses(activeProject, trusted);
  }

  function respondToExtensionUi(response: Omit<PiExtensionResponse, "type"> | PiExtensionResponse) {
    if (!activeConversationId || !runtimeIsTauri) return Promise.resolve();
    const payload = "type" in response ? response : { type: "extension_ui_response", ...response };
    return sendRpcCommand(activeConversationId, payload, { expectsResponse: false })
      .then(() => setConversationState(activeConversationId, (state) => clearActiveExtensionRequest(state, payload.id)))
      .catch((reason) => {
        appendRuntimeError(activeConversationId, reason instanceof Error ? reason.message : String(reason), createPiCommandId("extension-response-error"));
      });
  }

  return {
    projects,
    conversations,
    pinnedConversationIds,
    activeProject,
    activeProjectTrusted,
    activeConversation,
    activeProjectConversations,
    activeConversationId,
    activeExtensionRequest: activeConversationState.activeExtensionRequest,
    extensionNotifications: activeConversationState.extensionNotifications,
    extensionStatuses: Object.entries(activeConversationState.extensionStatuses).map(([statusKey, statusText]) => ({ id: `status-${statusKey}`, statusKey, statusText })),
    extensionWidgets: Object.values(activeConversationState.extensionWidgets).map((widget) => ({ id: `widget-${widget.key}`, widgetKey: widget.key, widgetLines: widget.lines, widgetPlacement: widget.placement })),
    timeline,
    draft,
    queuedTurns,
    editingQueuedTurnId,
    isLoading,
    runtimeIsTauri,
    processes,
    activeTurnIndexes,
    completedConversationIds,
    conversationState: activeConversationState,
    setDraft,
    refreshProjects,
    selectProject,
    selectConversation,
    createProject,
    removeProject,
    createConversation,
    archiveConversation,
    renameConversation,
    setConversationPinned,
    sendMessage,
    reorderQueuedTurn,
    removeQueuedTurn,
    steerQueuedTurn,
    editQueuedTurn,
    abortConversation,
    setConversationModel,
    setConversationThinkingLevel,
    setActiveProjectTrusted: updateActiveProjectTrusted,
    respondToExtensionUi,
  };
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function omitKeys<T>(record: Record<string, T>, keys: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key))) as Record<string, T>;
}

function upsertItem(items: TimelineItem[], item: TimelineItem) {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((current, currentIndex) => currentIndex === index ? item : current);
}

function replaceTimelineSegment(items: TimelineItem[], previousIds: string[], insertAt: number, nextItems: TimelineItem[]) {
  const previousIdSet = new Set(previousIds);
  const filtered = items.filter((item) => !previousIdSet.has(item.id));
  const nextInsertAt = Math.min(insertAt, filtered.length);
  return [...filtered.slice(0, nextInsertAt), ...nextItems, ...filtered.slice(nextInsertAt)];
}

function buildToolItemId(conversationId: string, toolCallId: string, messageKey: string, contentIndex: number, name: string) {
  return toolCallId ? `pi-tool-${conversationId}-${toolCallId}` : `${messageKey}-tool-${contentIndex}-${name}`;
}

function parseContentIndex(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function runtimeMessageTime(message: Record<string, unknown>) {
  const raw = message.timestamp;
  return typeof raw === "string" || typeof raw === "number" ? formatMessageTime(raw) : "刚刚";
}

function formatArguments(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}
