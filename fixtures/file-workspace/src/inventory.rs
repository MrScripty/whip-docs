pub struct Stock { pub remaining: u32 }
impl Stock {
    pub fn available(&self, quantity: u32) -> bool { self.remaining >= quantity }
}
pub fn reserve(quantity: u32) -> bool { Stock { remaining: 100 }.available(quantity) }
