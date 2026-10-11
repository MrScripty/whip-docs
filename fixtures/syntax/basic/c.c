#include <stdint.h>
typedef int Alias;
struct Boxed { int value; };
int read(struct Boxed *box) { int local = box->value; return local; }
