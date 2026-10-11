# Grammar and extraction qualification

The shipped parser is Whip Docs Rust code using official registry crates and
two exact official Git revisions for C++ and C#, plus three narrow Whip-owned
source patches based on official Python/Kotlin/C revisions.
[Passeur's audited commit](https://github.com/MrScripty/Passeur/tree/725c45cfc1fcd9fae0980bceebe051debdc11cb2)
was inspected for coverage and syntax requirements only. No implementation,
Passeur-patched grammar, runtime or agent coordination machinery is incorporated.

[grammar-pins.json](grammar-pins.json) records official package URLs, registry
versions/checksums and upstream commits. Git grammars include their full source
revision and generated-source input hashes, verified by
`scripts/verify-grammar-provenance.py`. Whip-owned packages include readable patches,
upstream input hashes and regenerated output hashes checked offline by
`scripts/verify-owned-grammars.py`. Crate and npm versions need not represent
the same source commit. Exact versions/revisions are pinned in src-tauri/Cargo.toml. Tree-sitter engine: 0.25.10. The qualified
extractor identity is `whip-docs-syntax@6`; update it on extraction behavior changes.

| Family / dialect | Pinned grammar | Concrete fixture coverage | Known qualification gap |
| --- | --- | --- | --- |
| Rust | tree-sitter-rust 0.24.2 | structs, fields, aliases, impls, methods, nested functions, bindings, annotations, `unsafe extern` container and foreign function | No macro expansion or compiler semantics |
| TypeScript / TSX | tree-sitter-typescript 0.23.2 | interfaces, aliases, classes, fields, methods, arrow bindings, typed parameters/results, JSX | No type resolution; selected declaration shapes only |
| JavaScript / JSX | tree-sitter-javascript 0.25.0 | classes, fields, methods, arrow bindings, nested functions, JSX | JSX in .js requires override; private fields and default/rest/destructured parameter inventories explicitly diagnosed; no inferred types |
| Python | Whip tree-sitter-python 0.25.0-whip.1 | classes, methods, aliases, annotated assignments, parameters/results, nested definitions, PEP 696 bound/default type parameters, TypeVarTuple and ParamSpec defaults | No evaluation, type checking or full CPython syntax validation; starred defaults/bounds have explicit extraction validation |
| Lua | tree-sitter-lua 0.4.1 | local bindings, dotted functions, parameters, nested function bindings, calls | Table member inventories and comment-based type annotations not covered |
| Kotlin | Whip tree-sitter-kotlin-ng 1.1.0-whip.1 | aliases, classes, constructor parameters and secondary constructors, functions, member/local properties and simple property-lambda parameters/locals, named/anonymous context parameters on functions/properties, legacy context receivers, annotations | Destructuring properties explicitly excluded; same-line class member termination can produce missing-token diagnostics; no compiler context resolution |
| Zig | tree-sitter-zig 1.1.2 | bound struct containers, fields, methods, actual var/const bindings, enum cases, comptime/anytype/noalias, error unions, optional/pointer/array syntax | Assignment RHS identifiers are excluded; nonexhaustive enum marker is not a variant; identifier constants remain bindings; no guessed type-alias or comptime semantics |
| C# | official tree-sitter-c-sharp Git `8c0abe0b` | namespaces, aliases, classes/interfaces, methods/fields, extension containers, named/unnamed and generic receivers, extension properties/operators | File-scoped namespace membership explicitly diagnosed; compiler placement, constraint/type resolution and complete declaration inventory not claimed |
| C | Whip tree-sitter-c 0.24.2-whip.1 | typedefs, structs/fields, function prototypes/definitions, function-pointer bindings, parameters, locals, C23 `_BitInt` signedness/width expressions | Preprocessor alternatives explicitly unresolved; no width evaluation, compiler validity or full declarator coverage |
| C++ | official tree-sitter-cpp Git `c0092228` | aliases, namespaces, structs/fields, method declarations/definitions, destructors and named operator members, explicit object parameters, locals | Conversion/literal operators and multiple callable declarators are excluded with diagnostics; preprocessor alternatives unresolved; complete template/declarator coverage and compiler receiver semantics not claimed |
| Odin | tree-sitter-odin 1.3.0 | packages, structs/fields, distinct aliases, ordinary/qualified procedures and named procedure groups, parameters, local declarations, type syntax | Enum/union member inventory explicitly diagnosed; procedure groups have no resolved overload links; complete polymorphic inventory not claimed |
| Svelte 5 | tree-sitter-svelte-ng 1.0.2 + packaged JS/TS grammars | JS/TS scripts, runes, typed props, functions, snippets, destructured/default snippet parameters, each bindings/index/key, await then/catch bindings and shorthand, const/debug, mapped calls/types | Selected syntax inventory only; no compiler scope/runtime validation or complete anonymous-expression declaration inventory; external/unsupported scripts excluded |

The source suffix tests include .mts/.cts/.mjs/.cjs/.pyi/.kts/.cc/.cxx/.hpp/.hh/.hxx.
.h must be explicitly assigned C or C++. HTML is not an independent source route.

`fixtures/syntax` are independently written Whip Docs fixtures. Tests assert
extracted names, containment, kinds for sensitive C/C# cases, annotation owners,
byte ranges, dialect aliases and real modern grammar node shapes. Absence of an
ERROR node is insufficient: C# extension qualification specifically checks the
`extension_declaration` shape and its extraction. The three owned source patches were generated with official crates.io Tree-sitter
CLI 0.25.10, using existing Node only at generation time. No Passeur or unrecognized
third-party grammar artifact was installed. Selected modern requirements are
qualified; this is not a claim of complete Passeur extraction parity.

All successful files report `supported_subset`, never a claim of full language
coverage. Malformed/unsupported syntax reports `incomplete`; failure to parse
reports `unavailable` or a bounded parse-budget diagnostic. Recovered headers and
bodies have separate completeness flags. Graph projection omits damaged headers
and descendants of damaged containers. Unresolved facts contain evidence ranges,
not fabricated cross-file target IDs. Parser acceptance does not imply that a
compiler would accept the program.

The [bounded gap follow-up](grammar-gap-followup.md) records the initial gap audit.
The later [official-source qualification](official-grammar-qualification.md)
qualifies C++/C# candidates. The [owned implementation acceptance](owned-grammar-implementation.md)
and [verification report](../../verification/owned-grammars.md) qualify the later
Python/Kotlin/C patches and broader Svelte inventory.
The [extractor correctness acceptance](extractor-correctness-followup.md) and
[verification report](../../verification/extractor-correctness.md) record the
later Kotlin/Zig ownership and C++/Odin callable fixes without grammar changes.

The @6 privacy repair rejects comment-bearing or otherwise unsupported composite
declaration names with `unsupported_declaration_name` and omits their descendants.
Clean C#/C++ qualified namespaces, including C++ inline namespaces, retain exact
name ranges. See [repair verification](../../verification/integration/namespace-label-repair.md).
