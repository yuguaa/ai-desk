# pi-coding-agent GUI 封装调研

> 调研时间：2026-08-27
> Pi 基线：`@earendil-works/pi-coding-agent@0.84.3`
> 源码基线：`earendil-works/pi@e86823096c5bad39e1ca282ec24bc5eb9bec745b`

## 结论先行

针对“用 Tauri + React 封装一个界面接近 Codex 的本地桌面客户端”，最短且与官方边界一致的实现是：

```text
React WebView
  │ Tauri commands / events
  ▼
Rust 进程管理与协议适配层
  │ stdin/stdout，严格 LF 分隔 JSONL
  ▼
Pi 官方独立二进制 sidecar
  └─ pi --mode rpc --session-dir <app-managed-dir>
```

选择这一方案的直接依据是：

- Pi 官方明确将 RPC 模式定义为面向“其他应用、IDE、自定义 UI”的无头集成方式，并明确建议非 Node.js 集成使用 RPC。[来源：RPC 文档](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md)
- Tauri 官方把随应用捆绑、无需用户额外安装 Node.js/Python 的外部可执行文件称为 sidecar，并支持 Rust 侧读取 stdout、写入 stdin、向前端发事件。[来源：Tauri Sidecar 文档](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/develop/sidecar.mdx)
- Pi 的 GitHub Release 已提供 macOS、Linux、Windows 的 x64/ARM64 独立二进制，适合按 Tauri target triple 随安装包分发。[来源：Pi v0.84.3 Release](https://github.com/earendil-works/pi/releases/tag/v0.84.3)

不建议首版直接采用 `@earendil-works/pi-client` / `pi-protocol` / `pi-server`：它们使用 CBOR 多会话协议，方向上适合长期的多会话/远程架构，但官方将协议和 Server 明确标为实验性，且 `pi-server` 不提供可直接运行的 coding-agent 服务，应用仍需自行实现 `PiServerService`。[来源：pi-client README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/client/README.md)；[来源：pi-protocol README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/protocol/README.md)；[来源：pi-server README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/server/README.md)

## 项目身份与当前状态

- 官方仓库当前是 [`earendil-works/pi`](https://github.com/earendil-works/pi)，项目自述为 Pi Agent Harness，核心包包括统一 LLM API、Agent runtime、coding agent CLI 和 TUI。[来源：仓库 README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/README.md)
- 当前正式 npm 包名是 [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)，调研时最新版为 `0.84.3`，要求 Node.js `>=22.19.0`，许可证为 MIT。[来源：package.json](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/package.json)
- 旧包 [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) 已停在 `0.73.1`，npm deprecation 信息要求迁移至 `@earendil-works/pi-coding-agent`。新项目不应继续依赖旧包。[来源：npm Registry 旧包页](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- `v0.84.3` 发布于 2026-08-24，官方 Release 包含 `darwin/linux/windows` 的 `x64/arm64` 二进制以及 SHA256 校验文件。[来源：v0.84.3 Release](https://github.com/earendil-works/pi/releases/tag/v0.84.3)
- Pi 是“最小终端 coding harness”，默认只内置 `read`、`write`、`edit`、`bash` 四个模型工具；它刻意不把 sub-agent、plan mode、permission popup、todo、background bash 做成核心能力，而是鼓励通过扩展或包自行构造工作流。[来源：coding-agent README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/README.md)

## 运行模型与可嵌入边界

Pi 官方提供四种运行方式：[来源：coding-agent README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/README.md)

1. `interactive`：终端 TUI。
2. `print` / `json`：非交互单次运行或 JSON 事件输出。
3. `rpc`：通过 stdin/stdout JSONL 做进程集成。
4. SDK：在 Node.js/TypeScript 进程内直接创建 Agent session。

### SDK

主包直接导出 SDK，不需要额外安装 SDK 包。核心入口是 `createAgentSession()`；需要新建、切换、fork、导入会话等会替换当前 Session 的能力时，使用 `createAgentSessionRuntime()` / `AgentSessionRuntime`。[来源：SDK 文档](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/sdk.md)

SDK 暴露的关键能力包括：

- `prompt`、`steer`、`followUp`、`abort`；
- 事件订阅和流式消息；
- 设置/轮换模型与 thinking level；
- 上下文压缩；
- Session tree 导航；
- Session、Settings、ResourceLoader；
- 内置工具工厂、自定义工具、扩展、skills、prompt templates。

SDK 更适合已有 Node.js 后端的应用。Tauri 的 WebView 前端不是 Node.js 运行时，而 `pi-coding-agent` 本身要求 Node.js `>=22.19.0`，因此不能把该 npm 包当成普通浏览器包直接放进 React 渲染层。[来源：package.json](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/package.json)

如决定使用 SDK，正确形态仍然是将其放进单独的 Node/Bun sidecar，再让 Tauri 与该 sidecar 通信；这会比直接使用官方 RPC 多维护一层自定义协议，因此不适合作为首版最短路径。

### RPC

启动方式：

```bash
pi --mode rpc [options]
```

协议规则：

- stdin 每行一条 command JSON；
- stdout 同时输出带 `type: "response"` 的响应和持续流式 event；
- command 可带 `id` 做请求/响应关联；
- framing 是严格 JSONL，只允许字节 `LF (\n)` 作为记录分隔符；输入可接受 `CRLF`，但解析器只能按 `\n` 切分；
- 官方特别警告不要使用会把 `U+2028/U+2029` 当换行的通用 line reader。[来源：RPC Framing](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#framing)

因此 Rust 适配层应维护 stdout 字节缓冲区，按 `0x0A` 增量切帧，再做 UTF-8/JSON 解析；不要把每次 stdout callback 误当成完整 JSON。

RPC 已覆盖实现 Codex 风格主界面所需的大部分能力：[来源：RPC 命令与事件](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md)

- 对话：`prompt`、`steer`、`follow_up`、`abort`、`clear_queue`；
- 状态：`get_state`、`get_messages`；
- 模型：设置/轮换模型、获取可用模型；
- 推理级别：设置/轮换/列出 thinking levels；
- 压缩和重试：手动/自动 compaction、auto retry；
- Shell：运行和中止 bash，流式输出；
- Session：新建、切换、fork、clone、tree、entries、统计、命名、HTML 导出；
- 命令面板：列出扩展命令、prompt templates 和 skills；
- 流式事件：文本、thinking、tool call、tool execution、队列、压缩、重试、扩展错误。

需要注意两处 UI 实现约束：

- `prompt` 的成功响应只表示请求已接受、入队或立即处理，不表示本轮 Agent 已经结束；`agent_end` 后还可能发生自动重试、压缩重试或队列续跑。界面应以 `agent_settled` 作为“不会再自动继续”的稳定结束信号。[来源：RPC prompt 与 agent_settled](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#agent_settled)
- `message_update` 提供 delta，不再提供累积 message；客户端必须基于 `message_start` 与 `contentIndex` 组装临时消息，以 `message_end.message` 为最终权威状态。[来源：RPC message_update](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#message_update-streaming)
- `tool_execution_update.partialResult` 是“截至当前的累积结果”，不是 delta；React store 应替换对应 tool call 的显示内容，而不是继续拼接。[来源：RPC tool execution events](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#tool_execution_start--tool_execution_update--tool_execution_end)

## Provider、模型与认证

Pi 自带 provider catalog，并会自动刷新可用的 tool-capable 模型。用户可使用 `/model` 或 RPC API 选择模型。[来源：coding-agent README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/README.md#providers--models)

官方内置的订阅登录至少包括：

- ChatGPT Plus/Pro（Codex）；
- Claude Pro/Max；
- GitHub Copilot；
- xAI、OpenRouter、Radius。

API Key provider 包括 Anthropic、OpenAI、Azure OpenAI、DeepSeek、Google Gemini/Vertex、Amazon Bedrock、Mistral、Groq、Cerebras、xAI、OpenRouter、Vercel AI Gateway、Cloudflare、Hugging Face 等。[来源：Providers 文档](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/providers.md)

认证数据默认保存在 `~/.pi/agent/auth.json`，OAuth token 会自动刷新；文件创建权限为 `0600`，auth file 的凭据优先于环境变量。[来源：Providers / Auth File](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/providers.md#auth-file)

GUI 不应把 provider key 复制到 React localStorage。RPC command union 没有登录/退出命令，`get_commands` 也不包含 `/login`、`/model`、`/settings` 等仅由 interactive mode 处理的内建 TUI 命令。[来源：RPC command types](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/src/modes/rpc/rpc-types.ts)；[来源：RPC get_commands](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#get_commands)

因此首版 API Key 可通过 Tauri 安全存储或 Pi auth file 管理，再由 Rust 以环境变量传给 sidecar；订阅/OAuth 登录若要完全原生化，需要额外使用 SDK 的 `ModelRuntime` 认证 API 做 helper，不能假设 RPC extension UI 会自动补齐登录。[来源：SDK API Keys and OAuth](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/sdk.md#api-keys-and-oauth)

## Session 数据模型

Pi 会话自动保存在 `~/.pi/agent/sessions/` 下，以工作目录分组，每个会话是 JSONL 文件。[来源：Sessions 文档](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/sessions.md)

当前 Session format 是 v3：

- 第一行是 Session header；
- 后续 entry 通过稳定的 `id` / `parentId` 组成 append-only tree；
- 记录 user、assistant、tool result、bash execution、模型变更、thinking level 变更、compaction summary、branch summary 和扩展自定义 entry；
- 同一文件可以原地分支，当前 leaf 表示活跃路径；
- `/fork` 与 `/clone` 则创建新会话文件。[来源：Session File Format](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/session-format.md)

这与 Codex 风格任务栏/时间线较匹配：

- 左侧任务列表：Session header、名称、cwd、更新时间；
- 主区：当前 active branch 的消息；
- 分支/回溯 UI：`get_tree`、`get_entries`、`fork`、`clone`；
- token/cost/context 状态：`get_session_stats`。

RPC 文档没有提供全局 `list_sessions` 命令。首版若要做 Codex 式任务列表，需要由 Tauri 读取配置的 `sessionDir`，仅解析每个 JSONL 的 header 和必要 metadata；打开任务后再通过 `--session <path|id>` 或 `switch_session` 让 Pi 负责完整加载与迁移。不要在 React 侧实现完整 Session 语义。

并发推论：一个 RPC 进程只有一个“当前 Session”。若 GUI 允许多个任务同时执行，最直接的实现是每个运行中任务各自持有一个 Pi RPC sidecar；已停止的任务只保留磁盘 Session，重新打开时再拉起进程。该结论是根据 RPC 的单 active-session 状态和 session-switch API 推导，不是官方规定的唯一部署形态。[支持来源：RPC State/Session](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#state)

## 扩展、Skills 与 Pi Packages

Pi 的主要扩展面：

- Extensions：TypeScript 模块，可监听生命周期/工具/输入/模型/Session 事件，注册工具、命令、快捷键、provider、消息 renderer 和 UI 行为；
- Skills：包含 `SKILL.md` 的指令包，可作为 `/skill:name` 命令调用；
- Prompt Templates：Markdown 模板；
- Themes：TUI 主题 JSON；
- Pi Packages：通过 npm、git 或本地路径打包分发上述资源。[来源：Extensions](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/extensions.md)；[来源：Skills](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/skills.md)；[来源：Pi Packages](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/packages.md)

Pi Package 的约定目录为 `extensions/`、`skills/`、`prompts/`、`themes/`；也可在 `package.json` 的 `pi` 字段显式声明 glob。包可从 npm、git、绝对/相对本地路径安装。[来源：Pi Packages](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/packages.md)

安全边界必须在 GUI 中明确展示：Pi Packages/Extensions 具有当前用户的完整系统权限，官方要求安装第三方包前审查源码。[来源：Pi Packages Security](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/packages.md#install-and-manage)

### RPC 下的扩展 UI

RPC 模式不是完全丢弃扩展 UI。官方定义了 `extension_ui_request` / `extension_ui_response` 子协议：[来源：Extension UI Protocol](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#extension-ui-protocol)

- 需要响应：`select`、`confirm`、`input`、`editor`；
- 单向通知：`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`。

要让第三方扩展在 GUI 中可用，至少要把上述协议映射为 React dialog、toast、status、widget 和 editor state。

但 TUI 专属能力在 RPC 下会退化或不可用，例如 `custom()` 返回 `undefined`，自定义 footer/header/editor component、theme 操作等为 no-op 或失败。因此不能承诺所有现有 TUI 扩展在 GUI 中 100% 复现；GUI 应声明兼容的是 RPC Extension UI Protocol，而不是 Pi TUI component API。[来源：RPC Extension UI 限制](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md#extension-ui-protocol)

## Tauri 封装事实与约束

Tauri v2 的 sidecar 机制可以：

- 在 `tauri.conf.json > bundle.externalBin` 中声明外部二进制；
- 按目标平台使用 `-$TARGET_TRIPLE` 后缀准备二进制；
- 从 Rust 启动子进程、接收 stdout/stderr/exit 事件并写 stdin；
- 由 Rust 再通过 Tauri event 把流式事件发给 React。[来源：Tauri Sidecar](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/develop/sidecar.mdx)

Tauri Shell plugin 默认阻止危险命令和 scope，必须在 capability 中显式开放。Pi sidecar 只应开放固定二进制与固定参数形态，不应把任意 shell command 暴露给 WebView。[来源：Tauri Shell Permissions](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/plugin/shell.mdx#permissions)

推荐由 Rust 而不是 React 直接持有 Pi 子进程，原因是：

- 进程生命周期、stdin 串行写入、stdout 增量 framing、崩溃重启集中在一个可信边界；
- React 只能调用语义化 command，例如 `start_task`、`prompt`、`abort`、`switch_model`；
- capability 无需给 WebView 开放通用 shell spawn 权限；
- Tauri 官方也说明 capability 只能减少前端被攻破后的影响，不能约束恶意/不安全的 Rust 代码，因此 Rust command 仍需严格验证路径、taskId 和参数。[来源：Tauri Capabilities / Security Boundaries](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/security/capabilities.mdx#security-boundaries)

## Vercel 的定位

这里需要区分“Vercel 托管”和“Vercel AI SDK”：

- 如果指 Vercel 托管：Tauri 桌面应用的 React 资源最终随安装包本地运行；Vercel 可以用于官网、下载页、更新元数据或纯 Web 只读界面，但无法代替本机 Pi sidecar 去访问用户工作区和执行本地工具。
- 如果指 Vercel AI SDK：它可以服务于 React chat UI 的状态/组件组织，但 Pi RPC 已经有自己的 message、thinking、tool、queue、compaction、session tree 和 extension UI 协议。两者不是即插即用；必须写 Pi RPC → UI state adapter。为保持最短链路，首版建议直接用 React store 消费 Pi RPC 事件，不再引入第二套 Agent runtime/stream protocol。[来源：Pi RPC](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md)；[来源：Vercel AI SDK](https://ai-sdk.dev/docs/introduction)

Vercel AI Gateway 已经是 Pi 的一个内置 provider 选项；如果“Vercel”指模型网关，可以直接通过 `AI_GATEWAY_API_KEY` 交给 Pi 配置，无需 GUI 自己再次实现模型调用。[来源：Pi Providers](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/providers.md)

## 安全与产品边界

Pi 官方明确说明：[来源：Pi Security](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/security.md)

- Pi 没有内置 sandbox；
- 工具和扩展以启动 Pi 的用户权限运行；
- Project Trust 只控制项目本地 settings/resources/extensions 是否加载，不是运行时权限系统；
- 非交互的 RPC 模式不会弹出 trust prompt，缺少已保存决定时，`defaultProjectTrust: ask` 与 `never` 都会忽略项目资源；可用 `--approve` / `--no-approve` 覆盖本次启动；
- 不可信仓库或无人值守运行需要 OS/container/VM 级隔离。

因此 Codex 风格 GUI 中至少需要可见地表达：

1. 当前工作目录；
2. 当前项目是否允许加载项目级 Pi resources；
3. Agent 正在调用的工具、参数与输出；
4. 中止当前操作；
5. 第三方 Pi Package 具有完整本机权限；
6. “允许项目资源”不等于“限制 bash/read/write 权限”。

不要把 Codex 的 permission popup 外观误当成 Pi 已有的权限模型。若产品需要逐工具审批，应通过 Extension 的 `tool_call` 拦截与 RPC extension UI confirm 自行实现；这属于产品能力，不是 Pi 默认安全保证。[支持来源：Extensions Tool Events](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/extensions.md#tool-events)；[来源：Pi Security](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/security.md)

## 建议的首版能力边界

按全链路依赖，首版应只做以下闭环：

1. 选择工作目录并创建任务；
2. 拉起对应 Pi RPC sidecar；
3. 加载/切换 provider、model、thinking level；
4. prompt、流式文本/thinking/tool call/tool result；
5. steer、follow-up、abort；
6. Session 自动保存、任务列表、恢复、命名；
7. token/cost/context usage；
8. RPC 扩展 dialog/notify 的基础兼容；
9. sidecar 异常退出、协议错误和重启后的明确失败状态。

不应在首版并行实现：自定义 TUI component 兼容层、远程 CBOR Server、多设备同步、完整 Pi Package 市场、容器编排。这些能力不影响本地 GUI 主链路成立。

## 待实现前验证的技术风险

- **RPC 版本跟随**：RPC 文档未声明独立协议版本协商。应用应固定捆绑 Pi 版本，不要默认调用用户 PATH 中任意版本的 `pi`。
- **二进制尺寸与更新**：每个平台捆绑官方 Pi binary，构建流程需要下载、校验 `SHA256SUMS`、重命名为 Tauri target triple，并固定版本。
- **Session 列表**：RPC 缺少全局 list API，需要 Rust 做轻量索引；必须用损坏 JSONL、旧版本 Session、正在写入 Session 做测试。
- **多任务并发**：需要明确每个任务的 sidecar ownership、并发上限、后台任务退出策略和 app shutdown 清理。
- **扩展交互**：若忽略 `extension_ui_request`，某些扩展会阻塞等待响应；至少需要处理 dialog、cancel 和 timeout。
- **安全预期**：Tauri capability 不能限制 Pi 自身已经启动后的文件和 shell 权限；需要把“应用前端权限”和“Agent 执行权限”区分开。

## 一手资料索引

- [Pi 官方仓库](https://github.com/earendil-works/pi)
- [Pi coding-agent README](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/README.md)
- [Pi SDK](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/sdk.md)
- [Pi RPC](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/rpc.md)
- [Pi Sessions](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/sessions.md)
- [Pi Session Format](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/session-format.md)
- [Pi Extensions](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/extensions.md)
- [Pi Skills](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/skills.md)
- [Pi Packages](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/packages.md)
- [Pi Providers](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/providers.md)
- [Pi Security](https://github.com/earendil-works/pi/blob/e86823096c5bad39e1ca282ec24bc5eb9bec745b/packages/coding-agent/docs/security.md)
- [Pi v0.84.3 Release](https://github.com/earendil-works/pi/releases/tag/v0.84.3)
- [Tauri Embedding External Binaries](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/develop/sidecar.mdx)
- [Tauri Shell](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/plugin/shell.mdx)
- [Tauri Capabilities](https://github.com/tauri-apps/tauri-docs/blob/6b47febf67f6b5f4383497e8b34e10a066685f35/src/content/docs/security/capabilities.mdx)
