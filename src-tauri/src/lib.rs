use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs::{self, DirEntry, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use thiserror::Error;

const EMPTY_TREE_HASH: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const PI_EXPECTED_VERSION: &str = env!("AI_DESK_PI_VERSION");
const TEXT_PREVIEW_MAX_BYTES: u64 = 512 * 1024;
const TEXT_CHUNK_MAX_BYTES: usize = 64 * 1024;
const IMAGE_PREVIEW_MAX_BYTES: u64 = 8 * 1024 * 1024;
const IMAGE_TYPE_SNIFF_BYTES: usize = 4100;
const PNG_SIGNATURE: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

static TEMP_ARTIFACT_COUNTER: AtomicU64 = AtomicU64::new(0);
static EXITING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Error)]
enum AppError {
    #[error("无法定位用户目录")]
    HomeDirectory,
    #[error("无法读取目录: {0}")]
    ReadDirectory(String),
    #[error("无法读取会话文件: {0}")]
    ReadSession(String),
    #[error("无法写入会话文件: {0}")]
    WriteSession(String),
    #[error("会话文件不在 Pi 会话目录内")]
    InvalidSessionPath,
    #[error("会话文件缺少有效的 session header")]
    InvalidSession,
    #[error("会话名称必须为 1 到 256 个字符")]
    InvalidSessionName,
    #[error("无法定位工作区: {0}")]
    InvalidWorkspace(String),
    #[error("无法读取工作区文件: {0}")]
    ReadWorkspaceFile(String),
    #[error("Pi runtime 预检失败: {0}")]
    PiRuntime(String),
    #[error("Git 命令失败: {0}")]
    GitCommand(String),
    #[error("Git 状态解析失败: {0}")]
    GitStatusParse(String),
    #[error("Git 提交信息必须为 1 到 4096 个字符")]
    InvalidGitCommitMessage,
    #[error("无效的插件来源: {0}")]
    InvalidPiPackage(String),
    #[error("Pi 插件命令失败: {0}")]
    PiPackageCommand(String),
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub time: String,
    pub session_file: String,
    pub modified_at: String,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub path: String,
    pub conversations: Vec<ConversationSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub id: String,
    pub cwd: String,
    pub name: Option<String>,
    pub leaf_id: Option<String>,
    pub active_entries: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub clean: bool,
    pub additions: usize,
    pub deletions: usize,
    pub files: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChanged {
    pub cwd: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum GitAction {
    StageAll,
    UnstageAll,
    StageFile { path: String },
    UnstageFile { path: String },
    Commit { message: String },
    Pull,
    Push,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FilePreview {
    PagedText {
        path: String,
        size: u64,
        version: String,
    },
    Text {
        path: String,
        language: String,
        content: String,
    },
    Image {
        path: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
        data: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileChunk {
    pub content: String,
    pub next_offset: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProcessStatus {
    pub conversation_id: String,
    pub pid: u32,
    pub running: bool,
    pub busy: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRuntimeEvent {
    pub conversation_id: String,
    pub event: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProcessExit {
    pub conversation_id: String,
    pub code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRuntimeStatus {
    pub executable_path: String,
    pub package_dir: String,
    pub version: String,
    pub parsed_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiPackageSummary {
    pub source: String,
    pub scope: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiPackageCommandResult {
    pub ok: bool,
    pub message: String,
}

struct PiProcess {
    child: Child,
    stdin: ChildStdin,
    busy: bool,
    config: PiProcessConfig,
}

type SharedPiProcess = Arc<Mutex<PiProcess>>;
type PiProcessMap = Arc<Mutex<HashMap<String, SharedPiProcess>>>;

#[derive(Debug, Clone, PartialEq, Eq)]
struct PiProcessConfig {
    cwd: PathBuf,
    session_file: Option<PathBuf>,
    session_id: Option<String>,
    project_trusted: bool,
}

#[derive(Default)]
struct PiProcessRegistry {
    processes: PiProcessMap,
}

#[derive(Default)]
struct WorkspaceWatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Debug, Clone)]
struct ParsedSession {
    header: Value,
    entries: Vec<Value>,
    #[cfg(test)]
    path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GitChange {
    code: String,
    path: String,
    previous_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedGitStatus {
    branch: String,
    entries: Vec<GitChange>,
}

#[derive(Debug, Clone)]
struct PiRuntimeCheck {
    executable_path: PathBuf,
    package_dir: PathBuf,
    version_output: String,
    parsed_version: String,
}

struct TempArtifact {
    root: PathBuf,
    path: PathBuf,
}

impl TempArtifact {
    fn new(prefix: &str, file_name: &str) -> Result<Self, AppError> {
        for _ in 0..16 {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let counter = TEMP_ARTIFACT_COUNTER.fetch_add(1, Ordering::Relaxed);
            let root = env::temp_dir().join(format!(
                "ai-desk-{prefix}-{}-{nonce}-{counter}",
                std::process::id()
            ));
            match fs::create_dir(&root) {
                Ok(()) => {
                    let path = root.join(file_name);
                    return Ok(Self { root, path });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(AppError::GitCommand(error.to_string())),
            }
        }
        Err(AppError::GitCommand("无法创建临时文件".to_owned()))
    }
}

impl Drop for TempArtifact {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn home_dir() -> Result<PathBuf, AppError> {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    env::var_os(key)
        .map(PathBuf::from)
        .ok_or(AppError::HomeDirectory)
}

fn session_root() -> Result<PathBuf, AppError> {
    Ok(home_dir()?.join(".pi").join("agent").join("sessions"))
}

fn expand_path(input: &str) -> Result<PathBuf, AppError> {
    if input == "~" {
        return home_dir();
    }
    if let Some(rest) = input.strip_prefix("~/") {
        return Ok(home_dir()?.join(rest));
    }
    Ok(PathBuf::from(input))
}

fn workspace_root(input: &str) -> Result<PathBuf, AppError> {
    let path = expand_path(input)?
        .canonicalize()
        .map_err(|error| AppError::InvalidWorkspace(error.to_string()))?;
    if !path.is_dir() {
        return Err(AppError::InvalidWorkspace("目标不是目录".to_owned()));
    }
    Ok(path)
}

fn pi_binary_candidates(base_dir: &Path, base_name: &str) -> Vec<PathBuf> {
    let candidates = vec![base_dir.join(base_name)];
    #[cfg(windows)]
    {
        let mut candidates = candidates;
        candidates.push(base_dir.join(format!("{base_name}.exe")));
        return candidates;
    }
    candidates
}

fn compile_target_triple() -> String {
    env::var("TAURI_ENV_TARGET_TRIPLE")
        .or_else(|_| env::var("TARGET"))
        .unwrap_or_else(|_| {
            let arch = std::env::consts::ARCH;
            let vendor = if cfg!(target_vendor = "apple") {
                "apple"
            } else if cfg!(target_vendor = "pc") {
                "pc"
            } else {
                "unknown"
            };
            let os = match std::env::consts::OS {
                "macos" => "darwin",
                other => other,
            };
            let target_env = if cfg!(target_env = "gnu") {
                Some("gnu")
            } else if cfg!(target_env = "musl") {
                Some("musl")
            } else if cfg!(target_env = "msvc") {
                Some("msvc")
            } else {
                None
            };

            target_env.map_or_else(
                || format!("{arch}-{vendor}-{os}"),
                |target_env| format!("{arch}-{vendor}-{os}-{target_env}"),
            )
        })
}

fn resolve_pi_executable_from(current_exe: Option<&Path>) -> Result<PathBuf, AppError> {
    if let Some(path) = env::var_os("AI_DESK_PI_PATH") {
        let explicit = PathBuf::from(path);
        return Ok(if explicit.is_absolute() {
            explicit
        } else {
            env::current_dir()
                .map_err(|error| AppError::PiRuntime(error.to_string()))?
                .join(explicit)
        });
    }

    let target_name = format!("pi-{}", compile_target_triple());
    let mut candidates = Vec::new();

    if let Some(executable_dir) = current_exe.and_then(Path::parent) {
        candidates.extend(pi_binary_candidates(executable_dir, "pi"));
        candidates.extend(pi_binary_candidates(executable_dir, &target_name));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.extend(pi_binary_candidates(
        &manifest_dir.join("binaries"),
        &target_name,
    ));

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            AppError::PiRuntime(
                "未找到 bundled Pi 可执行文件，请确认 sidecar binaries/pi 已构建或设置 AI_DESK_PI_PATH"
                    .to_owned(),
            )
        })
}

fn parse_pi_version(output: &str) -> Option<String> {
    output.split_whitespace().find_map(|token| {
        let version = token.trim_matches(|char: char| !char.is_ascii_alphanumeric() && char != '.');
        let version = version.strip_prefix('v').unwrap_or(version);
        version
            .split('.')
            .all(|part| !part.is_empty() && part.chars().all(|char| char.is_ascii_digit()))
            .then(|| version.to_owned())
    })
}

fn current_executable_path() -> Result<PathBuf, AppError> {
    env::current_exe().map_err(|error| AppError::PiRuntime(error.to_string()))
}

fn resolve_pi_package_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    if let Some(path) = env::var_os("AI_DESK_PI_PACKAGE_DIR") {
        let explicit = PathBuf::from(path);
        if explicit.is_dir() {
            return Ok(explicit);
        }
        return Err(AppError::PiRuntime(format!(
            "AI_DESK_PI_PACKAGE_DIR 不存在: {}",
            explicit.display()
        )));
    }

    let resource_package_dir = app
        .path()
        .resource_dir()
        .map_err(|error| AppError::PiRuntime(error.to_string()))?
        .join("pi-runtime");
    if resource_package_dir.is_dir() {
        return Ok(resource_package_dir);
    }

    let development_package_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("pi-runtime");
    if development_package_dir.is_dir() {
        return Ok(development_package_dir);
    }

    Err(AppError::PiRuntime(format!(
        "Pi 资源目录不存在: {} 或 {}",
        resource_package_dir.display(),
        development_package_dir.display()
    )))
}

fn preflight_pi_runtime_check(app: &AppHandle) -> Result<PiRuntimeCheck, AppError> {
    let executable_path = resolve_pi_executable_from(Some(&current_executable_path()?))?;
    let package_dir = resolve_pi_package_dir(app)?;
    if !executable_path.is_file() {
        return Err(AppError::PiRuntime(format!(
            "Pi 可执行文件不存在: {}",
            executable_path.display()
        )));
    }

    let output = Command::new(&executable_path)
        .arg("--version")
        .env("PI_PACKAGE_DIR", &package_dir)
        .output()
        .map_err(|error| AppError::PiRuntime(format!("执行 pi --version 失败: {error}")))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(AppError::PiRuntime(if detail.is_empty() {
            "pi --version 执行失败".to_owned()
        } else {
            format!("pi --version 执行失败: {detail}")
        }));
    }

    let version_output = [
        String::from_utf8_lossy(&output.stdout).trim().to_owned(),
        String::from_utf8_lossy(&output.stderr).trim().to_owned(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join("\n");
    let parsed_version = parse_pi_version(&version_output).ok_or_else(|| {
        AppError::PiRuntime(format!("无法解析 pi --version 输出: {version_output}"))
    })?;
    if parsed_version != PI_EXPECTED_VERSION {
        return Err(AppError::PiRuntime(format!(
            "Pi 版本不匹配，期望 {PI_EXPECTED_VERSION}，实际 {parsed_version}"
        )));
    }

    Ok(PiRuntimeCheck {
        executable_path,
        package_dir,
        version_output,
        parsed_version,
    })
}

fn pi_runtime_status(runtime: PiRuntimeCheck) -> PiRuntimeStatus {
    PiRuntimeStatus {
        executable_path: runtime.executable_path.to_string_lossy().into_owned(),
        package_dir: runtime.package_dir.to_string_lossy().into_owned(),
        version: runtime.version_output,
        parsed_version: runtime.parsed_version,
    }
}

fn global_pi_settings_path() -> Result<PathBuf, AppError> {
    Ok(home_dir()?.join(".pi").join("agent").join("settings.json"))
}

fn project_pi_settings_path(cwd: &str) -> Result<PathBuf, AppError> {
    Ok(workspace_root(cwd)?.join(".pi").join("settings.json"))
}

fn pi_package_source(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.get("source").and_then(Value::as_str).map(str::to_owned))
        .map(|source| source.trim().to_owned())
        .filter(|source| !source.is_empty())
}

fn parse_pi_packages(settings: &Value) -> Vec<String> {
    settings
        .get("packages")
        .and_then(Value::as_array)
        .map(|packages| packages.iter().filter_map(pi_package_source).collect())
        .unwrap_or_default()
}

fn read_pi_settings_packages(path: &Path) -> Vec<String> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .map(|settings| parse_pi_packages(&settings))
        .unwrap_or_default()
}

fn pi_package_kind(source: &str) -> &'static str {
    if source.starts_with("npm:") {
        "npm"
    } else if source.starts_with("git:")
        || source.starts_with("https://")
        || source.starts_with("http://")
        || source.starts_with("ssh://")
        || source.starts_with("git://")
    {
        "git"
    } else {
        "local"
    }
}

fn collect_pi_packages(global_path: &Path, project_path: Option<&Path>) -> Vec<PiPackageSummary> {
    let mut packages = Vec::new();
    for source in read_pi_settings_packages(global_path) {
        packages.push(PiPackageSummary {
            kind: pi_package_kind(&source).to_owned(),
            source,
            scope: "global".to_owned(),
        });
    }
    if let Some(project_path) = project_path {
        for source in read_pi_settings_packages(project_path) {
            packages.push(PiPackageSummary {
                kind: pi_package_kind(&source).to_owned(),
                source,
                scope: "project".to_owned(),
            });
        }
    }
    packages
}

fn list_pi_packages_sync(cwd: Option<&str>) -> Result<Vec<PiPackageSummary>, String> {
    let global_path = global_pi_settings_path()?;
    let project_path = cwd
        .filter(|cwd| !cwd.trim().is_empty())
        .map(project_pi_settings_path)
        .transpose()?;
    Ok(collect_pi_packages(&global_path, project_path.as_deref()))
}

fn validate_pi_package_source(source: &str) -> Result<(), AppError> {
    let source = source.trim();
    if source.is_empty() || source.len() > 1024 {
        return Err(AppError::InvalidPiPackage(
            "插件来源必须为 1 到 1024 个字符".to_owned(),
        ));
    }
    if source
        .chars()
        .any(|char| matches!(char, '\n' | '\r' | '\0'))
    {
        return Err(AppError::InvalidPiPackage(
            "插件来源包含非法字符".to_owned(),
        ));
    }
    Ok(())
}

fn pi_package_command_args(action: &str, source: &str, local: bool) -> Vec<String> {
    let mut args = vec![action.to_owned(), source.trim().to_owned()];
    if local {
        args.extend(["-l".to_owned(), "--approve".to_owned()]);
    } else {
        args.push("--no-approve".to_owned());
    }
    args
}

fn run_pi_package_command(
    args: &[String],
    cwd: Option<&str>,
) -> Result<PiPackageCommandResult, AppError> {
    let executable = resolve_pi_executable_from(Some(&current_executable_path()?))?;
    let command_cwd = match cwd.filter(|cwd| !cwd.trim().is_empty()) {
        Some(cwd) => workspace_root(cwd)?,
        None => home_dir()?,
    };
    let output = Command::new(&executable)
        .args(args)
        .current_dir(&command_cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| AppError::PiPackageCommand(error.to_string()))?;
    let message = [
        String::from_utf8_lossy(&output.stdout).trim().to_owned(),
        String::from_utf8_lossy(&output.stderr).trim().to_owned(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join("\n");
    if !output.status.success() {
        return Err(AppError::PiPackageCommand(if message.is_empty() {
            "Pi 插件命令执行失败".to_owned()
        } else {
            message
        }));
    }
    Ok(PiPackageCommandResult { ok: true, message })
}

fn install_pi_package_sync(
    source: &str,
    local: bool,
    cwd: Option<&str>,
) -> Result<PiPackageCommandResult, String> {
    validate_pi_package_source(source)?;
    run_pi_package_command(
        &pi_package_command_args("install", source, local),
        if local { cwd } else { None },
    )
    .map_err(Into::into)
}

fn remove_pi_package_sync(
    source: &str,
    local: bool,
    cwd: Option<&str>,
) -> Result<PiPackageCommandResult, String> {
    validate_pi_package_source(source)?;
    run_pi_package_command(
        &pi_package_command_args("remove", source, local),
        if local { cwd } else { None },
    )
    .map_err(Into::into)
}

fn emit_pi_event(app: &AppHandle, conversation_id: &str, event: Value) {
    let _ = app.emit(
        "pi-event",
        PiRuntimeEvent {
            conversation_id: conversation_id.to_owned(),
            event,
        },
    );
}

fn update_pi_process_busy(registry: &PiProcessMap, conversation_id: &str, event_type: &str) {
    let busy = match event_type {
        "agent_start" => Some(true),
        "agent_settled" => Some(false),
        _ => None,
    };
    let Some(busy) = busy else { return };
    let process = registry
        .lock()
        .ok()
        .and_then(|processes| processes.get(conversation_id).cloned());
    if let Some(process) = process {
        if let Ok(mut process) = process.lock() {
            process.busy = busy;
        }
    }
}

fn spawn_pi_stdout_reader(
    app: AppHandle,
    registry: PiProcessMap,
    conversation_id: String,
    stdout: ChildStdout,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) if !line.trim().is_empty() => match serde_json::from_str::<Value>(&line) {
                    Ok(event) => {
                        update_pi_process_busy(
                            &registry,
                            &conversation_id,
                            event
                                .get("type")
                                .and_then(Value::as_str)
                                .unwrap_or_default(),
                        );
                        emit_pi_event(&app, &conversation_id, event);
                    }
                    Err(error) => emit_pi_event(
                        &app,
                        &conversation_id,
                        serde_json::json!({
                            "type": "process_error",
                            "message": format!("Pi RPC 返回了无效 JSON: {error}")
                        }),
                    ),
                },
                Ok(_) => {}
                Err(error) => emit_pi_event(
                    &app,
                    &conversation_id,
                    serde_json::json!({
                        "type": "process_error",
                        "message": format!("读取 Pi RPC 输出失败: {error}")
                    }),
                ),
            }
        }
        let code = registry
            .lock()
            .ok()
            .and_then(|mut processes| processes.remove(&conversation_id))
            .and_then(|process| process.lock().ok()?.child.try_wait().ok()?)
            .and_then(|status| status.code());
        let _ = app.emit(
            "pi-process-exit",
            PiProcessExit {
                conversation_id,
                code,
            },
        );
    });
}

fn spawn_pi_stderr_reader(app: AppHandle, conversation_id: String, stderr: ChildStderr) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            /* 新建会话时 --session-id 尚未落盘，Pi 会打印这句已知误报，无需透传给前端 */
            if trimmed.is_empty()
                || trimmed.starts_with("Warning: No project session found with id")
            {
                continue;
            }
            emit_pi_event(
                &app,
                &conversation_id,
                serde_json::json!({ "type": "process_stderr", "message": line }),
            );
        }
    });
}

fn relative_workspace_file(root: &Path, input: &str) -> Result<PathBuf, AppError> {
    let path = relative_workspace_path(root, input)?;
    let canonical = path
        .canonicalize()
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return Err(AppError::ReadWorkspaceFile(
            "文件不存在或不可读取".to_owned(),
        ));
    }
    Ok(canonical)
}

fn relative_workspace_path(root: &Path, input: &str) -> Result<PathBuf, AppError> {
    let relative = Path::new(input);
    if relative.is_absolute() || input.split(['/', '\\']).any(|part| part == "..") {
        return Err(AppError::ReadWorkspaceFile("文件路径越界".to_owned()));
    }
    let path = root.join(relative);
    if path.exists() {
        let canonical = path
            .canonicalize()
            .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
        if !canonical.starts_with(root) {
            return Err(AppError::ReadWorkspaceFile("文件路径越界".to_owned()));
        }
    }
    if let Ok(canonical_parent) = path.parent().unwrap_or(root).canonicalize() {
        if !canonical_parent.starts_with(root) {
            return Err(AppError::ReadWorkspaceFile("文件路径越界".to_owned()));
        }
    }
    Ok(path)
}

fn language_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
    {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "json" => "json",
        "css" | "scss" => "css",
        "html" => "html",
        "md" => "markdown",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "sh" => "shell",
        _ => "text",
    }
    .to_owned()
}

fn workspace_image_mime_type(path: &Path) -> Result<Option<&'static str>, AppError> {
    let mut file =
        File::open(path).map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    let mut buffer = vec![0; IMAGE_TYPE_SNIFF_BYTES];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    buffer.truncate(bytes_read);
    Ok(detect_supported_image_mime_type(&buffer))
}

fn detect_supported_image_mime_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return (bytes.get(3) != Some(&0xf7)).then_some("image/jpeg");
    }
    if bytes.starts_with(PNG_SIGNATURE) {
        return (is_png(bytes) && !is_animated_png(bytes)).then_some("image/png");
    }
    if starts_with_ascii(bytes, 0, "GIF") {
        return Some("image/gif");
    }
    if starts_with_ascii(bytes, 0, "RIFF") && starts_with_ascii(bytes, 8, "WEBP") {
        return Some("image/webp");
    }
    if starts_with_ascii(bytes, 0, "BM") && is_bmp(bytes) {
        return Some("image/bmp");
    }
    None
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.len() >= 16
        && read_u32_be(bytes, PNG_SIGNATURE.len()) == 13
        && starts_with_ascii(bytes, 12, "IHDR")
}

fn is_animated_png(bytes: &[u8]) -> bool {
    let mut offset = PNG_SIGNATURE.len();
    while offset + 8 <= bytes.len() {
        let chunk_length = read_u32_be(bytes, offset) as usize;
        let chunk_type_offset = offset + 4;
        if starts_with_ascii(bytes, chunk_type_offset, "acTL") {
            return true;
        }
        if starts_with_ascii(bytes, chunk_type_offset, "IDAT") {
            return false;
        }
        let Some(next_offset) = offset.checked_add(8 + chunk_length + 4) else {
            return false;
        };
        if next_offset <= offset || next_offset > bytes.len() {
            return false;
        }
        offset = next_offset;
    }
    false
}

fn is_bmp(bytes: &[u8]) -> bool {
    if bytes.len() < 26 {
        return false;
    }
    let declared_file_size = read_u32_le(bytes, 2);
    let pixel_data_offset = read_u32_le(bytes, 10);
    let dib_header_size = read_u32_le(bytes, 14);
    if (declared_file_size != 0 && declared_file_size < 26)
        || pixel_data_offset < 14 + dib_header_size
        || (declared_file_size != 0 && pixel_data_offset >= declared_file_size)
    {
        return false;
    }
    let (color_planes, bits_per_pixel) = if dib_header_size == 12 {
        (read_u16_le(bytes, 22), read_u16_le(bytes, 24))
    } else if (40..=124).contains(&dib_header_size) && bytes.len() >= 30 {
        (read_u16_le(bytes, 26), read_u16_le(bytes, 28))
    } else {
        return false;
    };
    color_planes == 1 && matches!(bits_per_pixel, 1 | 4 | 8 | 16 | 24 | 32)
}

fn read_u16_le(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([
        bytes.get(offset).copied().unwrap_or_default(),
        bytes.get(offset + 1).copied().unwrap_or_default(),
    ])
}

fn read_u32_be(bytes: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes([
        bytes.get(offset).copied().unwrap_or_default(),
        bytes.get(offset + 1).copied().unwrap_or_default(),
        bytes.get(offset + 2).copied().unwrap_or_default(),
        bytes.get(offset + 3).copied().unwrap_or_default(),
    ])
}

fn read_u32_le(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        bytes.get(offset).copied().unwrap_or_default(),
        bytes.get(offset + 1).copied().unwrap_or_default(),
        bytes.get(offset + 2).copied().unwrap_or_default(),
        bytes.get(offset + 3).copied().unwrap_or_default(),
    ])
}

fn starts_with_ascii(bytes: &[u8], offset: usize, text: &str) -> bool {
    let Some(end) = offset.checked_add(text.len()) else {
        return false;
    };
    bytes
        .get(offset..end)
        .is_some_and(|slice| slice == text.as_bytes())
}

fn ignored_workspace_directory(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | "build" | ".next"
    )
}

fn walk_workspace_files(
    root: &Path,
    current: &Path,
    output: &mut Vec<WorkspaceFile>,
) -> Result<(), AppError> {
    let mut entries = fs::read_dir(current)
        .map_err(|error| AppError::InvalidWorkspace(error.to_string()))?
        .filter_map(Result::ok)
        .collect::<Vec<DirEntry>>();
    entries.sort_by_key(DirEntry::file_name);
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let file_type = entry
            .file_type()
            .map_err(|error| AppError::ReadDirectory(error.to_string()))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            if !ignored_workspace_directory(&name) {
                let relative = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                output.push(WorkspaceFile {
                    path: relative,
                    name: name.clone(),
                    kind: "directory".to_owned(),
                    size: 0,
                });
                walk_workspace_files(root, &path, output)?;
            }
            continue;
        }
        if !file_type.is_file() || ignored_workspace_file(&name) {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let size = entry
            .metadata()
            .map(|metadata| metadata.len())
            .unwrap_or_default();
        output.push(WorkspaceFile {
            path: relative,
            name,
            kind: "file".to_owned(),
            size,
        });
    }
    Ok(())
}

fn ignored_workspace_file(name: &str) -> bool {
    name == ".env" || (name.starts_with(".env.") && name != ".env.example")
}

fn walk_jsonl(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let entries = fs::read_dir(root).map_err(|error| AppError::ReadDirectory(error.to_string()))?;
    for entry in entries {
        let entry = entry.map_err(|error| AppError::ReadDirectory(error.to_string()))?;
        let path = entry.path();
        if path.is_dir() {
            walk_jsonl(&path, output)?;
        } else if path.extension().and_then(|extension| extension.to_str()) == Some("jsonl") {
            output.push(path);
        }
    }
    Ok(())
}

fn parse_session(path: &Path) -> Result<ParsedSession, AppError> {
    let mut entries = Vec::new();
    let header = visit_session(path, |value| entries.push(value))?;
    Ok(ParsedSession {
        header,
        entries,
        #[cfg(test)]
        path: path.to_path_buf(),
    })
}

fn visit_session(path: &Path, mut visit: impl FnMut(Value)) -> Result<Value, AppError> {
    let file = File::open(path).map_err(|error| AppError::ReadSession(error.to_string()))?;
    let mut lines = BufReader::new(file).lines();
    let header = lines
        .next()
        .transpose()
        .map_err(|error| AppError::ReadSession(error.to_string()))?
        .and_then(|line| serde_json::from_str::<Value>(&line).ok())
        .filter(|value| value.get("type").and_then(Value::as_str) == Some("session"))
        .ok_or(AppError::InvalidSession)?;

    for line in lines {
        let line = line.map_err(|error| AppError::ReadSession(error.to_string()))?;
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            if value.get("type").and_then(Value::as_str) != Some("session") {
                visit(value);
            }
        }
    }

    Ok(header)
}

fn value_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_owned());
    }
    value.as_array().and_then(|parts| {
        let text = parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" ");
        (!text.is_empty()).then_some(text)
    })
}

fn message_text(entry: &Value) -> Option<String> {
    let message = entry.get("message")?;
    let content = message.get("content")?;
    /* 纯图消息也占据首条摘要，不能被后续回复替代或保留空白标题。 */
    value_text(content).filter(|text| !text.trim().is_empty()).or_else(|| {
        content.as_array()?.iter()
            .any(|part| part.get("type").and_then(Value::as_str) == Some("image"))
            .then(|| "[图片]".to_owned())
    })
}

fn session_name(entries: &[Value]) -> Option<String> {
    entries
        .iter()
        .rev()
        .find(|entry| entry.get("type").and_then(Value::as_str) == Some("session_info"))
        .and_then(|entry| entry.get("name").and_then(Value::as_str))
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

fn display_time(value: Option<&str>) -> String {
    value
        .and_then(|timestamp| timestamp.split('T').next_back())
        .and_then(|time| time.get(..5))
        .map(|time| time.to_owned())
        .unwrap_or_else(|| "刚刚".to_owned())
}

#[derive(Default)]
struct SessionSummaryBuilder {
    name: Option<String>,
    first_message: Option<String>,
    activity_timestamp: Option<String>,
    message_count: usize,
}

impl SessionSummaryBuilder {
    fn push(&mut self, entry: &Value) {
        /* 列表只保留摘要字段，不随历史消息和工具输出累计内存。 */
        if self.first_message.is_none() {
            self.first_message = message_text(entry).map(|text| text.chars().take(48).collect());
        }
        match entry.get("type").and_then(Value::as_str) {
            Some("session_info") => {
                self.name = entry.get("name").and_then(Value::as_str)
                    .map(str::trim).filter(|name| !name.is_empty()).map(str::to_owned);
            }
            Some("message") => {
                self.message_count += 1;
                self.activity_timestamp = entry.get("timestamp").and_then(Value::as_str).map(str::to_owned);
            }
            _ => {}
        }
    }

    fn finish(self, header: &Value, path: &Path) -> ConversationSummary {
        let id = header
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let first_message = self.first_message.unwrap_or_else(|| "开始一段新的工作".to_owned());
        let title = self.name.unwrap_or_else(|| first_message.chars().take(28).collect());
        let activity_timestamp = self.activity_timestamp.as_deref()
            .or_else(|| header.get("timestamp").and_then(Value::as_str))
            .unwrap_or_default()
            .to_owned();
        ConversationSummary {
            id,
            title,
            preview: first_message.chars().take(48).collect(),
            time: display_time((!activity_timestamp.is_empty()).then_some(activity_timestamp.as_str())),
            session_file: path.to_string_lossy().into_owned(),
            modified_at: activity_timestamp,
            message_count: self.message_count,
        }
    }
}

#[cfg(test)]
fn summary_for_session(session: ParsedSession) -> ConversationSummary {
    let mut summary = SessionSummaryBuilder::default();
    session.entries.iter().for_each(|entry| summary.push(entry));
    summary.finish(&session.header, &session.path)
}

fn resolve_pi_session_path(session_file: &str) -> Result<PathBuf, AppError> {
    let root = session_root()?
        .canonicalize()
        .map_err(|error| AppError::ReadDirectory(error.to_string()))?;
    let path = PathBuf::from(session_file)
        .canonicalize()
        .map_err(|error| AppError::ReadSession(error.to_string()))?;
    if !path.starts_with(&root) {
        return Err(AppError::InvalidSessionPath);
    }
    Ok(path)
}

fn append_session_name(path: &Path, name: &str, timestamp: &str) -> Result<(), AppError> {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let entry = serde_json::json!({
        "type": "session_info",
        "id": format!("info-{id}"),
        "parentId": Value::Null,
        "timestamp": timestamp,
        "name": name,
    });
    let mut file = OpenOptions::new()
        .append(true)
        .open(path)
        .map_err(|error| AppError::WriteSession(error.to_string()))?;
    writeln!(file, "{entry}").map_err(|error| AppError::WriteSession(error.to_string()))?;
    file.sync_data()
        .map_err(|error| AppError::WriteSession(error.to_string()))
}

fn project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(cwd)
        .to_owned()
}

fn active_entries(entries: Vec<Value>) -> (Option<String>, Vec<Value>) {
    let Some(leaf) = entries
        .last()
        .and_then(|entry| entry.get("id").and_then(Value::as_str))
        .map(str::to_owned)
    else {
        return (None, Vec::new());
    };
    /* 只移动活动分支，不克隆消息正文，也不向前端发送未使用的完整历史。 */
    let mut by_id = entries
        .into_iter()
        .filter_map(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .map(|id| (id, entry))
        })
        .collect::<HashMap<_, _>>();
    let mut selected = Vec::new();
    let mut current = Some(leaf.clone());
    while let Some(id) = current {
        let Some(entry) = by_id.remove(&id) else {
            break;
        };
        current = entry
            .get("parentId")
            .and_then(Value::as_str)
            .map(str::to_owned);
        selected.push(entry);
    }
    selected.reverse();
    (Some(leaf), selected)
}

#[tauri::command]
async fn list_pi_projects() -> Result<Vec<ProjectSummary>, String> {
    tauri::async_runtime::spawn_blocking(|| list_pi_projects_at(&session_root()?))
        .await
        .map_err(|error| error.to_string())?
}

fn list_pi_projects_at(root: &Path) -> Result<Vec<ProjectSummary>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    walk_jsonl(root, &mut files)?;
    let mut grouped = HashMap::<String, Vec<ConversationSummary>>::new();
    for file in files {
        let mut summary = SessionSummaryBuilder::default();
        let header = match visit_session(&file, |entry| summary.push(&entry)) {
            Ok(header) => header,
            Err(_) => continue,
        };
        let cwd = header
            .get("cwd")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        grouped
            .entry(cwd)
            .or_default()
            .push(summary.finish(&header, &file));
    }
    let mut projects = grouped
        .into_iter()
        .map(|(path, mut conversations)| {
            conversations.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
            ProjectSummary {
                id: path.clone(),
                name: project_name(&path),
                path,
                conversations,
            }
        })
        .collect::<Vec<_>>();
    projects.sort_by_key(|project| project.name.to_lowercase());
    Ok(projects)
}

#[tauri::command(async)]
fn read_pi_session(session_file: String) -> Result<SessionView, String> {
    let path = resolve_pi_session_path(&session_file)?;
    let session = parse_session(&path)?;
    let id = session
        .header
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let cwd = session
        .header
        .get("cwd")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let name = session_name(&session.entries);
    let (leaf_id, active) = active_entries(session.entries);
    Ok(SessionView {
        id,
        cwd,
        name,
        leaf_id,
        active_entries: active,
    })
}

#[tauri::command(async)]
fn rename_pi_session(session_file: String, name: String, timestamp: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 256 {
        return Err(AppError::InvalidSessionName.into());
    }
    if timestamp.len() > 64 || !timestamp.contains('T') {
        return Err(AppError::InvalidSession.into());
    }
    let path = resolve_pi_session_path(&session_file)?;
    visit_session(&path, |_| {})?;
    append_session_name(&path, name, &timestamp)?;
    Ok(())
}

#[tauri::command]
async fn list_pi_packages(cwd: Option<String>) -> Result<Vec<PiPackageSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || list_pi_packages_sync(cwd.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn install_pi_package(
    source: String,
    local: bool,
    cwd: Option<String>,
) -> Result<PiPackageCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_pi_package_sync(&source, local, cwd.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn remove_pi_package(
    source: String,
    local: bool,
    cwd: Option<String>,
) -> Result<PiPackageCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || remove_pi_package_sync(&source, local, cwd.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command(async)]
fn preflight_pi_runtime(app: AppHandle) -> Result<PiRuntimeStatus, String> {
    preflight_pi_runtime_check(&app)
        .map(pi_runtime_status)
        .map_err(Into::into)
}

#[tauri::command(async)]
fn start_pi_process(
    app: AppHandle,
    state: State<'_, PiProcessRegistry>,
    conversation_id: String,
    cwd: String,
    session_file: Option<String>,
    session_id: Option<String>,
    project_trusted: bool,
) -> Result<PiProcessStatus, String> {
    let root = workspace_root(&cwd)?;
    let runtime = preflight_pi_runtime_check(&app)?;
    let normalized_session_file =
        if let Some(session_file) = session_file.filter(|path| !path.trim().is_empty()) {
            let session_root = session_root()?
                .canonicalize()
                .map_err(|error| AppError::ReadDirectory(error.to_string()))?;
            let session_path = PathBuf::from(session_file)
                .canonicalize()
                .map_err(|error| AppError::ReadSession(error.to_string()))?;
            if !session_path.starts_with(&session_root) {
                return Err(AppError::InvalidSessionPath.into());
            }
            Some(session_path)
        } else {
            None
        };
    let normalized_session_id = session_id.filter(|id| !id.trim().is_empty());
    let process_config = PiProcessConfig {
        cwd: root.clone(),
        session_file: normalized_session_file.clone(),
        session_id: normalized_session_id.clone(),
        project_trusted,
    };
    let mut processes = state
        .processes
        .lock()
        .map_err(|_| "Pi 进程注册表不可用".to_owned())?;
    if let Some(existing) = processes.get(&conversation_id).cloned() {
        let mut process = existing
            .lock()
            .map_err(|_| "Pi 进程状态不可用".to_owned())?;
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            if process.config != process_config {
                return Err(
                    "当前对话已有不同工作区、会话或 trust 配置的 Pi 进程，请先停止后重启"
                        .to_owned(),
                );
            }
            return Ok(PiProcessStatus {
                conversation_id,
                pid: process.child.id(),
                running: true,
                busy: process.busy,
            });
        }
        processes.remove(&conversation_id);
    }

    let mut command = Command::new(&runtime.executable_path);
    command
        .current_dir(&root)
        .args([
            "--mode",
            "rpc",
            if project_trusted {
                "--approve"
            } else {
                "--no-approve"
            },
        ])
        .env("PI_PACKAGE_DIR", &runtime.package_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(session_path) = normalized_session_file {
        let session_path = session_path.to_string_lossy().into_owned();
        command.args(["--session", session_path.as_str()]);
    } else if let Some(session_id) = normalized_session_id {
        command.args(["--session-id", session_id.as_str()]);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("启动 Pi 失败: {error}"))?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Pi 进程没有可写入的 stdin".to_owned())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Pi 进程没有可读取的 stdout".to_owned())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Pi 进程没有可读取的 stderr".to_owned())?;
    let process = Arc::new(Mutex::new(PiProcess {
        child,
        stdin,
        busy: false,
        config: process_config,
    }));
    processes.insert(conversation_id.clone(), process);
    let registry = Arc::clone(&state.processes);
    spawn_pi_stdout_reader(app.clone(), registry, conversation_id.clone(), stdout);
    spawn_pi_stderr_reader(app, conversation_id.clone(), stderr);
    Ok(PiProcessStatus {
        conversation_id,
        pid,
        running: true,
        busy: false,
    })
}

#[tauri::command]
fn send_pi_command(
    state: State<'_, PiProcessRegistry>,
    conversation_id: String,
    command: Value,
) -> Result<(), String> {
    validate_pi_command(&command)?;
    let process = state
        .processes
        .lock()
        .map_err(|_| "Pi 进程注册表不可用".to_owned())?
        .get(&conversation_id)
        .cloned()
        .ok_or_else(|| "当前对话没有运行中的 Pi 进程".to_owned())?;
    let payload = serde_json::to_string(&command).map_err(|error| error.to_string())? + "\n";
    let mut process = process.lock().map_err(|_| "Pi 进程状态不可用".to_owned())?;
    process
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|error| format!("写入 Pi RPC 失败: {error}"))?;
    process
        .stdin
        .flush()
        .map_err(|error| format!("刷新 Pi RPC stdin 失败: {error}"))
}

#[tauri::command]
fn list_pi_processes(state: State<'_, PiProcessRegistry>) -> Result<Vec<PiProcessStatus>, String> {
    let mut processes = state
        .processes
        .lock()
        .map_err(|_| "Pi 进程注册表不可用".to_owned())?;
    let mut exited = Vec::new();
    let mut result = Vec::new();
    for (conversation_id, process) in processes.iter() {
        let mut process = process.lock().map_err(|_| "Pi 进程状态不可用".to_owned())?;
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            exited.push(conversation_id.clone());
        } else {
            result.push(PiProcessStatus {
                conversation_id: conversation_id.clone(),
                pid: process.child.id(),
                running: true,
                busy: process.busy,
            });
        }
    }
    exited.iter().for_each(|id| {
        processes.remove(id);
    });
    Ok(result)
}

fn validate_pi_command(command: &Value) -> Result<(), String> {
    let object = command
        .as_object()
        .ok_or_else(|| "Pi RPC command 必须是对象".to_owned())?;
    let command_type = object
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "Pi RPC command 缺少 type".to_owned())?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Pi RPC command 缺少 id".to_owned())?;
    if id.is_empty() || id.len() > 256 {
        return Err("Pi RPC command id 长度无效".to_owned());
    }

    match command_type {
        "get_state"
        | "get_available_models"
        | "get_available_thinking_levels"
        | "get_session_stats"
        | "abort" => Ok(()),
        "prompt" | "steer" => validate_string_field(object, "message", 1_048_576),
        "set_model" => {
            validate_string_field(object, "provider", 256)?;
            validate_string_field(object, "modelId", 256)
        }
        "set_thinking_level" => {
            let level = object
                .get("level")
                .and_then(Value::as_str)
                .unwrap_or_default();
            ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
                .contains(&level)
                .then_some(())
                .ok_or_else(|| "无效的 thinking level".to_owned())
        }
        "set_session_name" => validate_string_field(object, "name", 256),
        "extension_ui_response" => {
            let valid = object
                .get("value")
                .and_then(Value::as_str)
                .is_some_and(|value| value.len() <= 1_048_576)
                || object.get("confirmed").is_some_and(Value::is_boolean)
                || object.get("cancelled") == Some(&Value::Bool(true));
            valid
                .then_some(())
                .ok_or_else(|| "无效的 extension UI response".to_owned())
        }
        _ => Err(format!("不允许的 Pi RPC command: {command_type}")),
    }
}

fn validate_string_field(
    object: &serde_json::Map<String, Value>,
    field: &str,
    max_length: usize,
) -> Result<(), String> {
    let value = object
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default();
    if value.is_empty() || value.len() > max_length {
        return Err(format!("Pi RPC command 字段 {field} 长度无效"));
    }
    Ok(())
}

#[tauri::command]
fn stop_pi_process(
    state: State<'_, PiProcessRegistry>,
    conversation_id: String,
) -> Result<(), String> {
    let process = state
        .processes
        .lock()
        .map_err(|_| "Pi 进程注册表不可用".to_owned())?
        .remove(&conversation_id);
    if let Some(process) = process {
        let mut process = process.lock().map_err(|_| "Pi 进程状态不可用".to_owned())?;
        let _ = process.child.kill();
        let _ = process.child.wait();
    }
    Ok(())
}

fn stop_all_pi_processes(registry: &PiProcessRegistry) {
    let processes = registry
        .processes
        .lock()
        .ok()
        .map(|mut processes| {
            processes
                .drain()
                .map(|(_, process)| process)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    processes.into_iter().for_each(|process| {
        if let Ok(mut process) = process.lock() {
            let _ = process.child.kill();
            let _ = process.child.wait();
        }
    });
}

fn list_workspace_files(cwd: String) -> Result<Vec<WorkspaceFile>, String> {
    let root = workspace_root(&cwd)?;
    let mut files = Vec::new();
    walk_workspace_files(&root, &root, &mut files)?;
    Ok(files)
}

fn read_workspace_file(cwd: String, path: String) -> Result<FilePreview, String> {
    let root = workspace_root(&cwd)?;
    let file_path = relative_workspace_file(&root, &path)?;
    let metadata =
        fs::metadata(&file_path).map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    if let Some(mime_type) = workspace_image_mime_type(&file_path)? {
        if metadata.len() > IMAGE_PREVIEW_MAX_BYTES {
            return Err(AppError::ReadWorkspaceFile("图片超过 8MB，暂不预览".to_owned()).into());
        }
        let bytes =
            fs::read(&file_path).map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
        return Ok(FilePreview::Image {
            path,
            mime_type: mime_type.to_owned(),
            data: BASE64.encode(bytes),
        });
    }
    if metadata.len() > TEXT_PREVIEW_MAX_BYTES {
        let version = text_file_version(&file_path, &metadata)?;
        let current_path = relative_workspace_file(&root, &path)?;
        let current_metadata = fs::metadata(&current_path)
            .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
        ensure_text_file_version(&current_path, &current_metadata, &version)?;
        return Ok(FilePreview::PagedText {
            path,
            size: metadata.len(),
            version,
        });
    }
    let bytes =
        fs::read(&file_path).map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    let content = String::from_utf8(bytes).map_err(|_| {
        AppError::ReadWorkspaceFile("仅支持文本及 JPG、PNG、GIF、WebP、BMP 图片预览".to_owned())
    })?;
    Ok(FilePreview::Text {
        path,
        language: language_for_path(&file_path),
        content,
    })
}

fn text_file_version(path: &Path, metadata: &fs::Metadata) -> Result<String, AppError> {
    let modified = metadata
        .modified()
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?
        .as_nanos();
    /* 路径和创建时间绑定文件身份；Unix 额外检查 inode 及变更时间，
     * 防止同尺寸覆盖、原子替换或恢复 mtime 后混入其他版本。 */
    let identity = format!("{:?}:{:?}", path, metadata.created().ok());
    #[cfg(unix)]
    let identity = {
        use std::os::unix::fs::MetadataExt;
        format!(
            "{identity}:{}:{}:{}:{}",
            metadata.dev(),
            metadata.ino(),
            metadata.ctime(),
            metadata.ctime_nsec()
        )
    };
    Ok(format!("{}:{modified}:{identity}", metadata.len()))
}

fn ensure_text_file_version(
    path: &Path,
    metadata: &fs::Metadata,
    version: &str,
) -> Result<(), AppError> {
    if !metadata.is_file() || text_file_version(path, metadata)? != version {
        return Err(AppError::ReadWorkspaceFile(
            "文件已改变，请重新打开".to_owned(),
        ));
    }
    Ok(())
}

fn read_workspace_file_chunk(
    cwd: String,
    path: String,
    offset: u64,
    version: String,
) -> Result<TextFileChunk, String> {
    let root = workspace_root(&cwd)?;
    let file_path = relative_workspace_file(&root, &path)?;
    let mut file =
        File::open(&file_path).map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    let metadata = file
        .metadata()
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    ensure_text_file_version(&file_path, &metadata, &version)?;
    let size = metadata.len();
    if offset > size {
        return Err(AppError::ReadWorkspaceFile("文本偏移超出文件范围".to_owned()).into());
    }

    /* 按字节定位且分配固定上限，不依赖换行；跨页字符留给下一次读取。 */
    let length = (size - offset).min(TEXT_CHUNK_MAX_BYTES as u64) as usize;
    let mut bytes = vec![0; length];
    let read_result = file
        .seek(SeekFrom::Start(offset))
        .and_then(|_| file.read_exact(&mut bytes));
    let after = file
        .metadata()
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    ensure_text_file_version(&file_path, &after, &version)?;
    /* 同时检查打开的句柄和当前路径，识别读取期间的文件替换与链接改向。 */
    let current_path = relative_workspace_file(&root, &path)?;
    let current_metadata = fs::metadata(&current_path)
        .map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;
    ensure_text_file_version(&current_path, &current_metadata, &version)?;
    read_result.map_err(|error| AppError::ReadWorkspaceFile(error.to_string()))?;

    let valid_length = match std::str::from_utf8(&bytes) {
        Ok(_) => bytes.len(),
        Err(error) if error.error_len().is_none() && offset + (length as u64) < size => {
            error.valid_up_to()
        }
        Err(_) => {
            return Err(AppError::ReadWorkspaceFile("文本不是有效的 UTF-8".to_owned()).into())
        }
    };
    bytes.truncate(valid_length);
    let content = String::from_utf8(bytes)
        .map_err(|_| AppError::ReadWorkspaceFile("文本不是有效的 UTF-8".to_owned()))?;
    Ok(TextFileChunk {
        content,
        next_offset: offset + valid_length as u64,
        size,
    })
}

fn git_command(root: &Path, args: &[&str]) -> Command {
    #[cfg(test)]
    tests::GIT_COMMAND_COUNT.with(|count| count.set(count.get() + 1));
    let mut command = Command::new("git");
    command.args(args).current_dir(root);
    command
}

fn run_git_bytes(mut command: Command) -> Result<Vec<u8>, AppError> {
    let output = command
        .output()
        .map_err(|error| AppError::GitCommand(error.to_string()))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(AppError::GitCommand(if detail.is_empty() {
            "当前目录不是 Git 仓库".to_owned()
        } else {
            detail
        }));
    }
    Ok(output.stdout)
}

fn run_git(root: &Path, args: &[&str]) -> Result<String, AppError> {
    String::from_utf8(run_git_bytes(git_command(root, args))?)
        .map_err(|error| AppError::GitCommand(error.to_string()))
}

fn run_git_network(root: &Path, args: &[&str]) -> Result<String, AppError> {
    let mut command = git_command(root, args);
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("GCM_INTERACTIVE", "Never");
    String::from_utf8(run_git_bytes(command)?)
        .map_err(|error| AppError::GitCommand(error.to_string()))
}

fn parse_branch_name(header: &str) -> String {
    if let Some(branch) = header.strip_prefix("No commits yet on ") {
        return branch.to_owned();
    }
    if let Some(branch) = header.strip_prefix("Initial commit on ") {
        return branch.to_owned();
    }
    header
        .split("...")
        .next()
        .unwrap_or(header)
        .replace("HEAD (no branch)", "detached HEAD")
}

fn parse_git_status_porcelain(output: &[u8]) -> Result<ParsedGitStatus, AppError> {
    let mut tokens = output
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    let mut branch = "HEAD".to_owned();
    let mut entries = Vec::new();

    if let Some(token) = tokens.next() {
        if let Some(header) = token.strip_prefix(b"## ") {
            branch = parse_branch_name(&String::from_utf8_lossy(header));
        } else {
            return Err(AppError::GitStatusParse("缺少分支头信息".to_owned()));
        }
    }

    while let Some(token) = tokens.next() {
        if token.len() < 3 {
            return Err(AppError::GitStatusParse("存在损坏的状态记录".to_owned()));
        }
        let code = String::from_utf8_lossy(&token[..2]).into_owned();
        let path = String::from_utf8_lossy(&token[3..]).replace('\\', "/");
        if code.contains('R') || code.contains('C') {
            let previous_path = tokens
                .next()
                .ok_or_else(|| AppError::GitStatusParse("rename/copy 记录缺少源路径".to_owned()))?;
            entries.push(GitChange {
                code,
                path,
                previous_path: Some(String::from_utf8_lossy(previous_path).replace('\\', "/")),
            });
            continue;
        }
        entries.push(GitChange {
            code,
            path,
            previous_path: None,
        });
    }

    Ok(ParsedGitStatus { branch, entries })
}

fn parse_git_name_status(output: &[u8]) -> Result<Vec<GitChange>, AppError> {
    let mut tokens = output
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    let mut entries = Vec::new();

    while let Some(token) = tokens.next() {
        let code = String::from_utf8_lossy(token).into_owned();
        let path = tokens
            .next()
            .ok_or_else(|| AppError::GitStatusParse("diff name-status 记录缺少路径".to_owned()))?;
        if code.starts_with('R') || code.starts_with('C') {
            let renamed_to = tokens.next().ok_or_else(|| {
                AppError::GitStatusParse("diff rename 记录缺少目标路径".to_owned())
            })?;
            entries.push(GitChange {
                code,
                path: String::from_utf8_lossy(renamed_to).replace('\\', "/"),
                previous_path: Some(String::from_utf8_lossy(path).replace('\\', "/")),
            });
            continue;
        }
        entries.push(GitChange {
            code,
            path: String::from_utf8_lossy(path).replace('\\', "/"),
            previous_path: None,
        });
    }

    Ok(entries)
}

fn parse_git_numstat(output: &[u8]) -> Result<(usize, usize), AppError> {
    let mut fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut additions = 0;
    let mut deletions = 0;

    while let Some(record) = fields.next() {
        let mut parts = record.split(|byte| *byte == b'\t');
        let added = parts
            .next()
            .ok_or_else(|| AppError::GitStatusParse("diff numstat 记录缺少新增行数".to_owned()))?;
        let deleted = parts
            .next()
            .ok_or_else(|| AppError::GitStatusParse("diff numstat 记录缺少删除行数".to_owned()))?;
        let path = parts
            .next()
            .ok_or_else(|| AppError::GitStatusParse("diff numstat 记录缺少路径".to_owned()))?;

        additions += String::from_utf8_lossy(added)
            .parse::<usize>()
            .unwrap_or_default();
        deletions += String::from_utf8_lossy(deleted)
            .parse::<usize>()
            .unwrap_or_default();

        if path.is_empty() {
            let _ = fields.next().ok_or_else(|| {
                AppError::GitStatusParse("rename numstat 记录缺少源路径".to_owned())
            })?;
            let _ = fields.next().ok_or_else(|| {
                AppError::GitStatusParse("rename numstat 记录缺少目标路径".to_owned())
            })?;
        }
    }

    Ok((additions, deletions))
}

fn resolve_head_tree(root: &Path) -> Result<Option<String>, AppError> {
    let output = git_command(root, &["rev-parse", "--verify", "HEAD^{tree}"])
        .output()
        .map_err(|error| AppError::GitCommand(error.to_string()))?;
    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map(|value| Some(value.trim().to_owned()))
            .map_err(|error| AppError::GitCommand(error.to_string()));
    }

    let detail = String::from_utf8_lossy(&output.stderr);
    if detail.contains("Needed a single revision")
        || detail.contains("unknown revision")
        || detail.contains("ambiguous argument 'HEAD^{tree}'")
    {
        return Ok(None);
    }

    Err(AppError::GitCommand(detail.trim().to_owned()))
}

fn resolve_treeish(root: &Path, treeish: &str) -> Result<String, AppError> {
    let owned = format!("{treeish}^{{tree}}");
    run_git(root, &["rev-parse", "--verify", owned.as_str()]).map(|value| value.trim().to_owned())
}

fn is_git_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn capture_snapshot_tree(root: &Path) -> Result<String, AppError> {
    let tree = capture_worktree_tree(root)?;
    let reference = format!("refs/ai-desk/snapshots/{tree}");
    run_git(root, &["update-ref", reference.as_str(), tree.as_str()])?;
    Ok(tree)
}

/* 查询使用无引用的临时树，只有显式快照需要持久引用。 */
fn capture_worktree_tree(root: &Path) -> Result<String, AppError> {
    let head_tree = resolve_head_tree(root)?;
    capture_worktree_tree_from_head(root, head_tree.as_deref())
}

/* 同一次查询复用已解析的 HEAD（含尚无提交），不缓存后续请求的基线。 */
fn capture_worktree_tree_from_head(
    root: &Path,
    head_tree: Option<&str>,
) -> Result<String, AppError> {
    let temp_index = TempArtifact::new("git-index", "index")?;
    if let Some(head_tree) = head_tree {
        let mut read_tree = git_command(root, &["read-tree", head_tree]);
        read_tree.env("GIT_INDEX_FILE", &temp_index.path);
        run_git_bytes(read_tree)?;
    }

    let mut add = git_command(root, &["add", "-A", "--", "."]);
    add.env("GIT_INDEX_FILE", &temp_index.path);
    run_git_bytes(add)?;

    let mut write_tree = git_command(root, &["write-tree"]);
    write_tree.env("GIT_INDEX_FILE", &temp_index.path);
    run_git_bytes(write_tree).and_then(|stdout| {
        String::from_utf8(stdout)
            .map(|value| value.trim().to_owned())
            .map_err(|error| AppError::GitCommand(error.to_string()))
    })
}

fn snapshot_branch(root: &Path) -> Result<String, AppError> {
    let output = git_command(root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .output()
        .map_err(|error| AppError::GitCommand(error.to_string()))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned());
    }
    if output.status.code() == Some(1) {
        return Ok("HEAD".to_owned());
    }
    Err(AppError::GitCommand(
        String::from_utf8_lossy(&output.stderr).trim().to_owned(),
    ))
}

fn branch_status(root: &Path) -> Result<ParsedGitStatus, AppError> {
    let mut command = git_command(
        root,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--branch",
            "--untracked-files=all",
        ],
    );
    command.env("GIT_OPTIONAL_LOCKS", "0");
    let output = run_git_bytes(command)?;
    parse_git_status_porcelain(&output)
}

fn diff_changes_between_trees(
    root: &Path,
    baseline_tree: &str,
    current_tree: &str,
) -> Result<Vec<GitChange>, AppError> {
    let output = run_git_bytes(git_command(
        root,
        &[
            "diff",
            "--name-status",
            "-z",
            "--find-renames",
            baseline_tree,
            current_tree,
            "--",
        ],
    ))?;
    parse_git_name_status(&output)
}

fn diff_numstat_between_trees(
    root: &Path,
    baseline_tree: &str,
    current_tree: &str,
) -> Result<(usize, usize), AppError> {
    let output = run_git_bytes(git_command(
        root,
        &[
            "diff",
            "--numstat",
            "-z",
            "--find-renames",
            baseline_tree,
            current_tree,
            "--",
        ],
    ))?;
    parse_git_numstat(&output)
}

fn snapshot_status(root: &Path, baseline_tree: &str) -> Result<GitStatus, AppError> {
    let current_tree = capture_worktree_tree(root)?;
    snapshot_status_between(root, baseline_tree, &current_tree)
}

fn snapshot_status_scoped(
    root: &Path,
    baseline_tree: &str,
    end_tree: &str,
    paths: &[String],
) -> Result<GitStatus, AppError> {
    let branch = snapshot_branch(root)?;
    /* 全量撤销后没有需要展示的剩余文件，直接返回 clean 状态 */
    if paths.is_empty() {
        return Ok(GitStatus {
            branch,
            clean: true,
            additions: 0,
            deletions: 0,
            files: Vec::new(),
        });
    }

    for path in paths {
        relative_workspace_path(root, path)?;
    }

    let requested: HashSet<_> = paths.iter().map(String::as_str).collect();
    let files: Vec<_> = diff_changes_between_trees(root, baseline_tree, end_tree)?
        .into_iter()
        .filter(|change| {
            requested.contains(change.path.as_str())
                || change
                    .previous_path
                    .as_deref()
                    .is_some_and(|path| requested.contains(path))
        })
        .collect();
    /* 先在完整差异中识别重命名，再按字面路径统计两端，避免将重命名算成新增。 */
    let selected_paths: Vec<_> = files
        .iter()
        .flat_map(|change| {
            std::iter::once(change.path.as_str()).chain(change.previous_path.as_deref())
        })
        .collect();

    let mut numstat_args = vec![
        "--literal-pathspecs",
        "diff",
        "--numstat",
        "-z",
        "--find-renames",
        baseline_tree,
        end_tree,
        "--",
    ];
    numstat_args.extend(selected_paths);
    let (additions, deletions) = if files.is_empty() {
        (0, 0)
    } else {
        parse_git_numstat(&run_git_bytes(git_command(root, &numstat_args))?)?
    };

    Ok(GitStatus {
        branch,
        clean: files.is_empty(),
        additions,
        deletions,
        files: files
            .into_iter()
            .map(|change| GitFileStatus {
                path: change.path,
                code: change.code,
            })
            .collect(),
    })
}

fn snapshot_status_between(
    root: &Path,
    baseline_tree: &str,
    end_tree: &str,
) -> Result<GitStatus, AppError> {
    let branch = snapshot_branch(root)?;
    let files = diff_changes_between_trees(root, baseline_tree, end_tree)?;
    let (additions, deletions) = diff_numstat_between_trees(root, baseline_tree, end_tree)?;

    Ok(GitStatus {
        branch,
        clean: files.is_empty(),
        additions,
        deletions,
        files: files
            .into_iter()
            .map(|change| GitFileStatus {
                path: change.path,
                code: change.code,
            })
            .collect(),
    })
}

fn porcelain_status(root: &Path) -> Result<GitStatus, AppError> {
    let status = branch_status(root)?;
    /* 干净状态已确定增删行数为零，无需临时索引和全工作区快照。 */
    if status.entries.is_empty() {
        return Ok(GitStatus {
            branch: status.branch,
            clean: true,
            additions: 0,
            deletions: 0,
            files: Vec::new(),
        });
    }
    let head_tree = resolve_head_tree(root)?;
    let baseline = head_tree.as_deref().unwrap_or(EMPTY_TREE_HASH);
    let current_tree = capture_worktree_tree_from_head(root, head_tree.as_deref())?;
    let (additions, deletions) = diff_numstat_between_trees(root, baseline, &current_tree)?;

    Ok(GitStatus {
        branch: status.branch,
        clean: status.entries.is_empty(),
        additions,
        deletions,
        files: status
            .entries
            .into_iter()
            .map(|change| GitFileStatus {
                path: change.path,
                code: change.code,
            })
            .collect(),
    })
}

fn snapshot_diff(root: &Path, baseline_tree: &str, path: &str) -> Result<String, AppError> {
    let current_tree = capture_worktree_tree(root)?;
    snapshot_diff_between(root, baseline_tree, &current_tree, path)
}

fn snapshot_diff_between(
    root: &Path,
    baseline_tree: &str,
    end_tree: &str,
    path: &str,
) -> Result<String, AppError> {
    let requested_path = relative_workspace_path(root, path)?;
    let changes = diff_changes_between_trees(root, baseline_tree, end_tree)?;

    let related = changes
        .iter()
        .find(|change| change.path == path || change.previous_path.as_deref() == Some(path));

    if related.is_none() && !requested_path.exists() {
        return Ok(String::new());
    }

    let mut args = vec![
        "--literal-pathspecs",
        "diff",
        "--no-ext-diff",
        "--no-color",
        "--unified=3",
        "--find-renames",
        baseline_tree,
        end_tree,
        "--",
    ];
    if let Some(change) = related {
        if let Some(previous_path) = change.previous_path.as_deref() {
            args.push(previous_path);
        }
        args.push(change.path.as_str());
    } else {
        args.push(path);
    }

    run_git(root, &args)
}

fn revert_snapshot(
    root: &Path,
    baseline_tree: &str,
    end_tree: &str,
    path: Option<&str>,
) -> Result<(), AppError> {
    let changes = diff_changes_between_trees(root, baseline_tree, end_tree)?;
    let selected: Vec<_> = changes
        .iter()
        .filter(|change| match path {
            Some(target) => {
                change.path == target || change.previous_path.as_deref() == Some(target)
            }
            None => true,
        })
        .collect();
    if selected.is_empty() {
        return Ok(());
    }
    let mut paths: Vec<_> = selected
        .iter()
        .flat_map(|change| {
            std::iter::once(change.path.as_str()).chain(change.previous_path.as_deref())
        })
        .collect();
    for path in &paths {
        relative_workspace_path(root, path)?;
    }

    /* 整批预检后续编辑，冲突时不修改任何文件；暂存区始终保持原样。 */
    let current_tree = capture_worktree_tree(root)?;
    let changed_paths = |tree: &str| -> Result<HashSet<String>, AppError> {
        let mut args = vec![
            "--literal-pathspecs",
            "diff",
            "--no-renames",
            "--name-only",
            "-z",
            tree,
            &current_tree,
            "--",
        ];
        args.extend(paths.iter().copied());
        let output = run_git_bytes(git_command(root, &args))?;
        let mut changed = HashSet::new();
        for path in output
            .split(|byte| *byte == 0)
            .filter(|path| !path.is_empty())
        {
            let path = String::from_utf8_lossy(path);
            let mut ancestor = path.as_ref();
            loop {
                changed.insert(ancestor.to_owned());
                let Some((parent, _)) = ancestor.rsplit_once('/') else {
                    break;
                };
                ancestor = parent;
            }
        }
        Ok(changed)
    };
    let from_baseline = changed_paths(baseline_tree)?;
    let from_end = changed_paths(end_tree)?;
    let mut pending = Vec::new();
    for change in selected {
        let related: Vec<_> = std::iter::once(change.path.as_str())
            .chain(change.previous_path.as_deref())
            .collect();
        let differs =
            |changed: &HashSet<String>| related.iter().any(|path| changed.contains(*path));
        /* 前端仍传原始快照：已恢复的整组路径跳过，重命名两端必须一起判断。 */
        if !differs(&from_baseline) {
            if matches!(change.code.chars().next(), Some('A' | 'C' | 'R'))
                && fs::symlink_metadata(root.join(&change.path)).is_ok()
            {
                return Err(AppError::GitCommand(
                    "撤销目标被新的文件或目录占用，已拒绝撤销".to_owned(),
                ));
            }
            continue;
        }
        if differs(&from_end) {
            return Err(AppError::GitCommand(
                "撤销目标存在快照之后的编辑，已拒绝撤销".to_owned(),
            ));
        }
        pending.extend(related);
    }
    paths = pending;
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec![
        "--literal-pathspecs",
        "diff",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        end_tree,
        baseline_tree,
        "--",
    ];
    args.extend(paths);
    let patch = run_git_bytes(git_command(root, &args))?;
    let artifact = TempArtifact::new("revert-patch", "patch")?;
    fs::write(&artifact.path, patch).map_err(|error| AppError::GitCommand(error.to_string()))?;
    /* 不使用 --reject 或 --index：Git 整批校验补丁，只修改工作区。
     * 预检与应用之间仍有 TOCTOU，无法锁住外部编辑器或保证跨进程事务。
     */
    let mut apply = git_command(root, &["apply", "--whitespace=nowarn"]);
    apply.arg(&artifact.path);
    run_git_bytes(apply)?;
    Ok(())
}

fn unstage_git_path(root: &Path, path: &str) -> Result<(), AppError> {
    if resolve_head_tree(root)?.is_some() {
        run_git(root, &["reset", "--mixed", "HEAD", "--", path])?;
    } else {
        run_git(
            root,
            &["rm", "--cached", "-r", "--ignore-unmatch", "--", path],
        )?;
    }
    Ok(())
}

fn execute_git_action(root: &Path, action: GitAction) -> Result<(), AppError> {
    match action {
        GitAction::StageAll => {
            run_git(root, &["add", "-A", "--", "."])?;
        }
        GitAction::UnstageAll => unstage_git_path(root, ".")?,
        GitAction::StageFile { path } => {
            relative_workspace_path(root, &path)?;
            run_git(root, &["add", "-A", "--", path.as_str()])?;
        }
        GitAction::UnstageFile { path } => {
            relative_workspace_path(root, &path)?;
            unstage_git_path(root, &path)?;
        }
        GitAction::Commit { message } => {
            let message = message.trim();
            if message.is_empty() || message.len() > 4096 {
                return Err(AppError::InvalidGitCommitMessage);
            }
            run_git(root, &["commit", "-m", message])?;
        }
        GitAction::Pull => {
            run_git_network(root, &["pull", "--ff-only"])?;
        }
        GitAction::Push => {
            run_git_network(root, &["push"])?;
        }
    }
    Ok(())
}

fn get_git_status(cwd: String) -> Result<GitStatus, String> {
    let root = workspace_root(&cwd)?;
    porcelain_status(&root).map_err(Into::into)
}

fn get_git_diff(cwd: String, path: String) -> Result<String, String> {
    let root = workspace_root(&cwd)?;
    let head_tree = resolve_head_tree(&root)?;
    let baseline = head_tree.as_deref().unwrap_or(EMPTY_TREE_HASH);
    let current_tree = capture_worktree_tree_from_head(&root, head_tree.as_deref())?;
    snapshot_diff_between(&root, baseline, &current_tree, &path).map_err(Into::into)
}

fn run_git_action(cwd: String, action: GitAction) -> Result<(), String> {
    let root = workspace_root(&cwd)?;
    execute_git_action(&root, action).map_err(Into::into)
}

fn capture_git_snapshot(cwd: String) -> Result<String, String> {
    let root = workspace_root(&cwd)?;
    capture_snapshot_tree(&root).map_err(Into::into)
}

fn get_git_snapshot_status(cwd: String, baseline: String) -> Result<GitStatus, String> {
    let root = workspace_root(&cwd)?;
    let baseline_tree = resolve_treeish(&root, &baseline)?;
    snapshot_status(&root, &baseline_tree).map_err(Into::into)
}

fn get_git_snapshot_status_between(
    cwd: String,
    baseline: String,
    end: String,
) -> Result<GitStatus, String> {
    let root = workspace_root(&cwd)?;
    let baseline_tree = resolve_treeish(&root, &baseline)?;
    let end_tree = resolve_treeish(&root, &end)?;
    snapshot_status_between(&root, &baseline_tree, &end_tree).map_err(Into::into)
}

fn get_git_snapshot_status_scoped(
    cwd: String,
    baseline: String,
    end: String,
    paths: Vec<String>,
) -> Result<GitStatus, String> {
    let root = workspace_root(&cwd)?;
    let baseline_tree = resolve_treeish(&root, &baseline)?;
    let end_tree = resolve_treeish(&root, &end)?;
    snapshot_status_scoped(&root, &baseline_tree, &end_tree, &paths).map_err(Into::into)
}

fn get_git_snapshot_diff(cwd: String, baseline: String, path: String) -> Result<String, String> {
    let root = workspace_root(&cwd)?;
    let baseline_tree = resolve_treeish(&root, &baseline)?;
    snapshot_diff(&root, &baseline_tree, &path).map_err(Into::into)
}

fn get_git_snapshot_diff_between(
    cwd: String,
    baseline: String,
    end: String,
    path: String,
) -> Result<String, String> {
    let root = workspace_root(&cwd)?;
    let baseline_tree = resolve_treeish(&root, &baseline)?;
    let end_tree = resolve_treeish(&root, &end)?;
    snapshot_diff_between(&root, &baseline_tree, &end_tree, &path).map_err(Into::into)
}

fn release_git_snapshot(cwd: String, snapshot: String) -> Result<(), String> {
    if !is_git_object_id(&snapshot) {
        return Err("无效的 Git snapshot id".to_owned());
    }
    let root = workspace_root(&cwd)?;
    let reference = format!("refs/ai-desk/snapshots/{snapshot}");
    run_git(&root, &["update-ref", "-d", reference.as_str()])?;
    Ok(())
}

fn revert_git_snapshot(
    cwd: String,
    baseline: String,
    end: String,
    path: Option<String>,
) -> Result<(), String> {
    let root = workspace_root(&cwd)?;
    let baseline_tree = resolve_treeish(&root, &baseline)?;
    let end_tree = resolve_treeish(&root, &end)?;
    revert_snapshot(&root, &baseline_tree, &end_tree, path.as_deref()).map_err(Into::into)
}

/* Git 子进程和文件 IO 放入阻塞池，避免占用 UI 或异步运行时工作线程。 */
mod git_commands {
    use super::*;

    macro_rules! blocking_command {
        ($name:ident($($arg:ident: $kind:ty),*) -> $result:ty) => {
            #[tauri::command]
            pub async fn $name($($arg: $kind),*) -> Result<$result, String> {
                tauri::async_runtime::spawn_blocking(move || super::$name($($arg),*))
                    .await
                    .map_err(|error| error.to_string())?
            }
        };
    }

    blocking_command!(get_git_status(cwd: String) -> GitStatus);
    blocking_command!(list_workspace_files(cwd: String) -> Vec<WorkspaceFile>);
    blocking_command!(read_workspace_file(cwd: String, path: String) -> FilePreview);
    blocking_command!(read_workspace_file_chunk(cwd: String, path: String, offset: u64, version: String) -> TextFileChunk);
    blocking_command!(get_git_diff(cwd: String, path: String) -> String);
    blocking_command!(run_git_action(cwd: String, action: GitAction) -> ());
    blocking_command!(capture_git_snapshot(cwd: String) -> String);
    blocking_command!(get_git_snapshot_status(cwd: String, baseline: String) -> GitStatus);
    blocking_command!(get_git_snapshot_status_between(cwd: String, baseline: String, end: String) -> GitStatus);
    blocking_command!(get_git_snapshot_status_scoped(cwd: String, baseline: String, end: String, paths: Vec<String>) -> GitStatus);
    blocking_command!(get_git_snapshot_diff(cwd: String, baseline: String, path: String) -> String);
    blocking_command!(get_git_snapshot_diff_between(cwd: String, baseline: String, end: String, path: String) -> String);
    blocking_command!(release_git_snapshot(cwd: String, snapshot: String) -> ());
    blocking_command!(revert_git_snapshot(cwd: String, baseline: String, end: String, path: Option<String>) -> ());
}

fn watch_path_relevant(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return true;
    };
    let mut components = relative.components();
    let Some(first) = components.next() else {
        return true;
    };
    let first = first.as_os_str().to_string_lossy().into_owned();
    if first == ".git" {
        let second = components
            .next()
            .map(|component| component.as_os_str().to_string_lossy().into_owned());
        return match second.as_deref() {
            Some("objects") => false,
            Some("refs") => {
                let third = components
                    .next()
                    .map(|component| component.as_os_str().to_string_lossy().into_owned());
                third.as_deref() != Some("ai-desk")
            }
            Some("logs") => {
                let third = components
                    .next()
                    .map(|component| component.as_os_str().to_string_lossy().into_owned());
                if third.as_deref() == Some("refs") {
                    let fourth = components
                        .next()
                        .map(|component| component.as_os_str().to_string_lossy().into_owned());
                    fourth.as_deref() != Some("ai-desk")
                } else {
                    true
                }
            }
            _ => true,
        };
    }
    !ignored_workspace_directory(&first)
        && !components.any(|component| {
            ignored_workspace_directory(&component.as_os_str().to_string_lossy())
        })
}

fn watch_event_relevant(root: &Path, event: &Event) -> bool {
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event.paths.iter().any(|path| watch_path_relevant(root, path))
}

fn spawn_workspace_watch(
    app: AppHandle,
    cwd: String,
    root: PathBuf,
    receiver: Receiver<notify::Result<Event>>,
) {
    std::thread::spawn(move || {
        let mut pending = false;
        loop {
            match receiver.recv_timeout(Duration::from_millis(300)) {
                Ok(Ok(event)) => {
                    if watch_event_relevant(&root, &event) {
                        pending = true;
                    }
                }
                Ok(Err(_)) => {}
                Err(RecvTimeoutError::Timeout) => {
                    if pending {
                        pending = false;
                        let _ = app.emit("workspace-changed", WorkspaceChanged { cwd: cwd.clone() });
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

#[tauri::command]
fn start_workspace_watch(
    app: AppHandle,
    state: State<'_, WorkspaceWatcherState>,
    cwd: String,
) -> Result<(), String> {
    let root = workspace_root(&cwd)?;
    let (tx, rx) = channel::<notify::Result<Event>>();
    let mut watcher = recommended_watcher(tx).map_err(|error| AppError::GitCommand(error.to_string()))?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| AppError::GitCommand(error.to_string()))?;
    spawn_workspace_watch(app, cwd, root, rx);
    let mut guard = state
        .watcher
        .lock()
        .map_err(|_| "工作区监听状态不可用".to_owned())?;
    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
fn stop_workspace_watch(state: State<'_, WorkspaceWatcherState>) -> Result<(), String> {
    let mut guard = state
        .watcher
        .lock()
        .map_err(|_| "工作区监听状态不可用".to_owned())?;
    *guard = None;
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
                .expect("初始化更新插件失败");
            Ok(())
        })
        .manage(PiProcessRegistry::default())
        .manage(WorkspaceWatcherState::default())
        .invoke_handler(tauri::generate_handler![
            list_pi_projects,
            read_pi_session,
            rename_pi_session,
            preflight_pi_runtime,
            start_pi_process,
            send_pi_command,
            list_pi_processes,
            stop_pi_process,
            list_pi_packages,
            install_pi_package,
            remove_pi_package,
            git_commands::list_workspace_files,
            git_commands::read_workspace_file,
            git_commands::read_workspace_file_chunk,
            git_commands::get_git_status,
            git_commands::get_git_diff,
            git_commands::run_git_action,
            git_commands::capture_git_snapshot,
            git_commands::get_git_snapshot_status,
            git_commands::get_git_snapshot_status_between,
            git_commands::get_git_snapshot_status_scoped,
            git_commands::get_git_snapshot_diff,
            git_commands::get_git_snapshot_diff_between,
            git_commands::release_git_snapshot,
            git_commands::revert_git_snapshot,
            start_workspace_watch,
            stop_workspace_watch
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if EXITING.load(Ordering::SeqCst) {
                    /* 真正退出（Cmd+Q 或程序化退出）：停止 Pi 进程后放行关闭。 */
                    let registry = window.state::<PiProcessRegistry>();
                    stop_all_pi_processes(&registry);
                } else {
                    /* 关闭按钮改为最小化到 Dock，保持双 Command 后台监听。 */
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building ai-desk application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            EXITING.store(true, Ordering::SeqCst);
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
            if !has_visible_windows {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        /* 非 macOS 平台无 Reopen 事件，保留引用避免未使用告警。 */
        #[cfg(not(target_os = "macos"))]
        let _ = &app_handle;
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;
    use std::time::{Duration, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(prefix: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or(Duration::from_secs(0))
                .as_nanos();
            let counter = TEMP_ARTIFACT_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!("ai-desk-{prefix}-{unique}-{counter}"));
            fs::create_dir_all(&path).expect("create test dir");
            let path = path.canonicalize().expect("canonical test dir");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn git(repo: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo)
            .output()
            .expect("run git command");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn write_file(root: &Path, relative: impl AsRef<Path>, content: &str) {
        let path = root.join(relative.as_ref());
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, content).expect("write file");
    }

    fn setup_git_repo() -> TestDir {
        let repo = TestDir::new("git");
        git(repo.path(), &["init"]);
        git(repo.path(), &["config", "user.name", "AI Desk"]);
        git(
            repo.path(),
            &["config", "user.email", "ai-desk@example.com"],
        );
        write_file(repo.path(), OsStr::new("old name.txt"), "line1\n");
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["commit", "-m", "init"]);
        fs::rename(
            repo.path().join("old name.txt"),
            repo.path().join("new name.txt"),
        )
        .expect("rename tracked file");
        write_file(repo.path(), OsStr::new("new name.txt"), "line1\nline2\n");
        write_file(
            repo.path(),
            Path::new("untracked dir").join("spaced file.txt"),
            "hello\nworld\n",
        );
        repo
    }

    fn git_output(repo: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo)
            .output()
            .expect("run git command");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).expect("git output utf8")
    }

    #[test]
    fn parse_git_status_porcelain_should_handle_branch_and_rename_records() {
        let parsed = parse_git_status_porcelain(
            b"## main...origin/main [ahead 1]\0R  new name.txt\0old name.txt\0?? untracked dir/spaced file.txt\0",
        )
        .expect("parse status");

        assert_eq!(parsed.branch, "main");
        assert_eq!(parsed.entries.len(), 2);
        assert_eq!(parsed.entries[0].code, "R ");
        assert_eq!(
            parsed.entries[0].previous_path.as_deref(),
            Some("old name.txt")
        );
        assert_eq!(parsed.entries[0].path, "new name.txt");
        assert_eq!(parsed.entries[1].path, "untracked dir/spaced file.txt");
    }

    #[test]
    fn parse_pi_version_should_extract_semver_token() {
        assert_eq!(
            parse_pi_version("pi version v0.84.2\n"),
            Some("0.84.2".to_owned())
        );
        assert_eq!(parse_pi_version("pi --version => invalid"), None);
    }

    #[test]
    fn parse_pi_packages_should_read_string_and_object_forms() {
        let settings = serde_json::json!({
            "packages": [
                "npm:some-plugin",
                { "source": "git:github.com/user/repo", "skills": ["review"] },
                "/abs/path/plugin"
            ]
        });
        assert_eq!(
            parse_pi_packages(&settings),
            vec![
                "npm:some-plugin".to_owned(),
                "git:github.com/user/repo".to_owned(),
                "/abs/path/plugin".to_owned(),
            ]
        );
    }

    #[test]
    fn parse_pi_packages_should_ignore_blank_or_missing_sources() {
        let settings = serde_json::json!({
            "packages": ["  ", { "skills": [] }, "npm:ok"]
        });
        assert_eq!(parse_pi_packages(&settings), vec!["npm:ok".to_owned()]);
    }

    #[test]
    fn pi_package_kind_should_classify_sources() {
        assert_eq!(pi_package_kind("npm:@foo/bar"), "npm");
        assert_eq!(pi_package_kind("git:github.com/a/b"), "git");
        assert_eq!(pi_package_kind("https://github.com/a/b"), "git");
        assert_eq!(pi_package_kind("./local/plugin"), "local");
    }

    #[test]
    fn collect_pi_packages_should_merge_global_and_project_scopes() {
        let dir = TestDir::new("pi-packages");
        let global = dir.path().join("global-settings.json");
        let project = dir.path().join("project-settings.json");
        write_file(
            dir.path(),
            "global-settings.json",
            r#"{"packages":["npm:a","npm:b"]}"#,
        );
        write_file(
            dir.path(),
            "project-settings.json",
            r#"{"packages":["npm:b","git:c"]}"#,
        );
        let packages = collect_pi_packages(&global, Some(&project));
        let scoped: Vec<(String, String)> = packages
            .iter()
            .map(|package| (package.scope.clone(), package.source.clone()))
            .collect();
        assert_eq!(
            scoped,
            vec![
                ("global".to_owned(), "npm:a".to_owned()),
                ("global".to_owned(), "npm:b".to_owned()),
                ("project".to_owned(), "npm:b".to_owned()),
                ("project".to_owned(), "git:c".to_owned()),
            ]
        );
    }

    #[test]
    fn validate_pi_package_source_should_reject_invalid_input() {
        assert!(validate_pi_package_source("npm:ok").is_ok());
        assert!(validate_pi_package_source("  npm:ok  ").is_ok());
        assert!(validate_pi_package_source("").is_err());
        assert!(validate_pi_package_source("a\nb").is_err());
        assert!(validate_pi_package_source(&"x".repeat(1025)).is_err());
    }

    #[test]
    fn pi_package_command_args_should_build_global_and_local_forms() {
        assert_eq!(
            pi_package_command_args("install", "npm:ok", false),
            vec![
                "install".to_owned(),
                "npm:ok".to_owned(),
                "--no-approve".to_owned()
            ]
        );
        assert_eq!(
            pi_package_command_args("remove", " git:ok ", true),
            vec![
                "remove".to_owned(),
                "git:ok".to_owned(),
                "-l".to_owned(),
                "--approve".to_owned()
            ]
        );
    }

    #[test]
    fn paged_text_should_reassemble_large_utf8_file() {
        let workspace = TestDir::new("paged-text");
        let content = "中文分页\n".repeat(50_000);
        assert!(content.len() as u64 > TEXT_PREVIEW_MAX_BYTES);
        write_file(workspace.path(), "large.txt", &content);
        let cwd = workspace.path().to_string_lossy().into_owned();
        let preview = read_workspace_file(cwd.clone(), "large.txt".to_owned()).unwrap();
        let json = serde_json::to_value(&preview).unwrap();
        assert_eq!(json["kind"], "pagedText");
        assert_eq!(json["path"], "large.txt");
        assert_eq!(json["size"], content.len() as u64);
        let FilePreview::PagedText { version, .. } = preview else {
            panic!("expected paged text");
        };
        let mut result = String::new();
        let mut offset = 0;
        while offset < content.len() as u64 {
            let chunk = read_workspace_file_chunk(
                cwd.clone(),
                "large.txt".to_owned(),
                offset,
                version.clone(),
            )
            .unwrap();
            assert!(chunk.content.len() <= TEXT_CHUNK_MAX_BYTES);
            assert!(chunk.next_offset > offset);
            assert_eq!(chunk.next_offset, offset + chunk.content.len() as u64);
            assert_eq!(chunk.size, content.len() as u64);
            offset = chunk.next_offset;
            result.push_str(&chunk.content);
        }
        assert_eq!(result, content);
    }

    fn text_chunk(workspace: &TestDir, offset: u64) -> Result<TextFileChunk, String> {
        let path = workspace.path().join("text.txt");
        let version = text_file_version(&path, &fs::metadata(&path).unwrap()).unwrap();
        read_workspace_file_chunk(
            workspace.path().to_string_lossy().into_owned(),
            "text.txt".to_owned(),
            offset,
            version,
        )
    }

    #[test]
    fn paged_text_should_preserve_partial_multibyte_characters() {
        let workspace = TestDir::new("text-boundary");
        for character in ["中", "𠮷"] {
            for tail in 1..character.len() {
                let prefix = "a".repeat(TEXT_CHUNK_MAX_BYTES - tail);
                let content = format!("{prefix}{character}结束");
                write_file(workspace.path(), "text.txt", &content);
                let first = text_chunk(&workspace, 0).unwrap();
                assert_eq!(first.content, prefix);
                assert_eq!(first.next_offset, prefix.len() as u64);
                let second = text_chunk(&workspace, first.next_offset).unwrap();
                assert_eq!(second.content, format!("{character}结束"));
                assert_eq!(second.next_offset, content.len() as u64);
            }
        }
    }

    #[test]
    fn paged_text_should_handle_eof_empty_and_invalid_offsets() {
        let workspace = TestDir::new("text-eof");
        for content in ["", "中文"] {
            write_file(workspace.path(), "text.txt", content);
            let size = content.len() as u64;
            let chunk = text_chunk(&workspace, size).unwrap();
            assert!(chunk.content.is_empty());
            assert_eq!(chunk.next_offset, size);
            assert_eq!(chunk.size, size);
            assert_eq!(
                serde_json::to_value(&chunk).unwrap(),
                serde_json::json!({
                    "content": "", "nextOffset": size, "size": size,
                })
            );
            assert!(text_chunk(&workspace, size + 1)
                .unwrap_err()
                .contains("偏移"));
            assert!(text_chunk(&workspace, u64::MAX).is_err());
        }
        assert!(text_chunk(&workspace, 1).unwrap_err().contains("UTF-8"));
    }

    #[test]
    fn paged_text_should_reject_invalid_utf8_including_truncated_eof() {
        let workspace = TestDir::new("text-invalid");
        for bytes in [vec![b'a', 0xff], vec![0xe4, 0xb8], vec![0xc0, 0x80]] {
            fs::write(workspace.path().join("text.txt"), bytes).unwrap();
            assert!(text_chunk(&workspace, 0).unwrap_err().contains("UTF-8"));
        }
        let mut bytes = vec![b'a'; TEXT_CHUNK_MAX_BYTES - 1];
        bytes.extend_from_slice(&[0xe4, 0xff]);
        fs::write(workspace.path().join("text.txt"), bytes).unwrap();
        let first = text_chunk(&workspace, 0).unwrap();
        assert_eq!(first.next_offset, (TEXT_CHUNK_MAX_BYTES - 1) as u64);
        assert!(text_chunk(&workspace, first.next_offset)
            .unwrap_err()
            .contains("UTF-8"));
    }

    #[test]
    fn paged_text_should_reject_stale_version_after_resize_or_replacement() {
        let workspace = TestDir::new("text-version");
        let path = workspace.path().join("text.txt");
        let cwd = workspace.path().to_string_lossy().into_owned();
        for replacement in ["changed size", "other"] {
            write_file(workspace.path(), "text.txt", "hello");
            let original = fs::metadata(&path).unwrap();
            let version = text_file_version(&path, &original).unwrap();
            if replacement == "other" {
                let new_path = workspace.path().join("replacement.txt");
                fs::write(&new_path, replacement).unwrap();
                File::options()
                    .write(true)
                    .open(&new_path)
                    .unwrap()
                    .set_times(fs::FileTimes::new().set_modified(original.modified().unwrap()))
                    .unwrap();
                fs::rename(new_path, &path).unwrap();
            } else {
                fs::write(&path, replacement).unwrap();
            }
            assert!(
                read_workspace_file_chunk(cwd.clone(), "text.txt".to_owned(), 0, version,)
                    .unwrap_err()
                    .contains("文件已改变")
            );
        }
    }

    #[test]
    fn paged_text_should_reject_same_size_rewrite() {
        let workspace = TestDir::new("text-same-size");
        let path = workspace.path().join("text.txt");
        write_file(workspace.path(), "text.txt", "first");
        let metadata = fs::metadata(&path).unwrap();
        let version = text_file_version(&path, &metadata).unwrap();
        fs::write(&path, "other").unwrap();
        File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(metadata.modified().unwrap() + Duration::from_secs(1)),
            )
            .unwrap();
        assert!(read_workspace_file_chunk(
            workspace.path().to_string_lossy().into_owned(),
            "text.txt".to_owned(),
            0,
            version,
        )
        .unwrap_err()
        .contains("文件已改变"));
    }

    #[test]
    fn paged_text_should_bound_reads_for_long_single_line() {
        let workspace = TestDir::new("text-long-line");
        let content = "x".repeat(2 * 1024 * 1024 + 17);
        write_file(workspace.path(), "text.txt", &content);
        for offset in [0, TEXT_CHUNK_MAX_BYTES as u64, content.len() as u64 - 17] {
            let chunk = text_chunk(&workspace, offset).unwrap();
            let expected = (content.len() - offset as usize).min(TEXT_CHUNK_MAX_BYTES);
            assert_eq!(chunk.content.len(), expected);
            assert_eq!(chunk.next_offset, offset + expected as u64);
        }
    }

    #[test]
    fn paged_text_should_keep_small_text_preview_at_threshold() {
        let workspace = TestDir::new("text-threshold");
        let content = "a".repeat(TEXT_PREVIEW_MAX_BYTES as usize);
        write_file(workspace.path(), "text.txt", &content);
        let FilePreview::Text {
            content: actual, ..
        } = read_workspace_file(
            workspace.path().to_string_lossy().into_owned(),
            "text.txt".to_owned(),
        )
        .unwrap()
        else {
            panic!("expected small text preview")
        };
        assert_eq!(actual, content);
    }

    #[test]
    fn read_workspace_file_should_preview_png() {
        let workspace = TestDir::new("image-preview");
        let png = BASE64
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8WQAAAAASUVORK5CYII=")
            .expect("decode png fixture");
        fs::write(workspace.path().join("pixel.png"), &png).expect("write png");

        let preview = read_workspace_file(
            workspace.path().to_string_lossy().into_owned(),
            "pixel.png".to_owned(),
        )
        .expect("preview png");
        let serialized = serde_json::to_value(&preview).expect("serialize preview");

        assert_eq!(serialized["kind"], "image");
        assert_eq!(serialized["mimeType"], "image/png");

        match preview {
            FilePreview::Image {
                path,
                mime_type,
                data,
            } => {
                assert_eq!(path, "pixel.png");
                assert_eq!(mime_type, "image/png");
                assert_eq!(data, BASE64.encode(&png));
            }
            _ => panic!("expected image preview"),
        }
    }

    #[test]
    fn image_mime_detection_should_match_pi_supported_formats() {
        let png = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52,
        ];
        let mut bmp = [0_u8; 30];
        bmp[0..2].copy_from_slice(b"BM");
        bmp[2..6].copy_from_slice(&58_u32.to_le_bytes());
        bmp[10..14].copy_from_slice(&54_u32.to_le_bytes());
        bmp[14..18].copy_from_slice(&40_u32.to_le_bytes());
        bmp[26..28].copy_from_slice(&1_u16.to_le_bytes());
        bmp[28..30].copy_from_slice(&24_u16.to_le_bytes());

        assert_eq!(
            detect_supported_image_mime_type(&[0xff, 0xd8, 0xff, 0xe0]),
            Some("image/jpeg")
        );
        assert_eq!(detect_supported_image_mime_type(&png), Some("image/png"));
        assert_eq!(
            detect_supported_image_mime_type(b"GIF89a"),
            Some("image/gif")
        );
        assert_eq!(
            detect_supported_image_mime_type(b"RIFF\0\0\0\0WEBP"),
            Some("image/webp")
        );
        assert_eq!(detect_supported_image_mime_type(&bmp), Some("image/bmp"));
        assert_eq!(detect_supported_image_mime_type(b"<svg></svg>"), None);
    }

    #[test]
    fn validate_pi_command_should_reject_unknown_or_malformed_commands() {
        assert!(validate_pi_command(&serde_json::json!({
            "type": "prompt",
            "id": "prompt-1",
            "message": "检查项目"
        }))
        .is_ok());
        assert!(validate_pi_command(&serde_json::json!({
            "type": "steer",
            "id": "steer-1",
            "message": "调整当前任务"
        }))
        .is_ok());
        assert!(validate_pi_command(&serde_json::json!({
            "type": "get_session_stats",
            "id": "stats-1"
        }))
        .is_ok());
        assert!(validate_pi_command(&serde_json::json!({
            "type": "shell",
            "id": "shell-1",
            "command": "rm -rf /"
        }))
        .is_err());
        assert!(validate_pi_command(&serde_json::json!({
            "type": "set_model",
            "id": "model-1",
            "provider": "openai"
        }))
        .is_err());
    }

    #[test]
    fn packaged_pi_candidate_should_win_over_development_binary() {
        let app_dir = TestDir::new("packaged-app");
        write_file(app_dir.path(), "ai-desk", "app");
        write_file(app_dir.path(), "pi", "sidecar");

        let resolved = resolve_pi_executable_from(Some(&app_dir.path().join("ai-desk")))
            .expect("resolve packaged sidecar");

        assert_eq!(resolved, app_dir.path().join("pi"));
    }

    #[test]
    fn active_session_branch_should_move_messages_without_duplicate_payload() {
        let root = serde_json::json!({"id":"root", "message":{"content":"first"}});
        let old_branch = serde_json::json!({"id":"old", "parentId":"root"});
        let leaf = serde_json::json!({"id":"leaf", "parentId":"root", "message":{"content":"x".repeat(65536)}});
        let content_ptr = leaf["message"]["content"].as_str().unwrap().as_ptr();
        let (leaf_id, active) = active_entries(vec![root, old_branch, leaf]);
        assert_eq!(leaf_id.as_deref(), Some("leaf"));
        assert_eq!(active.len(), 2);
        assert_eq!(active[0]["id"], "root");
        assert_eq!(active[1]["message"]["content"].as_str().unwrap().as_ptr(), content_ptr);
        let view = SessionView { id: "session".into(), cwd: "/workspace".into(), name: None, leaf_id, active_entries: active };
        let payload = serde_json::to_value(view).unwrap();
        assert!(payload.get("entries").is_none());
        assert_eq!(payload["activeEntries"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn active_session_branch_should_terminate_for_cycles_and_missing_parents() {
        let (_, cyclic) = active_entries(vec![
            serde_json::json!({"id":"a", "parentId":"b"}),
            serde_json::json!({"id":"b", "parentId":"a"}),
        ]);
        assert_eq!(cyclic.len(), 2);
        assert_eq!(cyclic[0]["id"], "a");
        let (_, missing) = active_entries(vec![serde_json::json!({"id":"a", "parentId":"missing"})]);
        assert_eq!(missing.len(), 1);
        assert_eq!(active_entries(Vec::new()), (None, Vec::new()));
    }

    #[test]
    fn workspace_watch_should_ignore_nested_build_and_dependency_directories() {
        let root = Path::new("/workspace");
        for relative in ["node_modules/a.js", "packages/app/node_modules/a.js", "crates/app/target/debug/app", "packages/app/dist/index.js", ".git/objects/ab/cd", ".git/refs/ai-desk/snapshot"] {
            assert!(!watch_path_relevant(root, &root.join(relative)), "{relative}");
        }
        for relative in ["packages/app/src/index.ts", ".git/index", ".git/refs/heads/main"] {
            assert!(watch_path_relevant(root, &root.join(relative)), "{relative}");
        }
    }

    #[test]
    fn streamed_project_summaries_should_describe_image_only_messages() {
        for content in [
            serde_json::json!([{"type":"image", "data":"synthetic-image", "mimeType":"image/png"}]),
            serde_json::json!([{"type":"text", "text":""}, {"type":"image", "data":"synthetic-image", "mimeType":"image/png"}]),
            serde_json::json!([{"type":"text", "text":"  \n "}, {"type":"image", "data":"synthetic-image", "mimeType":"image/png"}]),
        ] {
            let root = TestDir::new("image-session-summary");
            let file = root.path().join("session.jsonl");
            let mut output = File::create(&file).unwrap();
            for entry in [
                serde_json::json!({"type":"session", "id":"image-session", "cwd":"/workspace"}),
                serde_json::json!({"type":"message", "message":{"role":"user", "content":content}}),
                serde_json::json!({"type":"message", "message":{"role":"assistant", "content":"图片分析结果"}}),
            ] {
                writeln!(output, "{entry}").unwrap();
            }
            let projects = list_pi_projects_at(root.path()).unwrap();
            let summary = &projects[0].conversations[0];
            assert_eq!(summary.title, "[图片]");
            assert_eq!(summary.preview, "[图片]");
            assert_eq!(summary.message_count, 2);
        }
    }

    #[test]
    fn message_summary_should_preserve_text_and_ignore_empty_content() {
        for content in [
            serde_json::json!("检查图片"),
            serde_json::json!([{"type":"image", "data":"synthetic-image"}, {"type":"text", "text":"检查图片"}]),
        ] {
            assert_eq!(message_text(&serde_json::json!({"message":{"content":content}})).as_deref(), Some("检查图片"));
        }
        for content in [serde_json::json!(""), serde_json::json!("  \n "), serde_json::json!([]), serde_json::json!([{"type":"text", "text":" "}])] {
            assert_eq!(message_text(&serde_json::json!({"message":{"content":content}})), None);
        }
    }

    #[test]
    fn streamed_project_summaries_should_preserve_session_metadata() {
        let root = TestDir::new("streamed-session-summary");
        let file = root.path().join("session.jsonl");
        let entries = [
            serde_json::json!({"type":"session", "id":"s1", "cwd":"/workspace", "timestamp":"2026-09-07T08:00:00Z"}),
            serde_json::json!({"type":"message", "timestamp":"2026-09-07T08:01:00Z", "message":{"content":[{"text":"首条消息"},{"text":"内容"}]}}),
            serde_json::json!({"type":"session_info", "name":"  新名称  "}),
            serde_json::json!({"type":"message", "timestamp":"2026-09-07T08:02:00Z", "message":{"content":"后续输出"}}),
        ];
        let mut output = File::create(&file).unwrap();
        for entry in entries {
            writeln!(output, "{entry}").unwrap();
        }
        writeln!(output, "invalid partial json").unwrap();
        let projects = list_pi_projects_at(root.path()).unwrap();
        let summary = &projects[0].conversations[0];
        assert_eq!(projects[0].path, "/workspace");
        assert_eq!(summary.title, "新名称");
        assert_eq!(summary.preview, "首条消息 内容");
        assert_eq!(summary.modified_at, "2026-09-07T08:02:00Z");
        assert_eq!(summary.message_count, 2);
        writeln!(output, "{}", serde_json::json!({"type":"session_info", "name":" "})).unwrap();
        writeln!(output, "{}", serde_json::json!({"type":"message", "message":{"content":"no timestamp"}})).unwrap();
        let projects = list_pi_projects_at(root.path()).unwrap();
        let summary = &projects[0].conversations[0];
        assert_eq!(summary.title, "首条消息 内容");
        assert_eq!(summary.modified_at, "2026-09-07T08:00:00Z");
        assert_eq!(summary.message_count, 3);
    }

    #[test]
    fn streamed_project_summaries_should_not_retain_large_tool_outputs() {
        let root = TestDir::new("large-session-summary");
        let file = root.path().join("large.jsonl");
        let mut output = File::create(&file).unwrap();
        writeln!(output, "{}", serde_json::json!({"type":"session", "id":"large", "cwd":"/workspace"})).unwrap();
        let entry = serde_json::json!({"type":"message", "message":{"content":"文".repeat(4096)}});
        for _ in 0..1000 {
            writeln!(output, "{entry}").unwrap();
        }
        let started = std::time::Instant::now();
        let parsed = parse_session(&file).unwrap();
        let retained_entries = parsed.entries.len();
        let expected = summary_for_session(parsed);
        let full_duration = started.elapsed();
        let started = std::time::Instant::now();
        let mut builder = SessionSummaryBuilder::default();
        let header = visit_session(&file, |entry| builder.push(&entry)).unwrap();
        assert_eq!(builder.first_message.as_ref().unwrap().chars().count(), 48);
        let summary = builder.finish(&header, &file);
        let stream_duration = started.elapsed();
        assert_eq!(serde_json::to_value(summary).unwrap(), serde_json::to_value(expected).unwrap());
        eprintln!("session summary: full={full_duration:?}, streaming={stream_duration:?}, retained entries={retained_entries} -> 0");
    }

    #[test]
    fn session_name_should_use_latest_info_and_allow_explicit_clear() {
        let named = vec![
            serde_json::json!({ "type": "session_info", "name": "旧名称" }),
            serde_json::json!({ "type": "session_info", "name": "新名称" }),
        ];
        let cleared = vec![
            serde_json::json!({ "type": "session_info", "name": "旧名称" }),
            serde_json::json!({ "type": "session_info", "name": "   " }),
        ];

        assert_eq!(session_name(&named).as_deref(), Some("新名称"));
        assert_eq!(session_name(&cleared), None);
    }

    #[test]
    fn session_summary_should_ignore_rename_for_activity_order() {
        let session = ParsedSession {
            header: serde_json::json!({
                "type": "session",
                "id": "session-1",
                "timestamp": "2026-08-01T08:00:00.000Z"
            }),
            entries: vec![
                serde_json::json!({
                    "type": "message",
                    "timestamp": "2026-08-02T08:00:00.000Z",
                    "message": { "content": "hello" }
                }),
                serde_json::json!({
                    "type": "session_info",
                    "timestamp": "2026-08-03T08:00:00.000Z",
                    "name": "新名称"
                }),
            ],
            path: PathBuf::from("session.jsonl"),
        };

        assert_eq!(
            summary_for_session(session).modified_at,
            "2026-08-02T08:00:00.000Z"
        );
    }

    #[test]
    fn append_session_name_should_write_parseable_session_info() {
        let dir = TestDir::new("session-name");
        let path = dir.path().join("session.jsonl");
        write_file(
            dir.path(),
            "session.jsonl",
            "{\"type\":\"session\",\"id\":\"session-1\",\"timestamp\":\"2026-08-01T08:00:00.000Z\",\"cwd\":\"/tmp\"}\n",
        );

        append_session_name(&path, "新名称", "2026-08-02T08:00:00.000Z").expect("append name");
        let parsed = parse_session(&path).expect("parse session");

        assert_eq!(session_name(&parsed.entries).as_deref(), Some("新名称"));
    }

    #[test]
    fn clean_git_status_should_not_capture_the_worktree() {
        let repo = setup_git_repo();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-m", "clean"]);
        let index = fs::read(repo.path().join(".git/index")).unwrap();
        GIT_COMMAND_COUNT.with(|count| count.set(0));
        let status = get_git_status(repo.path().to_string_lossy().into_owned()).unwrap();
        GIT_COMMAND_COUNT.with(|count| assert_eq!(count.get(), 1));
        assert!(status.clean);
        assert!(status.files.is_empty());
        assert_eq!((status.additions, status.deletions), (0, 0));
        assert_eq!(fs::read(repo.path().join(".git/index")).unwrap(), index);

        let empty = TestDir::new("empty-status");
        git(empty.path(), &["init"]);
        GIT_COMMAND_COUNT.with(|count| count.set(0));
        let status = get_git_status(empty.path().to_string_lossy().into_owned()).unwrap();
        GIT_COMMAND_COUNT.with(|count| assert_eq!(count.get(), 1));
        assert!(status.clean);
        assert_eq!((status.additions, status.deletions), (0, 0));
        assert!(!empty.path().join(".git/index").exists());
    }

    #[test]
    fn git_queries_should_reuse_head_and_preserve_index_and_rename() {
        let repo = setup_git_repo();
        git(repo.path(), &["add", "-A"]);
        write_file(repo.path(), "new name.txt", "line1\nline3\n");
        let index_before = fs::read(repo.path().join(".git/index")).unwrap();
        let refs_before = git_output(repo.path(), &["show-ref"]);

        GIT_COMMAND_COUNT.with(|count| count.set(0));
        let status = get_git_status(repo.path().to_string_lossy().into_owned()).unwrap();
        GIT_COMMAND_COUNT.with(|count| assert_eq!(count.get(), 6));
        assert!(!status.clean);
        assert_eq!((status.additions, status.deletions), (3, 0));
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "new name.txt" && file.code == "RM"));

        GIT_COMMAND_COUNT.with(|count| count.set(0));
        let diff = get_git_diff(
            repo.path().to_string_lossy().into_owned(),
            "new name.txt".to_owned(),
        )
        .unwrap();
        GIT_COMMAND_COUNT.with(|count| assert_eq!(count.get(), 6));
        assert!(diff.contains("rename from old name.txt"));
        assert!(diff.contains("rename to new name.txt"));
        assert!(diff.contains("+line3"));
        assert_eq!(
            fs::read(repo.path().join(".git/index")).unwrap(),
            index_before
        );
        assert_eq!(git_output(repo.path(), &["show-ref"]), refs_before);
    }

    #[test]
    fn git_queries_should_reuse_missing_head() {
        let repo = TestDir::new("git-unborn-queries");
        git(repo.path(), &["init"]);
        write_file(repo.path(), "new.txt", "one\ntwo\n");

        GIT_COMMAND_COUNT.with(|count| count.set(0));
        let status = get_git_status(repo.path().to_string_lossy().into_owned()).unwrap();
        GIT_COMMAND_COUNT.with(|count| assert_eq!(count.get(), 5));
        assert!(!status.clean);
        assert_eq!((status.additions, status.deletions), (2, 0));
        assert_eq!(status.files.len(), 1);
        assert_eq!(status.files[0].code, "??");

        GIT_COMMAND_COUNT.with(|count| count.set(0));
        let diff = get_git_diff(
            repo.path().to_string_lossy().into_owned(),
            "new.txt".to_owned(),
        )
        .unwrap();
        GIT_COMMAND_COUNT.with(|count| assert_eq!(count.get(), 5));
        assert!(diff.contains("new file mode"));
        assert!(diff.contains("+two"));
        assert!(!repo.path().join(".git/index").exists());
    }

    #[test]
    fn git_queries_should_not_cache_head_across_requests() {
        let repo = setup_git_repo();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-m", "rename"]);
        let cwd = repo.path().to_string_lossy().into_owned();
        assert!(get_git_status(cwd.clone()).unwrap().clean);
        write_file(repo.path(), "new name.txt", "line1\nline2\nline3\n");
        assert_eq!(get_git_status(cwd.clone()).unwrap().additions, 1);
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-m", "edit"]);
        git(repo.path(), &["checkout", "--detach"]);
        let status = get_git_status(cwd.clone()).unwrap();
        assert!(status.clean);
        assert_eq!((status.additions, status.deletions), (0, 0));
        assert_eq!(status.branch, "detached HEAD");
        assert!(get_git_diff(cwd, "new name.txt".to_owned())
            .unwrap()
            .is_empty());
    }

    /* 线程局部计数隔离并行测试；成功查询路径中每个构造的命令均会执行。 */
    thread_local! {
        pub(super) static GIT_COMMAND_COUNT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }

    #[test]
    fn get_git_status_should_return_porcelain_codes_for_staged_and_untracked_files() {
        let repo = setup_git_repo();
        let status = get_git_status(repo.path().to_string_lossy().into_owned()).expect("status");

        let deleted = status
            .files
            .iter()
            .find(|file| file.path == "old name.txt")
            .expect("deleted old path");
        assert_eq!(deleted.code, " D");

        let untracked_rename = status
            .files
            .iter()
            .find(|file| file.path == "new name.txt")
            .expect("untracked renamed path");
        assert_eq!(untracked_rename.code, "??");

        assert!(status
            .files
            .iter()
            .any(|file| file.path == "untracked dir/spaced file.txt"));
    }

    #[test]
    fn get_git_diff_should_keep_rename_metadata() {
        let repo = setup_git_repo();
        let diff = get_git_diff(
            repo.path().to_string_lossy().into_owned(),
            "new name.txt".to_owned(),
        )
        .expect("diff");

        assert!(diff.contains("rename from old name.txt"));
        assert!(diff.contains("rename to new name.txt"));
    }

    #[test]
    fn git_actions_should_stage_unstage_and_commit() {
        let repo = setup_git_repo();
        let root = repo.path().canonicalize().expect("canonical repository");

        execute_git_action(&root, GitAction::StageAll).expect("stage all");
        assert!(
            !git_output(repo.path(), &["diff", "--cached", "--name-only"])
                .trim()
                .is_empty()
        );

        execute_git_action(&root, GitAction::UnstageAll).expect("unstage all");
        assert!(
            git_output(repo.path(), &["diff", "--cached", "--name-only"])
                .trim()
                .is_empty()
        );

        execute_git_action(
            &root,
            GitAction::StageFile {
                path: "new name.txt".to_owned(),
            },
        )
        .expect("stage file");
        assert!(
            git_output(repo.path(), &["diff", "--cached", "--name-only"]).contains("new name.txt")
        );

        execute_git_action(
            &root,
            GitAction::UnstageFile {
                path: "new name.txt".to_owned(),
            },
        )
        .expect("unstage file");
        execute_git_action(&root, GitAction::StageAll).expect("stage all again");
        execute_git_action(
            &root,
            GitAction::Commit {
                message: "test: commit workspace changes".to_owned(),
            },
        )
        .expect("commit");

        assert!(branch_status(&root).expect("status").entries.is_empty());
        assert!(matches!(
            execute_git_action(
                &root,
                GitAction::Commit {
                    message: "   ".to_owned(),
                },
            ),
            Err(AppError::InvalidGitCommitMessage)
        ));
    }

    #[test]
    fn git_actions_should_push_and_pull_with_configured_upstream() {
        let remote = TestDir::new("git-remote");
        git(remote.path(), &["init", "--bare"]);

        let source = TestDir::new("git-source");
        git(source.path(), &["init"]);
        git(source.path(), &["config", "user.name", "AI Desk"]);
        git(
            source.path(),
            &["config", "user.email", "ai-desk@example.com"],
        );
        write_file(source.path(), "shared.txt", "base\n");
        git(source.path(), &["add", "."]);
        git(source.path(), &["commit", "-m", "init"]);
        git(source.path(), &["branch", "-M", "main"]);
        git(
            source.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        git(source.path(), &["push", "-u", "origin", "main"]);

        let clone_parent = TestDir::new("git-clone-parent");
        let clone = clone_parent.path().join("clone");
        let output = Command::new("git")
            .args([
                "clone",
                "--branch",
                "main",
                remote.path().to_str().unwrap(),
                clone.to_str().unwrap(),
            ])
            .output()
            .expect("clone repository");
        assert!(output.status.success(), "clone failed");

        write_file(source.path(), "shared.txt", "base\nsource\n");
        execute_git_action(source.path(), GitAction::StageAll).expect("stage source");
        execute_git_action(
            source.path(),
            GitAction::Commit {
                message: "test: update shared file".to_owned(),
            },
        )
        .expect("commit source");
        execute_git_action(source.path(), GitAction::Push).expect("push source");
        execute_git_action(&clone, GitAction::Pull).expect("pull clone");

        assert_eq!(
            fs::read_to_string(clone.join("shared.txt")).unwrap(),
            "base\nsource\n"
        );
    }

    #[test]
    fn snapshot_queries_should_not_leak_refs_or_include_later_edits() {
        let repo = setup_git_repo();
        let baseline = capture_snapshot_tree(repo.path()).unwrap();
        write_file(repo.path(), "literal[1].txt", "first\n");
        write_file(repo.path(), "literal1.txt", "other\nother\n");
        let end = capture_snapshot_tree(repo.path()).unwrap();
        let refs = git_output(repo.path(), &["for-each-ref", "refs/ai-desk/snapshots"]);
        write_file(repo.path(), "literal[1].txt", "later\nmore\nlines\n");
        let status =
            snapshot_status_scoped(repo.path(), &baseline, &end, &["literal[1].txt".to_owned()])
                .unwrap();
        assert_eq!((status.additions, status.deletions), (1, 0));
        assert_eq!(status.files.len(), 1);
        assert_eq!(status.files[0].path, "literal[1].txt");
        let absent =
            snapshot_status_scoped(repo.path(), &baseline, &end, &["absent".to_owned()]).unwrap();
        assert!(absent.clean);
        assert_eq!(absent.additions, 0);
        let started = std::time::Instant::now();
        for revision in 0..3 {
            write_file(
                repo.path(),
                "literal[1].txt",
                &format!("revision {revision}\n"),
            );
            porcelain_status(repo.path()).unwrap();
            snapshot_status(repo.path(), &baseline).unwrap();
            snapshot_diff(repo.path(), &baseline, "literal[1].txt").unwrap();
        }
        let elapsed = started.elapsed();
        let after = git_output(repo.path(), &["for-each-ref", "refs/ai-desk/snapshots"]);
        println!(
            "snapshot read measurement: 3 revisions, 9 queries, refs {} -> {}, elapsed {:?}",
            refs.lines().count(),
            after.lines().count(),
            elapsed
        );
        assert_eq!(refs, after);
    }

    #[test]
    fn scoped_snapshot_should_count_both_sides_of_rename() {
        let repo = setup_git_repo();
        let baseline = capture_worktree_tree(repo.path()).unwrap();
        fs::rename(
            repo.path().join("new name.txt"),
            repo.path().join("renamed.txt"),
        )
        .unwrap();
        let end = capture_worktree_tree(repo.path()).unwrap();
        for path in ["new name.txt", "renamed.txt"] {
            let status =
                snapshot_status_scoped(repo.path(), &baseline, &end, &[path.to_owned()]).unwrap();
            assert_eq!((status.additions, status.deletions), (0, 0));
            assert_eq!(status.files.len(), 1);
            assert!(status.files[0].code.starts_with('R'));
        }
        revert_snapshot(repo.path(), &baseline, &end, Some("renamed.txt")).unwrap();
        assert!(repo.path().join("new name.txt").exists());
        assert!(!repo.path().join("renamed.txt").exists());
    }

    #[test]
    fn revert_snapshot_should_reject_later_edits_before_any_write() {
        let repo = setup_git_repo();
        let baseline = capture_worktree_tree(repo.path()).unwrap();
        write_file(repo.path(), "a.txt", "turn\n");
        write_file(repo.path(), "z.txt", "turn\n");
        let end = capture_worktree_tree(repo.path()).unwrap();
        write_file(repo.path(), "z.txt", "user edit\n");
        git(repo.path(), &["add", "z.txt"]);
        let index = fs::read(repo.path().join(".git/index")).unwrap();
        assert!(revert_snapshot(repo.path(), &baseline, &end, None).is_err());
        assert_eq!(
            fs::read_to_string(repo.path().join("a.txt")).unwrap(),
            "turn\n"
        );
        assert_eq!(
            fs::read_to_string(repo.path().join("z.txt")).unwrap(),
            "user edit\n"
        );
        assert_eq!(index, fs::read(repo.path().join(".git/index")).unwrap());
        revert_snapshot(repo.path(), &baseline, &end, Some("a.txt")).unwrap();
        assert!(!repo.path().join("a.txt").exists());
        assert_eq!(index, fs::read(repo.path().join(".git/index")).unwrap());
    }

    #[test]
    fn revert_snapshot_should_preserve_replacement_directory_and_ignored_files() {
        let repo = setup_git_repo();
        let baseline = capture_worktree_tree(repo.path()).unwrap();
        write_file(repo.path(), "added", "turn\n");
        let end = capture_worktree_tree(repo.path()).unwrap();
        fs::remove_file(repo.path().join("added")).unwrap();
        write_file(repo.path(), "added/user.txt", "keep\n");
        git(repo.path(), &["config", "core.excludesFile", "/dev/null"]);
        write_file(repo.path(), ".git/info/exclude", "added/\n");
        assert!(revert_snapshot(repo.path(), &baseline, &end, None).is_err());
        assert_eq!(
            fs::read_to_string(repo.path().join("added/user.txt")).unwrap(),
            "keep\n"
        );
    }

    #[test]
    fn revert_snapshot_should_restore_binary_without_changing_index() {
        let repo = setup_git_repo();
        fs::write(repo.path().join("binary"), [0, 1, 2, 3]).unwrap();
        let baseline = capture_worktree_tree(repo.path()).unwrap();
        fs::write(repo.path().join("binary"), [0, 4, 5, 6]).unwrap();
        let end = capture_worktree_tree(repo.path()).unwrap();
        git(repo.path(), &["add", "binary"]);
        let index = fs::read(repo.path().join(".git/index")).unwrap();
        revert_snapshot(repo.path(), &baseline, &end, None).unwrap();
        assert_eq!(fs::read(repo.path().join("binary")).unwrap(), [0, 1, 2, 3]);
        assert_eq!(index, fs::read(repo.path().join(".git/index")).unwrap());
    }

    #[test]
    fn revert_snapshot_should_not_overwrite_recreated_rename_source_or_deleted_file() {
        for rename in [false, true] {
            let repo = setup_git_repo();
            let baseline = capture_worktree_tree(repo.path()).unwrap();
            if rename {
                fs::rename(
                    repo.path().join("new name.txt"),
                    repo.path().join("destination.txt"),
                )
                .unwrap();
            } else {
                fs::remove_file(repo.path().join("new name.txt")).unwrap();
            }
            let end = capture_worktree_tree(repo.path()).unwrap();
            write_file(repo.path(), "new name.txt", "user replacement\n");
            assert!(revert_snapshot(repo.path(), &baseline, &end, None).is_err());
            assert_eq!(
                fs::read_to_string(repo.path().join("new name.txt")).unwrap(),
                "user replacement\n"
            );
            if rename {
                assert!(repo.path().join("destination.txt").exists());
            }
        }
    }

    #[test]
    fn revert_snapshot_should_reject_later_modification_of_existing_file() {
        let repo = setup_git_repo();
        let baseline = capture_worktree_tree(repo.path()).unwrap();
        write_file(repo.path(), "new name.txt", "turn\n");
        let end = capture_worktree_tree(repo.path()).unwrap();
        write_file(repo.path(), "new name.txt", "turn\nlater\n");
        assert!(revert_snapshot(repo.path(), &baseline, &end, Some("new name.txt")).is_err());
        assert_eq!(
            fs::read_to_string(repo.path().join("new name.txt")).unwrap(),
            "turn\nlater\n"
        );
    }

    #[test]
    fn async_git_command_should_return_status() {
        let repo = setup_git_repo();
        let status = tauri::async_runtime::block_on(git_commands::get_git_status(
            repo.path().to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert!(!status.clean);
    }

    #[test]
    fn scoped_rename_destination_should_include_deleted_lines() {
        let repo = setup_git_repo();
        write_file(
            repo.path(),
            "source.txt",
            "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n",
        );
        let baseline = capture_worktree_tree(repo.path()).unwrap();
        fs::rename(
            repo.path().join("source.txt"),
            repo.path().join("target.txt"),
        )
        .unwrap();
        write_file(
            repo.path(),
            "target.txt",
            "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n",
        );
        let end = capture_worktree_tree(repo.path()).unwrap();
        write_file(repo.path(), "target.txt", "later\n");
        let status =
            snapshot_status_scoped(repo.path(), &baseline, &end, &["target.txt".to_owned()]).unwrap();
        assert_eq!((status.additions, status.deletions), (0, 2));
        assert_eq!(status.files.len(), 1);
        assert!(status.files[0].code.starts_with('R'));
    }

    #[test]
    fn revert_all_after_single_should_skip_restored_files_but_reject_new_edits() {
        for later_edit in [false, true] {
            let repo = setup_git_repo();
            let baseline = capture_worktree_tree(repo.path()).unwrap();
            write_file(repo.path(), "new name.txt", "turn\n");
            write_file(repo.path(), "added.txt", "turn\n");
            let end = capture_worktree_tree(repo.path()).unwrap();
            revert_snapshot(repo.path(), &baseline, &end, Some("new name.txt")).unwrap();
            if later_edit {
                write_file(repo.path(), "new name.txt", "new user edit\n");
                assert!(revert_snapshot(repo.path(), &baseline, &end, None).is_err());
                assert_eq!(
                    fs::read_to_string(repo.path().join("new name.txt")).unwrap(),
                    "new user edit\n"
                );
                assert!(repo.path().join("added.txt").exists());
            } else {
                revert_snapshot(repo.path(), &baseline, &end, None).unwrap();
                revert_snapshot(repo.path(), &baseline, &end, None).unwrap();
                assert_eq!(
                    fs::read_to_string(repo.path().join("new name.txt")).unwrap(),
                    "line1\nline2\n"
                );
                assert!(!repo.path().join("added.txt").exists());
            }
        }
    }

    #[test]
    fn capture_git_snapshot_should_not_mutate_user_index() {
        let repo = TestDir::new("snapshot");
        git(repo.path(), &["init"]);
        git(repo.path(), &["config", "user.name", "AI Desk"]);
        git(
            repo.path(),
            &["config", "user.email", "ai-desk@example.com"],
        );
        write_file(repo.path(), "tracked.txt", "base\n");
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["commit", "-m", "init"]);

        write_file(repo.path(), "tracked.txt", "staged\n");
        git(repo.path(), &["add", "tracked.txt"]);

        let index_before = fs::read(repo.path().join(".git/index")).expect("read git index before");
        let cached_before = git_output(repo.path(), &["diff", "--cached", "--name-status"]);

        let snapshot = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture snapshot");
        assert_eq!(
            git_output(
                repo.path(),
                &[
                    "show-ref",
                    "--hash",
                    "--verify",
                    format!("refs/ai-desk/snapshots/{snapshot}").as_str(),
                ],
            )
            .trim(),
            snapshot
        );
        assert_ne!(
            snapshot,
            resolve_head_tree(repo.path())
                .expect("head tree")
                .expect("tree")
        );

        let index_after = fs::read(repo.path().join(".git/index")).expect("read git index after");
        let cached_after = git_output(repo.path(), &["diff", "--cached", "--name-status"]);

        assert_eq!(index_before, index_after);
        assert_eq!(cached_before, cached_after);
    }

    #[test]
    fn capture_git_snapshot_should_support_repository_without_head() {
        let repo = TestDir::new("snapshot-no-head");
        git(repo.path(), &["init"]);
        write_file(repo.path(), "new.txt", "first\nsecond\n");

        let snapshot = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture snapshot without HEAD");
        let status = get_git_snapshot_status(
            repo.path().to_string_lossy().into_owned(),
            EMPTY_TREE_HASH.to_owned(),
        )
        .expect("status from empty tree");

        assert!(!snapshot.is_empty());
        assert_eq!(status.additions, 2);
        assert_eq!(status.files[0].path, "new.txt");
    }

    #[test]
    fn release_git_snapshot_should_delete_application_ref() {
        let repo = TestDir::new("release-snapshot");
        git(repo.path(), &["init"]);
        write_file(repo.path(), "tracked.txt", "content\n");
        let snapshot = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture snapshot");

        release_git_snapshot(repo.path().to_string_lossy().into_owned(), snapshot.clone())
            .expect("release snapshot");

        let reference = format!("refs/ai-desk/snapshots/{snapshot}");
        let output = Command::new("git")
            .args(["show-ref", "--verify", reference.as_str()])
            .current_dir(repo.path())
            .output()
            .expect("inspect snapshot ref");
        assert!(!output.status.success());
    }

    #[test]
    fn revert_git_snapshot_should_restore_single_file() {
        let repo = TestDir::new("revert-snapshot");
        git(repo.path(), &["init"]);
        git(repo.path(), &["config", "user.name", "AI Desk"]);
        git(repo.path(), &["config", "user.email", "ai-desk@example.com"]);
        write_file(repo.path(), "keep.txt", "base\n");
        write_file(repo.path(), "modified.txt", "base\n");
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["commit", "-m", "init"]);

        let baseline = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture baseline");
        write_file(repo.path(), "modified.txt", "changed\n");
        write_file(repo.path(), "added.txt", "new\n");
        let end = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture end");

        revert_git_snapshot(
            repo.path().to_string_lossy().into_owned(),
            baseline,
            end,
            Some("modified.txt".to_owned()),
        )
        .expect("revert single file");

        assert_eq!(
            fs::read_to_string(repo.path().join("modified.txt")).unwrap(),
            "base\n"
        );
        assert_eq!(fs::read_to_string(repo.path().join("added.txt")).unwrap(), "new\n");
    }

    #[test]
    fn revert_git_snapshot_should_restore_all_files() {
        let repo = TestDir::new("revert-snapshot-all");
        git(repo.path(), &["init"]);
        git(repo.path(), &["config", "user.name", "AI Desk"]);
        git(repo.path(), &["config", "user.email", "ai-desk@example.com"]);
        write_file(repo.path(), "modified.txt", "base\n");
        write_file(repo.path(), "deleted.txt", "base\n");
        git(repo.path(), &["add", "."]);
        git(repo.path(), &["commit", "-m", "init"]);

        let baseline = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture baseline");
        write_file(repo.path(), "modified.txt", "changed\n");
        write_file(repo.path(), "added.txt", "new\n");
        fs::remove_file(repo.path().join("deleted.txt")).unwrap();
        let end = capture_git_snapshot(repo.path().to_string_lossy().into_owned())
            .expect("capture end");

        revert_git_snapshot(repo.path().to_string_lossy().into_owned(), baseline, end, None)
            .expect("revert all files");

        assert_eq!(
            fs::read_to_string(repo.path().join("modified.txt")).unwrap(),
            "base\n"
        );
        assert_eq!(
            fs::read_to_string(repo.path().join("deleted.txt")).unwrap(),
            "base\n"
        );
        assert!(!repo.path().join("added.txt").exists());
    }
}
