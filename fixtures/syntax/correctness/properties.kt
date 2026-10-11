// café 🧭
class Ledger(val seed: Int) {
    val current: Int = seed
    val cached: Int by lazy { seed }
    var balance: Int = seed
    constructor(size: Long): this(size.toInt()) {}
    fun read(): Int {
        val local: Int = current
        return local
    }
}
val headline: String = title
