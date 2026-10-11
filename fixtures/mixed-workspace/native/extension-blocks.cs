// Multibyte prefix: café 🐳
public static class Extensions {
    extension(string text) {
        public int Size => text.Length;
        public int Read(int offset) => measure(text, offset);
    }
    extension<T>(IEnumerable<T> values) where T : class {
        public int Count() => count(values);
    }
    extension(ref int number) {
        public void Increment() { number++; }
    }
    extension(List<int>) {
        public static int EmptySize => 0;
        public static List<int> operator +(List<int> left, List<int> right) => merge(left, right);
    }
}
class extension {
    public extension() {}
}
class Contextual {
    public int extension(int value) => value;
    public int Read() => extension(1);
}
