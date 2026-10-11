// café 🧭
const Meter = struct {
    total: i32,
    fn bump(self: *Meter, step: i32) void {
        self.total += step;
        self.total = step;
        var spare: i32 = step;
        spare *= step;
        _ = spare;
    }
};
const Mode = enum { idle, active = 4 };
