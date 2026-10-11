import { item } from "pkg";
class Boxed { value = 1; read(x) { return x; } }
const arrow = (x) => x;
function outer() { let local = 1; function nested() {} nested(); }
