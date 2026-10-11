const std = @import("std");
const Boxed = struct { value: i32, pub fn read(self: Boxed) i32 { return self.value; } };
const Alias = Boxed;
pub fn outer(x: i32) i32 { const local: i32 = x; return local; }
