/* Prefix: café 🐳 */
typedef unsigned _BitInt(17) Counter;
struct Sample {
    _BitInt(9) small;
    unsigned _BitInt(32 + 1) wide;
    _BitInt(65) signed reverse;
};
_BitInt(17) read(const _BitInt(17) *value, unsigned _BitInt(33) next) {
    _BitInt(17) local = *value;
    return local;
}
