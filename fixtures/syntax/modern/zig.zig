const Boxed = struct { value: i32 };
pub fn make() Boxed { return .{ .value = 1 }; }
pub fn decode(stream: anytype) ![]const u8 { return error.Empty; }
pub fn transfer(noalias output: []u8, noalias input: []const u8) void {}
pub fn first(comptime Element: type, items: *[8]Element) ?Element { return null; }
