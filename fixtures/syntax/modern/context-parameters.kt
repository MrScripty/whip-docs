// Prefix: café 🐳
context(user: User, logger: Logger)
fun read(): String = logger.render(user)

context(_: Clock, user: User?)
val current: String get() = user.toString()

@Mark context(service: Service<List<String>>, callback: (String) -> Unit,)
suspend fun String.emit(): Unit { callback(this) }

context(User, Logger)
fun legacy(): String = "legacy"

fun context(value: Int): Int = value
val plain = context(1)
