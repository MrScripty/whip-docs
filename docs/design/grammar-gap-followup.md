# Bounded parity-gap qualification follow-up

2026-10-11. Baseline `91b05b696ca4bd1121137fe2a78faac36e0f630d`.
Historical report for `1015275810f7574382fc641b15ed46e61f4106b6`.
The subsequent [official qualification](official-grammar-qualification.md) builds
and qualifies the C++/C# candidates described here.

In this initial follow-up, no grammar dependencies, lockfile, graph shape, IPC shape or journal format changed.
No Passeur build/artifact was installed. This is not full extraction parity.

## Classification and recommended fixes

The exact source URLs, inspection hashes and registry versions are in
[grammar-gap-audit.json](grammar-gap-audit.json). All five installed grammar gaps
now have individual construct tests, rather than only a combined fixture.

| Gap | Finding | Exact next step |
| --- | --- | --- |
| Python PEP 696 | Installed 0.25.0 fails defaults in class, function, alias and starred type parameters. Current official default branch `26855eabccb19c6abf499fbc5b8dc7cc9ab8bc64` still has no default-type-parameter production. | Requires an upstream grammar enhancement or separately authorized custom patch/build, then class/function/alias/starred positive qualification. Not repairable by interpreting the current erroneous AST as accepted syntax. |
| Kotlin context parameters | Installed Kotlin-ng 1.1.0 fails named function/property contexts and the older receiver form. Official `3dea6dfa9c0129deb7c4315afbda806c85c41667` contains neither context production. | Requires a grammar enhancement/custom build authorization, followed by function/property/multiple-context/receiver tests and annotation ownership checks. |
| C23 _BitInt | Installed 0.24.2 and current upstream share `b780e47fc780ddc8da13afa35a3f4ed5c157823d`; no bitint production. Unsigned fields and parameter forms fail independently. | Requires a grammar enhancement/custom build authorization. Preserve width-expression ranges; do not guess a primitive type from recovery nodes. |
| C++ explicit object parameters | Installed 0.23.4 lacks the node; official current `c009222808634c1014f82438d4883753516a2c24` has `explicit_object_parameter_declaration`, generated node types and an upstream corpus case. | Qualify an exact official Git-source pin in a separate dependency change. Verify compilation, engine ABI compatibility and real method/receiver extraction. Current Whip traversal already visits the child parameter declaration but must gain an acceptance test before claiming support. |
| C# extension blocks | Installed 0.23.5 misclassifies them; official current `8c0abe0b84a3681d3e6852ce2e2a1eecb4f731c5` has `extension_declaration`, `receiver_parameter`, `extension_body` and corpus cases. | Qualify an exact official Git-source pin, then implement extension-container/receiver extraction with containment and written type evidence. Preserve contextual identifier regressions. Removing the old false-acceptance guard alone is insufficient. |
| Svelte template expressions | An extraction omission. The installed Svelte 1.0.2 grammar intentionally exposes bounded `svelte_raw_text`; the packaged JS/TS grammars already parse the expression interiors. Official default branch `ae5199db47757f785e43a14b332118a5474de1a2` uses the same architecture. | This follow-up implements a bounded call-fact subset; remaining binding/parameter scopes are described below. |

The newer C++ and C# upstream Cargo manifests retain the same nominal package
versions as the older registry releases. A version-only cargo update cannot select
the newer source. Their generated parser headers report ABI 15, but that static
observation is not runtime qualification. Neither upstream source was built in
this pass. Sources are the recognized official upstream repositories, not Passeur
packages; no third-party/custom installation was needed for this work. Any proposed
unrecognized patched build must receive authorization before installation. Python,
Kotlin and C remain blocked on a suitable grammar enhancement or authorized patch.

## Svelte implementation in this follow-up

Whip-owned `syntax/template.rs` parses eligible native raw regions with the
already installed JavaScript/TypeScript grammar. It emits only `CallSyntax` facts
qualified `written_syntax_unresolved`, never compiler-resolved targets.

Qualified contexts: ordinary/template attribute expressions, render/html tags,
if/else-if conditions, each iterable expressions, await expressions and key
expressions. An enclosing reported snippet remains the owner when present.
The dialect is selected from script language attributes; without TypeScript the
JavaScript grammar is used. Each parsed embedded grammar is recorded in identity.

A synthetic parenthesized expression plus terminating newline establishes parsing
context. The resulting tree must be error-free and contain exactly one complete
parenthesized expression. Every emitted call and target must be fully within the
original raw interval. Prefix subtraction and the native start-byte offset map
ranges back to the file; synthetic bytes never enter fact ranges. Invalid regions
emit diagnostics without recovered facts. The whole file permits at most 256
such regions and two seconds of template parsing/traversal, in addition to existing
file/fact/node bounds. No source or copied signature is added to journals.

Tests cover Unicode and CRLF, object/function/arrow expressions, optional calls,
TypeScript casts, final comments, attributes, conditions, render/html, each/await,
nested snippet ownership, wrapper escapes, malformed syntax and region limits.

## Remaining Svelte work

- Each binding/index/key tails need context-aware splitting from the existing raw
  parameter region. Validate both binding and key syntax; publish byte ranges and
  containment without guessing a resolved iterable element type.
- Then/catch bindings and shorthand await forms need distinct scope/parameter
  parsing. A raw `promise then value` is not a single JavaScript expression.
- Snippet parameters need parameter-context validation and mapped declaration /
  annotation ranges, including destructuring/defaults. Malformed parameter syntax
  must remain partial; default/literal text must never enter the journal.
- Const tags need declaration-context parsing and mapped bindings; debug lists
  need their own validation rule. These remain explicit partial diagnostics.
- Complete anonymous callback declarations/type-annotation facts are not claimed
  by this call-only template slice. No component runtime evaluation is performed.

Passeur's reference validates embedded expression/binding regions and inventories
snippet parameters; it does not establish compiler-resolved template calls. This
follow-up is independently implemented and does not claim its full declaration
inventory. Full parity requires these remaining cases and native integration tests.

## Identity and integration

The extractor changes from `whip-docs-syntax@1` to `whip-docs-syntax@2`. Existing
schema-2 and schema-3 journal records remain byte-preserved/readable. A dedicated
regression confirms @1 records become stale against @2 and reject derivatives
without rewriting originals. Source scope/digest domains and IPC DTOs are unchanged.

The separate graph integration branch must deliberately include this follow-up if
wanted; it is not modified here. Native Tauri/combined-app/non-Unix qualification
remains outstanding. See [verification](../../verification/grammar-gap-followup.md).
