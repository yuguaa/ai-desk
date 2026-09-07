#import <AppKit/AppKit.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <Carbon/Carbon.h>
#include <math.h>

typedef void (*CaptureCallback)(const unsigned char *, size_t, const char *, const char *, void *);
typedef void (*GestureCallback)(bool);
static CFMachPortRef eventTap;
static CFRunLoopSourceRef eventSource;
static GestureCallback gestureCallback;
static bool chordLatched;
static bool captureBusy;
static uint64_t listenerGeneration;

/* 每次两键全部松开后才重新布防，避免按住一侧反复触发。 */
static bool chordTransition(bool left, bool right, bool *latched) {
    if (!left && !right) *latched = false;
    if (!left || !right || *latched) return false;
    *latched = true;
    return true;
}

static CGWindowID frontmostWindowID(NSArray<NSDictionary *> *windows, pid_t pid) {
    if (pid <= 0) return kCGNullWindowID;
    for (NSDictionary *window in windows) {
        if ([window[(id)kCGWindowOwnerPID] intValue] == pid
            && [window[(id)kCGWindowAlpha] doubleValue] > 0) {
            return [window[(id)kCGWindowNumber] unsignedIntValue];
        }
    }
    return kCGNullWindowID;
}

static void stopListener(void) {
    listenerGeneration++;
    if (eventSource) {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), eventSource, kCFRunLoopCommonModes);
        CFRelease(eventSource);
        eventSource = NULL;
    }
    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        CFMachPortInvalidate(eventTap);
        CFRelease(eventTap);
        eventTap = NULL;
    }
    chordLatched = false;
}

uint32_t ai_screenshot_status(void) {
    if (@available(macOS 14.0, *)) {
        return 1 | (CGPreflightScreenCaptureAccess() ? 2 : 0)
            | (CGPreflightListenEventAccess() ? 4 : 0)
            | (eventTap && CGEventTapIsEnabled(eventTap) ? 8 : 0);
    }
    return 0;
}

bool ai_screenshot_request_permission(bool input) {
    if (@available(macOS 14.0, *)) {
        return input ? CGRequestListenEventAccess() : CGRequestScreenCaptureAccess();
    }
    return false;
}

static CGEventRef handleEvent(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        stopListener();
        if (gestureCallback) gestureCallback(false);
        return event;
    }
    if (type != kCGEventFlagsChanged) return event;
    bool left = CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, kVK_Command);
    bool right = CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, kVK_RightCommand);
    if (chordTransition(left, right, &chordLatched)) {
        uint64_t generation = listenerGeneration;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (eventTap && generation == listenerGeneration && gestureCallback) gestureCallback(true);
        });
    }
    return event;
}

uint32_t ai_screenshot_set_enabled(bool enabled, GestureCallback callback) {
    if (!enabled) { stopListener(); return 0; }
    uint32_t status = ai_screenshot_status();
    if (!(status & 1)) return 1;
    /* 此入口只由用户设置开关调用；状态查询、setup 和普通截图都不会弹权限。 */
    if (!(status & 2) && !ai_screenshot_request_permission(false)) return 2;
    if (!(status & 4) && !ai_screenshot_request_permission(true)) return 3;
    if (status & 8) return 0;
    stopListener();
    gestureCallback = callback;
    eventTap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
        kCGEventTapOptionListenOnly, CGEventMaskBit(kCGEventFlagsChanged), handleEvent, NULL);
    if (!eventTap) return 4;
    eventSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
    if (!eventSource) { stopListener(); return 4; }
    /* 启用时已有任意 Command 按下，必须先全部释放，不能当作用户截图意图。 */
    chordLatched = CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, kVK_Command)
        || CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, kVK_RightCommand);
    CFRunLoopAddSource(CFRunLoopGetMain(), eventSource, kCFRunLoopCommonModes);
    CGEventTapEnable(eventTap, true);
    if (!CGEventTapIsEnabled(eventTap)) { stopListener(); return 4; }
    return 0;
}

void ai_screenshot_capture(CaptureCallback callback, void *context) {
    if (@available(macOS 14.0, *)) {
        if (!CGPreflightScreenCaptureAccess()) {
            callback(NULL, 0, "screen_recording_denied", "未获得屏幕录制权限，请先显式申请授权后重试。", context);
            return;
        }
        if (captureBusy) {
            callback(NULL, 0, "capture_busy", "已有窗口截图正在进行，请稍后重试。", context);
            return;
        }
        /* 在异步枚举之前固定前台应用和最前面的可见窗口 ID，不能跳过弹窗去截后面的窗口。 */
        pid_t pid = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
        NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
        CGWindowID windowID = frontmostWindowID(windows, pid);
        if (!windowID) {
            callback(NULL, 0, "window_unavailable", "当前前台应用没有可截图的窗口，不会改为截取整屏。", context);
            return;
        }
        captureBusy = true;
        __block bool finished = false;
        void (^finish)(NSData *, const char *, NSString *) = ^(NSData *png, const char *code, NSString *message) {
            if (finished) return;
            finished = true;
            captureBusy = false;
            callback(png.bytes, png.length, code, message.UTF8String, context);
        };
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            finish(nil, "timeout", @"窗口截图超过 15 秒，请重试。");
        });
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES
            completionHandler:^(SCShareableContent *content, NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (finished) return;
                if (error) { finish(nil, "window_enumeration_failed", error.localizedDescription); return; }
                SCWindow *target = nil;
                for (SCWindow *window in content.windows) {
                    if (window.windowID == windowID && window.owningApplication.processID == pid && window.isOnScreen) { target = window; break; }
                }
                if (!target) { finish(nil, "window_unavailable", @"目标窗口已关闭、隐藏或不可共享。"); return; }
                SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:target];
                double width = ceil(filter.contentRect.size.width * filter.pointPixelScale);
                double height = ceil(filter.contentRect.size.height * filter.pointPixelScale);
                if (!isfinite(width) || !isfinite(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 64000000) {
                    finish(nil, "invalid_window_size", @"目标窗口尺寸无效或超过截图限制。"); return;
                }
                SCStreamConfiguration *config = [SCStreamConfiguration new];
                config.width = (size_t)width;
                config.height = (size_t)height;
                config.showsCursor = NO;
                config.ignoreShadowsSingleWindow = YES;
                [SCScreenshotManager captureImageWithFilter:filter configuration:config completionHandler:^(CGImageRef image, NSError *captureError) {
                    /* CGImageRef 的借用生命周期仅覆盖原始回调，跨队列前必须 retain。 */
                    CGImageRef retained = image ? CGImageRetain(image) : NULL;
                    dispatch_async(dispatch_get_main_queue(), ^{
                        if (!finished) {
                            if (captureError || !retained) finish(nil, "capture_failed", captureError.localizedDescription ?: @"系统未返回窗口图像。");
                            else {
                                NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:retained];
                                NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                                if (!png.length || png.length > 10 * 1024 * 1024) finish(nil, "invalid_image", @"PNG 编码失败或图片超过单张 10 MiB 限制。");
                                else finish(png, NULL, nil);
                            }
                        }
                        if (retained) CGImageRelease(retained);
                    });
                }];
            });
        }];
    } else {
        callback(NULL, 0, "unsupported", "原生截图需要 macOS 14 及以上。", context);
    }
}

#ifdef SCREENSHOT_UNIT_TEST
#include <assert.h>
int main(void) {
    @autoreleasepool {
        NSArray *windows = @[
            @{(id)kCGWindowOwnerPID: @7, (id)kCGWindowAlpha: @1, (id)kCGWindowNumber: @70},
            @{(id)kCGWindowOwnerPID: @8, (id)kCGWindowAlpha: @0, (id)kCGWindowNumber: @80},
            @{(id)kCGWindowOwnerPID: @8, (id)kCGWindowAlpha: @1, (id)kCGWindowNumber: @81, (id)kCGWindowLayer: @8},
            @{(id)kCGWindowOwnerPID: @8, (id)kCGWindowAlpha: @1, (id)kCGWindowNumber: @82, (id)kCGWindowLayer: @0}
        ];
        assert(frontmostWindowID(windows, 8) == 81);
        assert(frontmostWindowID(windows, 9) == kCGNullWindowID);
        assert(frontmostWindowID(windows, 0) == kCGNullWindowID);
        assert(frontmostWindowID(@[], 8) == kCGNullWindowID);
    }
    bool latched = false;
    assert(!chordTransition(true, false, &latched));
    assert(chordTransition(true, true, &latched));
    assert(!chordTransition(true, true, &latched));
    assert(!chordTransition(false, true, &latched));
    assert(!chordTransition(true, true, &latched));
    assert(!chordTransition(false, false, &latched));
    assert(!chordTransition(false, true, &latched));
    assert(chordTransition(true, true, &latched));
    latched = true;
    assert(!chordTransition(true, true, &latched));
    assert(!chordTransition(false, false, &latched));
    assert(chordTransition(true, true, &latched));
    return 0;
}
#endif
