# Official C++ and C# grammar qualification

Design and acceptance recorded before implementation, 2026-10-11.
Baseline: `1015275810f7574382fc641b15ed46e61f4106b6`.

## Scope

Use exact Git dependencies from the recognized official repositories:

- `tree-sitter/tree-sitter-cpp` at `c009222808634c1014f82438d4883753516a2c24`.
- `tree-sitter/tree-sitter-c-sharp` at `8c0abe0b84a3681d3e6852ce2e2a1eecb4f731c5`.

Compile their committed generated parsers with the existing Tree-sitter 0.25.10
runtime, after inspecting build scripts. Record source revision and SHA-256 hashes
for grammar, generated parser/node types, scanner, Rust binding/build script and
parser headers, plus the generated ABI. This qualifies those exact generated
sources; it does not claim a fresh generator reproduces their bytes. No Passeur
artifacts or implementation are used. No Node service or runtime is introduced.

Grammar identities must include the exact upstream revision, and extractor identity
must advance when extraction changes. Source scope, digest domains, journal format
and graph/IPC schemas remain unchanged. C# extension blocks can use the existing
`implementation` kind with the exact `extension` keyword as their name range;
receivers use `parameter`, members retain their existing kinds. This reports an
anonymous syntax container without inventing compiler symbol identities.

## Acceptance

- C++ explicit object parameters: by-value/reference/const/generic receiver forms,
  written type evidence, method containment, exact UTF-8/CRLF name/declaration/fact
  ranges; malformed headers remain partial. Include declarations and definitions.
- C# extension blocks: named and unnamed receivers, generic/constraint syntax,
  methods/properties/operators, exact keyword/receiver/member ranges and lexical
  containment; preserve legitimate contextual identifiers named `extension`.
- A damaged extension header must not project exact graph descendants, and a
  damaged body must not be reported complete. Facts remain written/unresolved.
- Test runtime ABI acceptance, expected AST shapes, Cargo manifest/lock identities
  and reproducible committed-source hashes. Existing languages and journals pass.
- No full-language completeness claim, frontend edits or combined/native app claim.

## Remaining grammar proposals

[Whip-owned enhancement proposals](owned-grammar-enhancements.md) record minimal
changes against official Python, Kotlin and C sources, positive/negative test
requirements, ownership and tool provenance.
No unrecognized third-party patched artifact is needed or authorized by this plan.

## Qualified implementation

Both exact official parsers compile and load into runtime 0.25.10 with ABI 15.
The C++ change preserves explicit receiver ranges including `this`, traverses
reference declarators (including intervening comments), and distinguishes member prototypes from function-pointer
fields. C# extension declarations now produce keyword-named implementation
containers, named receiver parameters, unnamed receiver type facts, member
methods/properties and operator-token methods. No type/call target is resolved.

Positive and damaged-syntax fixtures verify extraction and lexical containment,
not just grammar registration. Hidden missing-token leaves in extension headers
are marked damaged and excluded from exact graph projection.
@1 and @2 journal identities become stale against
extractor `whip-docs-syntax@3` without modifying existing bytes.

## Reproducing exact generated-source provenance

Run from the repository root with the Rust toolchain on PATH:

```sh
CARGO_NET_GIT_FETCH_WITH_CLI=true cargo fetch --locked
python3 scripts/verify-grammar-provenance.py
cargo test --no-default-features --workspace --all-targets --locked
```

The verifier runs Cargo metadata offline without compilation and checks the exact
checkout revision and SHA-256 hashes from [grammar-pins.json](grammar-pins.json).
Its inputs include grammar JS, parser C, scanner C, node types, parser headers,
Rust bindings/build scripts, manifests, licenses and embedded queries. Those
35 input files identify the committed generated parsers compiled by Cargo. The
runtime tests additionally verify ABI acceptance and embedded node-type hashes.

No generator was installed or executed. The upstream generated comments do not
supply a verifiable exact generator version. This is reproducible provenance and
compilation of committed generated source, **not** proof of byte-identical fresh
regeneration from grammar JS. The official build scripts use `cc` to compile C;
no Node runtime or network fetch occurs within them for the qualified Linux build.
C# contains an untested wasm-specific branch; no wasm/native desktop qualification
is claimed. See [verification](../../verification/official-grammars.md).
