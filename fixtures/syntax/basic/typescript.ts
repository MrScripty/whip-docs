import { item } from "pkg";
interface Reader { read(x: number): string; }
type Alias<T> = T[];
class Boxed { value: number = 1; read(x: number): number { return x; } }
const arrow = (x: number): number => x;
function outer() { const local = 1; function nested() {} nested(); }
