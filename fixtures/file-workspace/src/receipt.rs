use crate::domain::pricing;
pub fn render(quantity: u32) -> String { format!("PUBLIC_RECEIPT_LITERAL: {}", pricing::total(quantity)) }
