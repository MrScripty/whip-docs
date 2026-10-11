package sample
import "core:fmt"
Boxed :: struct { value: int, }
Alias :: distinct int
read :: proc(x: int) -> int { local := x; return local }
