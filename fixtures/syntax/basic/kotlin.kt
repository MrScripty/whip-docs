package sample
import kotlin.String
typealias Alias = String
class Boxed(val value: Int) {
 fun read(x: Int): Int = x
}
fun outer(x: Int) { val local: Int = x; fun nested() {}
 nested() }
