use crate::inventory;
use crate::receipt;
use crate::domain::pricing;

pub struct Order { pub quantity: u32 }
impl Order {
    pub fn quote(&self) -> u32 { pricing::total(self.quantity) }
}
pub fn checkout(order: &Order) -> Option<String> {
    if inventory::reserve(order.quantity) { Some(receipt::render(order.quantity)) } else { None }
}
pub fn preview(order: &Order) -> String { receipt::render(order.quantity) }
