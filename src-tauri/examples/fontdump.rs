fn main() {
    let started = std::time::Instant::now();
    let families = ac_mod_toolkit_lib::commands::fonts::scan_fonts();
    println!("{} families in {:?}", families.len(), started.elapsed());
    for family in families.iter().take(30) {
        println!("  {family}");
    }
}
