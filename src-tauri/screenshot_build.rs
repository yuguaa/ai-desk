use std::{env, path::PathBuf, process::Command};

pub fn build() {
    println!("cargo:rerun-if-changed=src/screenshot_macos.m");
    println!("cargo:rerun-if-changed=screenshot_build.rs");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR"));
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        _ => panic!("Unsupported macOS screenshot architecture"),
    };
    let object = out.join("screenshot_macos.o");
    let library = out.join("libscreenshot_macos.a");
    let status = Command::new("xcrun")
        .args([
            "--sdk",
            "macosx",
            "clang",
            "-fobjc-arc",
            "-fblocks",
            "-arch",
            arch,
            "-mmacosx-version-min=10.15",
            "-Werror=unguarded-availability",
            "-c",
            "src/screenshot_macos.m",
            "-o",
        ])
        .arg(&object)
        .status()
        .expect("run Apple clang for screenshot helper");
    assert!(status.success(), "compile screenshot helper failed");
    let status = Command::new("xcrun")
        .args(["ar", "crs"])
        .arg(&library)
        .arg(&object)
        .status()
        .expect("archive screenshot helper");
    assert!(status.success(), "archive screenshot helper failed");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=screenshot_macos");
    println!("cargo:rustc-link-lib=framework=AppKit");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
    println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
}
