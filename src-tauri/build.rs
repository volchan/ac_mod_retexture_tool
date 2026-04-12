fn main() {
    #[cfg(target_os = "linux")]
    println!("cargo:rustc-link-lib=stdc++");

    tauri_build::build()
}
