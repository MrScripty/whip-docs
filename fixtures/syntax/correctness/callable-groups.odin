package sample
// café 🧭
Parcel :: struct { size: int, }
(Parcel) .grow :: proc(self: ^Parcel, amount: int) {
    self.size += amount
}
render :: proc(value: int) -> int { return value }
render_text :: proc(value: string) -> string { return value }
render_any :: proc{render, render_text}
