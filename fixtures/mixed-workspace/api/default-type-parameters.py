# Prefix: café 🐳
class Box[T: object = int, U = list[T]]:
    def read(self, item: T) -> T:
        return item

def unpack[*Ts = *tuple[int, str], **P = [int, str]](value: tuple[*Ts]):
    return value

type Alias[T: (int, str) = int, *Rest = *tuple[str, ...]] = tuple[T, *Rest]
type Callback[**P = ...] = Callable[P, int]
ordinary: list[int] = []
