from typing import Any
type Alias = list[int]
class Boxed:
    value: int = 1
    def read(self, x: int) -> int:
        local = x
        return local
def outer(x: int):
    def nested():
        pass
    nested()
