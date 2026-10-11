using System;
using Alias = System.String;
namespace Sample { public interface Reader { int Read(int x); }
public class Boxed { public int Value; public int Read(int x) { int local = x; return local; } } }
