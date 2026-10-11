// Public fixture marker: pricing source comments must never enter the journal.
pub struct Price(pub u32);
pub fn unit_price() -> Price { Price(25) }
pub fn total(quantity: u32) -> u32 { unit_price().0 * quantity }
