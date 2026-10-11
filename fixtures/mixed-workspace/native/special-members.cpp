// café 🧭
struct Gear {
    Gear(int seed);
    ~Gear();
    int operator()(int value) const;
    int operator[](int slot) { return slot; }
};
struct Switch {
    int operator()(int code) { return code; }
};
