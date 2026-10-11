# Proposed Whip-owned grammar enhancements

Historical proposal; implemented later under [separate acceptance](owned-grammar-implementation.md).
See the [qualification report](../../verification/owned-grammars.md) for current status.

2026-10-11 initial proposal. Design only: none of these three grammar changes has been implemented
or qualified. Existing negative fixtures and partial diagnostics remain in place.
The [read-only audit](grammar-gap-audit.json) pins all source revisions/hashes.

## Ownership and build authorization

These can be developed as requested Whip Docs source code: small reviewed patches
against exact recognized official sources, with upstream license notices preserved,
Whip-owned corpus fixtures, and generated C parsers built into the Rust application.
No Passeur source/package and no unrecognized third-party patched binary is needed.
A local source patch is our implementation work, not installation of an unknown
third-party artifact. The current task asks for proposals for these three changes;
this pass therefore does not install a generator or apply them.

Recommended implementation layout is a narrow vendored grammar source package per
language, containing the exact upstream base/license, a human-readable Whip patch,
fixtures, generated parser/node types, and a provenance manifest. Alternatively a
Whip-maintained source repository requires a separate authorized publication step.
Do not reference an unpinned branch, reuse the registry identity for modified code,
or fetch generated files at application startup/build time.

Use an exact official `tree-sitter-cli` crates.io release compatible with ABI 15,
plus a recorded existing JavaScript build interpreter, to regenerate locally;
inspect the official tool's manifest/build behavior first. Record base revision,
patch hash, generator version/source/checksum, generation command, output hashes
and license. Check a second generation produces the same parser/node-type hashes,
run the upstream corpus plus additions, then Whip extraction/range/journal tests.
JavaScript is a grammar-build input only; there is no application Node sidecar.
If this route ever requires an unrecognized third-party patched generator or
prebuilt grammar, pause that exact installation and request authorization with its
URL, revision, hash and build action. That is not currently a known prerequisite.

## Python: defaulted type parameters

Base: official `tree-sitter/tree-sitter-python` at
`26855eabccb19c6abf499fbc5b8dc7cc9ab8bc64`.
[PEP 696](https://peps.python.org/pep-0696/) defines defaults for ordinary, starred
and double-starred parameters; the change must distinguish parameter definitions
from type argument usage.

The current `type_parameter` rule is shared by function/class definitions and
`generic_type`; adding `= expression` there indiscriminately could accept defaults
in ordinary type uses. Split a declaration-only parameter-list path from existing
type-argument lists. Route class/function `type_parameters` through it, and add an
explicit alias declaration head for `type Alias[...] = ...`. Introduce named
`default_type_parameter` nodes with distinct name/bound/default fields; support
unpacked tuple defaults and ParamSpec list/ellipsis defaults using the existing
expression grammar. Preserve aliases without parameters and existing generic uses.

Whip extraction should inventory the containing class/function/alias and exact
parameter name/bound/default evidence ranges without copying defaults into labels
or journals. Do not infer default evaluation, type compatibility or substitution.

Acceptance: class/function/alias, bounded and constrained parameters, ordinary /
`*Ts = *tuple[int, ...]` / `**P = [int, str]` / ellipsis defaults, multiline/comments,
Unicode/CRLF, nested generic defaults and adjacent non-generic assignments.
Negative cases: missing defaults/delimiters, repeated `=`, defaults in ordinary
type argument positions, malformed starred defaults; preserve partial diagnostics.
Default ordering and scope checks must be documented separately from CST acceptance.

## Kotlin: context parameters and legacy receivers

Base: official `tree-sitter-grammars/tree-sitter-kotlin` at
`3dea6dfa9c0129deb7c4315afbda806c85c41667`.
[Official context-parameter documentation](https://kotlinlang.org/docs/context-parameters.html)
provides the named function/property forms; compatibility with the old unnamed
receiver syntax is a separate syntax route, not a claim of current compiler support.

Add `context_parameters` containing named `context_parameter` nodes with name/type
fields, and a distinct legacy `context_receivers` list. Attach the context clause
to function/property declaration prefixes while preserving annotation/modifier
ordering and newline behavior. Keep `context` contextual so calls and identifiers
named context continue to parse. Do not add a global expression-level shortcut or
pretend every `context(...)` call declares parameters. Reuse the existing type,
annotation, nullable/generic/function-type rules; resolve only observed conflicts.

Whip should assign named parameters to the owning function/property. Anonymous
underscore entries and legacy receiver types get written-type facts without
invented variable names. Property wrappers need ownership tests so context facts
are attached to the reported property rather than the surrounding class/file.

Acceptance: multiple named entries, function and property/getter use, annotations,
modifiers, extension receiver plus context, nullable/generic/function types,
underscore names, trailing comma and multiline layouts, legacy receiver forms.
Negative cases: missing name/type/colon, malformed separators, incomplete clause;
regress ordinary `context(...)` calls and declarations using that identifier.
No implicit receiver lookup, overload resolution or compiler flag semantics.

## C23: bit-precise integer type syntax

Base: official `tree-sitter/tree-sitter-c` at
`b780e47fc780ddc8da13afa35a3f4ed5c157823d`.
[WG14 draft N3096](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3096.pdf), section
6.7.2, provides the `_BitInt` type syntax.

Add a named `bitint_type` production with `_BitInt`, parentheses and a width
expression field. Integrate it into `type_specifier` and signed/unsigned type
combinations while preserving type qualifiers and declarator structure. Prefer a
narrow signedness path over accepting arbitrary long/short combinations. Check
conflicts with existing macro-type specifiers and ordinary function calls.
Whip's existing declaration/type traversal can retain the whole written type and
exact width range; it must not evaluate the expression or fabricate an integer size.

Acceptance: bare/signed/unsigned forms, both legal signedness orderings, typedefs,
struct fields, parameters/returns, pointers, qualifiers and constant-expression
widths, with Unicode comments/CRLF. Negative cases: missing/empty parentheses,
missing width, malformed expression and non-type lookalikes. Keep bit-precise
literal suffix support a separately tested requirement, not implied by this patch.
Width value validity and target limits remain compiler responsibilities.

## Publication gate

None of these proposals closes a current gap. A future implementation must replace
the corresponding negative fixture only after generated-shape, positive/negative
extraction, exact-range, existing-corpus and identity tests pass. Publish new grammar
and extractor identities so saved journal records become stale without rewriting.
No graph/IPC/journal schema change is required by the proposed initial subset.
