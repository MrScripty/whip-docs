// Multibyte prefix: café 🐳
struct Sample {
    int value;
    int copy(this Sample self) { return self.value; }
    int view(this Sample const& /* receiver */ self) { return self.value; }
    int update(this Sample& self, int next) { self.value = next; return next; }
    template <class Self>
    auto forward(this Self&& /* generic */ self) -> int { return inspect(self); }
    int declared(this Sample const& self);
    static int ordinary(int value);
    int (/* pointer */ *callback)(int);
};
