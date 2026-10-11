use std::fmt;
pub struct Boxed { pub value: i32 }
type Alias = Boxed;
impl Boxed { pub fn read(&self) -> i32 { self.value } }
fn outer(x: i32) { let value = x; fn nested() {} nested(); }
