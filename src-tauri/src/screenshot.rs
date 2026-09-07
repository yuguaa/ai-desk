//! setup 只保存事件出口；不申请权限、不监听、不截图。无需上传或文件落盘。
//! 双 Command 仅广播 `screenshot-requested`（null payload），监听失效广播
//! `screenshot-error`（{code,message}）。前端绑定 draftKey 后调用 capture_frontmost_window，
//! 在 Promise 完成前不得激活应用；截图目标为命令执行时前台应用最前面的可见窗口。
//! 官方文档已核对（2026-09-07），并通过本机 Apple SDK 头文件验证签名：
//! https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager
//! https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(desktopindependentwindow:)
//! https://developer.apple.com/documentation/coregraphics/cgpreflightlisteneventaccess()
//! https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo(_:_:)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotImage {
    pub r#type: &'static str,
    pub data: String,
    pub mime_type: &'static str,
    pub name: &'static str,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScreenshotError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for ScreenshotError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ScreenshotError {}

impl ScreenshotError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotStatus {
    pub supported: bool,
    pub screen_recording_granted: bool,
    pub input_monitoring_granted: bool,
    pub shortcut_enabled: bool,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScreenshotPermission {
    ScreenRecording,
    InputMonitoring,
}

pub fn setup(app: &AppHandle) -> Result<(), ScreenshotError> {
    platform::setup(app)?;
    /* 恢复用户上次启用的快捷入口；权限仍在才自动开启，否则保持关闭不弹权限框。 */
    if load_shortcut_enabled(app) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = platform::restore_enabled(app).await;
        });
    }
    Ok(())
}

fn screenshot_config_path(app: &AppHandle) -> Result<PathBuf, ScreenshotError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| ScreenshotError::new("config_unavailable", error.to_string()))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| ScreenshotError::new("config_unavailable", error.to_string()))?;
    Ok(dir.join("screenshot.json"))
}

fn load_shortcut_enabled(app: &AppHandle) -> bool {
    screenshot_config_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.get("shortcutEnabled").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

fn persist_shortcut_enabled(app: &AppHandle, enabled: bool) -> Result<(), ScreenshotError> {
    let path = screenshot_config_path(app)?;
    let json = serde_json::json!({ "shortcutEnabled": enabled });
    let bytes = serde_json::to_vec(&json)
        .map_err(|error| ScreenshotError::new("config_unavailable", error.to_string()))?;
    std::fs::write(&path, bytes)
        .map_err(|error| ScreenshotError::new("config_unavailable", error.to_string()))
}

#[tauri::command]
pub async fn get_screenshot_status(app: AppHandle) -> Result<ScreenshotStatus, ScreenshotError> {
    platform::status(app).await
}

/// 只允许在用户点击授权按钮后调用；系统可能要求用户授权后重启应用。
#[tauri::command]
pub async fn request_screenshot_permission(
    app: AppHandle,
    permission: ScreenshotPermission,
) -> Result<ScreenshotStatus, ScreenshotError> {
    platform::request_permission(app, permission).await
}

/// 仅用户操作设置开关时调用；开启时请求缺少的权限，成功后持久化开关状态。
#[tauri::command]
pub async fn set_screenshot_shortcut_enabled(
    app: AppHandle,
    enabled: bool,
) -> Result<ScreenshotStatus, ScreenshotError> {
    let status = platform::set_enabled(app.clone(), enabled).await?;
    if let Err(error) = persist_shortcut_enabled(&app, enabled) {
        eprintln!("持久化截图快捷入口状态失败: {error}");
    }
    Ok(status)
}

/// 前端在调用前绑定 draftKey；截图成功后才显示主窗口，不自动插入或发送图片。
#[tauri::command]
pub async fn capture_frontmost_window(app: AppHandle) -> Result<ScreenshotImage, ScreenshotError> {
    platform::capture(app).await
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::*;
    fn unsupported<T>() -> Result<T, ScreenshotError> {
        Err(ScreenshotError::new(
            "unsupported",
            "原生窗口截图和双 Command 快捷入口仅支持 macOS 14 及以上",
        ))
    }
    pub fn setup(_: &AppHandle) -> Result<(), ScreenshotError> {
        Ok(())
    }
    pub async fn status(_: AppHandle) -> Result<ScreenshotStatus, ScreenshotError> {
        unsupported()
    }
    pub async fn request_permission(
        _: AppHandle,
        _: ScreenshotPermission,
    ) -> Result<ScreenshotStatus, ScreenshotError> {
        unsupported()
    }
    pub async fn set_enabled(_: AppHandle, _: bool) -> Result<ScreenshotStatus, ScreenshotError> {
        unsupported()
    }
    pub async fn restore_enabled(_: AppHandle) -> Result<ScreenshotStatus, ScreenshotError> {
        unsupported()
    }
    pub async fn capture(_: AppHandle) -> Result<ScreenshotImage, ScreenshotError> {
        unsupported()
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::{
        ffi::{c_char, c_void, CStr},
        sync::{mpsc, OnceLock},
        time::{Duration, Instant},
    };
    use tauri::{Emitter, Manager};

    static APP: OnceLock<AppHandle> = OnceLock::new();
    type CaptureCallback =
        extern "C" fn(*const u8, usize, *const c_char, *const c_char, *mut c_void);
    extern "C" {
        fn ai_screenshot_status() -> u32;
        fn ai_screenshot_request_permission(input: bool) -> bool;
        fn ai_screenshot_set_enabled(enabled: bool, callback: extern "C" fn(bool)) -> u32;
        fn ai_screenshot_restore_enabled(callback: extern "C" fn(bool)) -> u32;
        fn ai_screenshot_capture(callback: CaptureCallback, context: *mut c_void);
    }

    pub fn setup(app: &AppHandle) -> Result<(), ScreenshotError> {
        APP.set(app.clone())
            .map_err(|_| ScreenshotError::new("already_initialized", "截图模块已初始化"))
    }

    /* 所有 AppKit 和监听生命周期操作都在主线程执行；等待结果不阻塞 UI。 */
    async fn on_main<T: Send + 'static>(
        app: AppHandle,
        operation: impl FnOnce(mpsc::Sender<Result<T, ScreenshotError>>) + Send + 'static,
    ) -> Result<T, ScreenshotError> {
        let (tx, rx) = mpsc::channel();
        let deadline = Instant::now() + Duration::from_secs(20);
        app.run_on_main_thread(move || {
            if Instant::now() >= deadline {
                let _ = tx.send(Err(ScreenshotError::new(
                    "timeout",
                    "请求已过期，未执行截图操作",
                )));
            } else {
                operation(tx);
            }
        })
        .map_err(|error| ScreenshotError::new("dispatch_failed", error.to_string()))?;
        tauri::async_runtime::spawn_blocking(move || {
            /* 授权对话框不能按机器超时；实际截图由 helper 的 15 秒定时器结束。 */
            rx.recv().map_err(|_| {
                ScreenshotError::new("response_dropped", "截图模块已关闭，未收到结果")
            })?
        })
        .await
        .map_err(|error| ScreenshotError::new("worker_failed", error.to_string()))?
    }

    fn read_status() -> ScreenshotStatus {
        let flags = unsafe { ai_screenshot_status() };
        ScreenshotStatus {
            supported: flags & 1 != 0,
            screen_recording_granted: flags & 2 != 0,
            input_monitoring_granted: flags & 4 != 0,
            shortcut_enabled: flags & 8 != 0,
        }
    }

    pub async fn status(app: AppHandle) -> Result<ScreenshotStatus, ScreenshotError> {
        on_main(app, |tx| {
            let _ = tx.send(Ok(read_status()));
        })
        .await
    }

    pub async fn request_permission(
        app: AppHandle,
        permission: ScreenshotPermission,
    ) -> Result<ScreenshotStatus, ScreenshotError> {
        on_main(app, move |tx| {
            let input = matches!(permission, ScreenshotPermission::InputMonitoring);
            let result = if !read_status().supported {
                Err(ScreenshotError::new("unsupported", "原生截图需要 macOS 14 及以上"))
            } else if unsafe { ai_screenshot_request_permission(input) } {
                Ok(read_status())
            } else {
                Err(ScreenshotError::new(if input { "input_monitoring_denied" } else { "screen_recording_denied" },
                    if input { "未获得输入监控权限。请在系统设置的隐私与安全性中手动授权，然后重启应用并重新启用快捷入口。" }
                    else { "未获得屏幕录制权限。请在系统设置的隐私与安全性中手动授权，然后重启应用并重试。" }))
            };
            let _ = tx.send(result);
        }).await
    }

    pub async fn set_enabled(
        app: AppHandle,
        enabled: bool,
    ) -> Result<ScreenshotStatus, ScreenshotError> {
        on_main(app, move |tx| {
            let code = if enabled && APP.get().is_none() {
                5
            } else {
                unsafe { ai_screenshot_set_enabled(enabled, gesture_callback) }
            };
            let result = match code {
                0 => Ok(read_status()),
                1 => Err(ScreenshotError::new(
                    "unsupported",
                    "原生截图需要 macOS 14 及以上",
                )),
                2 => Err(ScreenshotError::new(
                    "screen_recording_denied",
                    "未获得屏幕录制权限。请在系统设置的隐私与安全性中手动授权，必要时重启应用后重新启用快捷入口。",
                )),
                3 => Err(ScreenshotError::new(
                    "input_monitoring_denied",
                    "未获得输入监控权限。请在系统设置的隐私与安全性中手动授权，必要时重启应用后重新启用快捷入口。",
                )),
                5 => Err(ScreenshotError::new(
                    "not_initialized",
                    "截图服务尚未就绪，请重启应用后重试",
                )),
                _ => Err(ScreenshotError::new(
                    "listener_failed",
                    "无法创建只读键盘监听，请检查输入监控权限并重启应用后重新启用",
                )),
            };
            let _ = tx.send(result);
        })
        .await
    }

    pub async fn restore_enabled(app: AppHandle) -> Result<ScreenshotStatus, ScreenshotError> {
        on_main(app, move |tx| {
            let code = if APP.get().is_none() {
                5
            } else {
                unsafe { ai_screenshot_restore_enabled(gesture_callback) }
            };
            let result = match code {
                0 => Ok(read_status()),
                1 => Err(ScreenshotError::new(
                    "unsupported",
                    "原生截图需要 macOS 14 及以上",
                )),
                _ => Err(ScreenshotError::new(
                    "listener_failed",
                    "无法创建只读键盘监听，请检查输入监控权限并重启应用后重新启用",
                )),
            };
            let _ = tx.send(result);
        })
        .await
    }

    type CaptureSender = mpsc::Sender<Result<ScreenshotImage, ScreenshotError>>;

    struct CaptureContext {
        sender: CaptureSender,
        app: AppHandle,
    }

    pub async fn capture(app: AppHandle) -> Result<ScreenshotImage, ScreenshotError> {
        let capture_app = app.clone();
        on_main(app, move |tx| {
            let context = Box::into_raw(Box::new(CaptureContext {
                sender: tx,
                app: capture_app,
            }))
            .cast();
            unsafe { ai_screenshot_capture(capture_callback, context) };
        })
        .await
    }

    extern "C" fn gesture_callback(active: bool) {
        if let Some(app) = APP.get() {
            if active {
                let _ = app.emit("screenshot-requested", ());
            } else {
                let _ = app.emit(
                    "screenshot-error",
                    ScreenshotError::new(
                        "listener_disabled",
                        "系统已禁用快捷监听。请检查输入监控权限后手动重新启用。",
                    ),
                );
            }
        }
    }

    extern "C" fn capture_callback(
        bytes: *const u8,
        length: usize,
        code: *const c_char,
        message: *const c_char,
        context: *mut c_void,
    ) {
        /* helper 保证回调恰好一次；数据只在回调期间有效，立即编码到 Rust 所有的内存。 */
        let context = unsafe { Box::from_raw(context.cast::<CaptureContext>()) };
        let result = if !code.is_null() {
            Err(ScreenshotError::new(
                unsafe { CStr::from_ptr(code) }.to_string_lossy().as_ref(),
                if message.is_null() {
                    "截图失败".into()
                } else {
                    unsafe { CStr::from_ptr(message) }
                        .to_string_lossy()
                        .into_owned()
                },
            ))
        } else if bytes.is_null() || length == 0 || length > 10 * 1024 * 1024 {
            Err(ScreenshotError::new(
                "invalid_image",
                "截图未返回有效 PNG 数据或图片超过单张 10 MiB 限制",
            ))
        } else {
            Ok(ScreenshotImage {
                r#type: "image",
                data: STANDARD.encode(unsafe { std::slice::from_raw_parts(bytes, length) }),
                mime_type: "image/png",
                name: "window-screenshot.png",
            })
        };
        if result.is_ok() {
            /* 原生回调已切回主线程，只有有效图片到达后才允许激活窗口。 */
            let activation = context
                .app
                .get_webview_window("main")
                .ok_or_else(|| "找不到 main 窗口".to_string())
                .and_then(|window| {
                    window
                        .show()
                        .and_then(|_| window.set_focus())
                        .map_err(|error| error.to_string())
                });
            if let Err(message) = activation {
                let _ = context.app.emit(
                    "screenshot-error",
                    ScreenshotError::new("window_activation_failed", message),
                );
            }
        }
        let _ = context.sender.send(result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn image_contract_is_frontend_compatible() {
        let value = serde_json::to_value(ScreenshotImage {
            r#type: "image",
            data: "cG5n".into(),
            mime_type: "image/png",
            name: "window-screenshot.png",
        })
        .unwrap();
        assert_eq!(value["type"], "image");
        assert_eq!(value["mimeType"], "image/png");
        assert_eq!(value["data"], "cG5n");
        assert!(value.get("mime_type").is_none());
    }
    #[test]
    fn permission_input_is_explicit_and_rejects_unknown_values() {
        assert!(serde_json::from_str::<ScreenshotPermission>("\"inputMonitoring\"").is_ok());
        assert!(serde_json::from_str::<ScreenshotPermission>("\"screenRecording\"").is_ok());
        assert!(serde_json::from_str::<ScreenshotPermission>("\"all\"").is_err());
    }
}
