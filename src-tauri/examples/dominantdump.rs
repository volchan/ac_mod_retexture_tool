//! Prints the colours `dominant_colours` finds in an image, for checking a
//! badge against the sheet it was drawn from.

fn main() {
    let path = std::env::args().nth(1).expect("usage: dominantdump <image>");
    let bytes = std::fs::read(&path).unwrap();
    let image = ac_mod_toolkit_lib::converters::dds::decode_to_image(&bytes).unwrap();

    println!("{}x{}", image.width(), image.height());
    for colour in ac_mod_toolkit_lib::converters::dominant::dominant_colours(&image, 5) {
        println!("{colour}");
    }
}
