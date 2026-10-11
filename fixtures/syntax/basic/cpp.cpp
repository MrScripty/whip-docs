#include <vector>
using Alias = int;
namespace Sample { struct Boxed { int value; int read(int x) { return x; } };
int outer(int x) { int local = x; return local; } }
