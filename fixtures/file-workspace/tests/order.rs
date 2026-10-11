use whip_graph_fixture::checkout::{checkout, Order};
#[test]
fn order_has_receipt() { assert!(checkout(&Order { quantity: 2 }).is_some()); }
