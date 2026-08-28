fn main() {
    let version =
        std::fs::read_to_string("pi-runtime-version.txt").expect("read pi-runtime-version.txt");
    let version = version.trim();
    assert!(!version.is_empty(), "Pi runtime version cannot be empty");
    println!("cargo:rerun-if-changed=pi-runtime-version.txt");
    println!("cargo:rustc-env=AI_DESK_PI_VERSION={version}");
    tauri_build::build();
}
