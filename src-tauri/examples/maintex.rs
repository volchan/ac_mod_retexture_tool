//! Prints the sheet a car wears its livery on, as the model names it.

fn main() {
    let car = std::env::args().nth(1).expect("usage: maintex <car folder>");
    let kn5 = ac_mod_toolkit_lib::commands::car_model::main_kn5(std::path::Path::new(&car)).unwrap();
    let geometry = ac_mod_toolkit_lib::parsers::kn5_mesh::read_geometry(&kn5).unwrap();

    println!("{:?}", ac_mod_toolkit_lib::commands::livery_model::livery_texture(&geometry));
}
