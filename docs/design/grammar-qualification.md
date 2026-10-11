# Grammar and extraction qualification

The shipped parser is Whip Docs Rust code using official registry crates.
[Passeur's audited commit](https://github.com/MrScripty/Passeur/tree/725c45cfc1fcd9fae0980bceebe051debdc11cb2)
was inspected for coverage and syntax requirements only. No implementation,
patched grammar, runtime or agent coordination machinery is incorporated.

[grammar-pins.json](grammar-pins.json) records official package URLs, registry
versions, Cargo.lock SHA-256 checksums and `.cargo_vcs_info.json` upstream commits.
Crate and npm versions need not represent the same source commit. Exact versions
are pinned in src-tauri/Cargo.toml. Tree-sitter engine: 0.25.10. The qualified
extractor identity is `whip-docs-syntax@1`; update it on extraction behavior changes.

| Family / dialect | Registry grammar | Concrete fixture coverage | Known qualification gap |
| --- | --- | --- | --- |
| Rust | tree-sitter-rust 0.24.2 | structs, fields, aliases, impls, methods, nested functions, bindings, annotations, `unsafe extern` container and foreign function | No macro expansion or compiler semantics |
| TypeScript / TSX | tree-sitter-typescript 0.23.2 | interfaces, aliases, classes, fields, methods, arrow bindings, typed parameters/results, JSX | No type resolution; selected declaration shapes only |
| JavaScript / JSX | tree-sitter-javascript 0.25.0 | classes, fields, methods, arrow bindings, nested functions, JSX | JSX in .js requires override; no inferred types |
| Python | tree-sitter-python 0.25.0 | classes, methods, aliases, annotated assignments, parameters/results, nested definitions | PEP 696 defaulted type parameters fail parse qualification |
| Lua | tree-sitter-lua 0.4.1 | local bindings, dotted functions, parameters, nested function bindings, calls | Table member inventories and comment-based type annotations not covered |
| Kotlin | tree-sitter-kotlin-ng 1.1.0 | aliases, classes, constructor parameters, functions, local properties, annotations | Modern named context parameters fail; same-line class member termination can also produce missing-token diagnostics |
| Zig | tree-sitter-zig 1.1.2 | bound struct containers, fields, methods, variables, comptime/anytype/noalias, error unions, optional/pointer/array syntax | Identifier constants remain bindings; no guessed type-alias or comptime semantics |
| C# | tree-sitter-c-sharp 0.23.5 | namespaces, using aliases, interfaces, classes, methods, fields, local variables, annotation ownership | Extension blocks silently parse as constructors upstream; extractor rejects that shape as unsupported |
| C | tree-sitter-c 0.24.2 | typedefs, structs/fields, function prototypes/definitions, function-pointer bindings, parameters, locals | C23 `_BitInt` fails qualification |
| C++ | tree-sitter-cpp 0.23.4 | aliases, namespaces, structs/fields, methods, parameters, locals | Explicit object parameters fail qualification; complete template/declarator coverage not claimed |
| Odin | tree-sitter-odin 1.3.0 | packages, structs/fields, distinct aliases, procedures, parameters, local declarations, type syntax | Complete overload/polymorphic construct inventory not claimed |
| Svelte 5 | tree-sitter-svelte-ng 1.0.2 | JS/TS scripts, rune bindings, typed props, functions, snippets, embedded offsets | Template expressions/render expressions not extracted; external/unsupported scripts excluded with diagnostics |

The source suffix tests include .mts/.cts/.mjs/.cjs/.pyi/.kts/.cc/.cxx/.hpp/.hh/.hxx.
.h must be explicitly assigned C or C++. HTML is not an independent source route.

`fixtures/syntax` are independently written Whip Docs fixtures. Tests assert
extracted names, containment, kinds for sensitive C/C# cases, annotation owners,
byte ranges, dialect aliases and real modern grammar node shapes. Absence of an
ERROR node is insufficient: C# extension qualification specifically checks the
missing `extension_declaration` shape. No patched grammar installation was
attempted. Obtaining exact Passeur modern-syntax parity requires separate grammar
qualification, and authorization before installing any unrecognized custom build.

All successful files report `supported_subset`, never a claim of full language
coverage. Malformed/unsupported syntax reports `incomplete`; failure to parse
reports `unavailable` or a bounded parse-budget diagnostic. Recovered headers and
bodies have separate completeness flags. Graph projection omits damaged headers
and descendants of damaged containers. Unresolved facts contain evidence ranges,
not fabricated cross-file target IDs. Parser acceptance does not imply that a
compiler would accept the program.
