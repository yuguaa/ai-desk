import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Info, LayoutList, ShieldCheck, TriangleAlert } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/textarea";
import type { PiExtensionResponse } from "@/lib/pi-runtime";

type ExtensionUiRequest = {
  id: string;
  method: "select" | "confirm" | "input" | "editor";
  title: string;
  message: string;
  options: string[];
  placeholder: string;
  prefill: string;
  timeout?: number;
};

type ExtensionNotification = {
  id: string;
  message: string;
  level: "info" | "warning" | "error";
};

type ExtensionStatus = {
  id: string;
  label: string;
  text: string;
};

type ExtensionWidget = {
  id: string;
  title: string;
  placement: string;
  lines: string[];
};

export function ExtensionUiPanel({ request, notifications, statuses, widgets, onRespond }: { request: unknown; notifications: unknown[]; statuses: unknown[]; widgets: unknown[]; onRespond: (response: PiExtensionResponse) => void }) {
  const dialogRequest = useMemo(() => normalizeRequest(request), [request]);
  const normalizedNotifications = useMemo(() => notifications.map(normalizeNotification).filter((item): item is ExtensionNotification => item !== null), [notifications]);
  const normalizedStatuses = useMemo(() => statuses.map(normalizeStatus).filter((item): item is ExtensionStatus => item !== null), [statuses]);
  const normalizedWidgets = useMemo(() => widgets.map(normalizeWidget).filter((item): item is ExtensionWidget => item !== null), [widgets]);
  const [draft, setDraft] = useState(dialogRequest?.prefill ?? "");
  const onRespondRef = useRef(onRespond);
  onRespondRef.current = onRespond;

  useEffect(() => {
    setDraft(dialogRequest?.prefill ?? "");
  }, [dialogRequest?.id, dialogRequest?.prefill]);

  useEffect(() => {
    if (!dialogRequest?.timeout) return;
    const timeoutId = window.setTimeout(() => {
      onRespondRef.current({ type: "extension_ui_response", id: dialogRequest.id, cancelled: true });
    }, dialogRequest.timeout);
    return () => window.clearTimeout(timeoutId);
  }, [dialogRequest?.id, dialogRequest?.timeout]);

  if (!dialogRequest && !normalizedNotifications.length && !normalizedStatuses.length && !normalizedWidgets.length) return null;

  return <section className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]" aria-label="扩展交互面板">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-[var(--container-padding-loose)] py-[var(--container-padding-tight)]">
      {normalizedStatuses.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        {normalizedStatuses.map((status) => <Badge key={status.id} variant="outline" className="gap-1.5"><LayoutList className="size-3 text-[var(--accent)]" /><span className="font-medium text-[var(--text-primary)]">{status.label}</span><span className="text-[var(--text-secondary)]">{status.text}</span></Badge>)}
      </div>}
      {normalizedNotifications.length > 0 && <div className="flex flex-col gap-1">
        {normalizedNotifications.map((notification) => <div key={notification.id} className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2.5 py-2 text-[var(--font-size-11)] text-[var(--text-secondary)]">
          <span className={notification.level === "error" ? "text-[var(--error)]" : notification.level === "warning" ? "text-[var(--warning)]" : "text-[var(--accent)]"}>{notification.level === "error" ? <TriangleAlert className="size-3.5" /> : notification.level === "warning" ? <Bell className="size-3.5" /> : <Info className="size-3.5" />}</span>
          <span className="leading-5">{notification.message}</span>
        </div>)}
      </div>}
      {normalizedWidgets.length > 0 && <div className="flex flex-col gap-2">
        {normalizedWidgets.map((widget) => <div key={widget.id} className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2.5 py-2">
          <div className="flex items-center gap-2 text-[var(--font-size-10-5)] text-[var(--text-tertiary)]"><ShieldCheck className="size-3 text-[var(--accent)]" /><span className="font-medium text-[var(--text-secondary)]">{widget.title}</span><span className="ml-auto uppercase">{widget.placement}</span></div>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[var(--font-size-10-5)] leading-5 text-[var(--text-secondary)]">{widget.lines.join("\n")}</pre>
        </div>)}
      </div>}
      {dialogRequest && <div className="rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[var(--bg-surface-raised)] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2"><span className="text-[var(--font-size-11-5)] font-medium text-[var(--text-primary)]">{dialogRequest.title}</span><Badge variant="secondary">{dialogMethodLabel(dialogRequest.method)}</Badge></div>
        {dialogRequest.message && <p className="mt-1 text-[var(--font-size-11)] leading-5 text-[var(--text-secondary)]">{dialogRequest.message}</p>}
        <ExtensionRequestBody request={dialogRequest} draft={draft} onDraftChange={setDraft} onRespond={onRespond} />
      </div>}
    </div>
  </section>;
}

function ExtensionRequestBody({ request, draft, onDraftChange, onRespond }: { request: ExtensionUiRequest; draft: string; onDraftChange: (value: string) => void; onRespond: (response: PiExtensionResponse) => void }) {
  if (request.method === "select") return <div className="mt-2 flex flex-wrap gap-2">
    {request.options.map((option) => <Button key={option} type="button" variant="outline" size="sm" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, value: option })}>{option}</Button>)}
    <Button type="button" variant="ghost" size="sm" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, cancelled: true })}>取消</Button>
  </div>;

  if (request.method === "confirm") return <div className="mt-2 flex flex-wrap gap-2">
    <Button type="button" size="sm" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, confirmed: true })}>确认</Button>
    <Button type="button" variant="outline" size="sm" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, confirmed: false })}>拒绝</Button>
    <Button type="button" variant="ghost" size="sm" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, cancelled: true })}>关闭</Button>
  </div>;

  const isEditor = request.method === "editor";
  return <form
    className="mt-2 flex flex-col gap-2"
    onSubmit={(event) => {
      event.preventDefault();
      onRespond({ type: "extension_ui_response", id: request.id, value: draft });
    }}
  >
    {isEditor
      ? <Textarea value={draft} placeholder={request.placeholder} className="min-h-32" onChange={(event) => onDraftChange(event.target.value)} />
      : <Input value={draft} placeholder={request.placeholder} onChange={(event) => onDraftChange(event.target.value)} />}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="sm">提交</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, cancelled: true })}>取消</Button>
    </div>
  </form>;
}

function dialogMethodLabel(method: ExtensionUiRequest["method"]) {
  return method === "select" ? "选择" : method === "confirm" ? "确认" : method === "input" ? "输入" : "编辑";
}

function normalizeRequest(value: unknown): ExtensionUiRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const method = candidate.method;
  if (method !== "select" && method !== "confirm" && method !== "input" && method !== "editor") return null;

  return {
    id: textValue(candidate.id) || `extension-ui-${method}`,
    method,
    title: textValue(candidate.title) || dialogMethodLabel(method),
    message: textValue(candidate.message),
    options: Array.isArray(candidate.options) ? candidate.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0) : [],
    placeholder: textValue(candidate.placeholder),
    prefill: textValue(candidate.prefill),
    timeout: typeof candidate.timeout === "number" && candidate.timeout > 0 ? candidate.timeout : undefined,
  };
}

function normalizeNotification(value: unknown): ExtensionNotification | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const message = textValue(candidate.message) || textValue(candidate.text);
  if (!message) return null;
  const level = candidate.notifyType === "warning" || candidate.notifyType === "error" ? candidate.notifyType : candidate.level === "warning" || candidate.level === "error" ? candidate.level : "info";
  return { id: textValue(candidate.id) || `notification-${message}`, message, level };
}

function normalizeStatus(value: unknown): ExtensionStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const text = textValue(candidate.statusText) || textValue(candidate.text);
  if (!text) return null;
  return {
    id: textValue(candidate.id) || textValue(candidate.statusKey) || `status-${text}`,
    label: textValue(candidate.title) || textValue(candidate.statusKey) || "扩展状态",
    text,
  };
}

function normalizeWidget(value: unknown): ExtensionWidget | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const lines = Array.isArray(candidate.widgetLines) ? candidate.widgetLines.filter((line): line is string => typeof line === "string") : Array.isArray(candidate.lines) ? candidate.lines.filter((line): line is string => typeof line === "string") : [];
  if (!lines.length) return null;
  return {
    id: textValue(candidate.id) || textValue(candidate.widgetKey) || `widget-${lines.join("-")}`,
    title: textValue(candidate.title) || textValue(candidate.widgetKey) || "扩展小组件",
    placement: textValue(candidate.widgetPlacement) || "panel",
    lines,
  };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
