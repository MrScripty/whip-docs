class Box[T = int]:
    pass
def read[T = int](x: T) -> T:
    return x
type Alias[T = int] = list[T]
class Pack[*Ts = tuple[int, ...], **P = None]:
    pass
