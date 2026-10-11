//! Development-only grammar inspection; pass a dialect JSON string and file path.
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let dialect: whip_docs::syntax::Dialect =
        serde_json::from_str(&format!("\"{}\"", args[1])).unwrap();
    let source = std::fs::read(&args[2]).unwrap();
    let mut parser = tree_sitter::Parser::new();
    parser.set_language(&dialect.language()).unwrap();
    let tree = parser.parse(source, None).unwrap();
    println!("{}", tree.root_node().to_sexp());
}
