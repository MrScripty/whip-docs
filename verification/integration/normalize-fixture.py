"""Normalize explicit public fixture output; run after the Rust integration_fixture example."""
import hashlib
import json
from pathlib import Path
import sys

repo = Path(__file__).resolve().parents[2]
raw = json.loads(Path(sys.argv[1]).read_text())
record = json.loads(json.dumps(raw).replace(raw['files']['sourceRoot'], 'public-fixture:whip-mixed-workspace'))
for key in ['files', 'symbols', 'overriddenSymbols']:
    record[key]['generatedAt'] = 'fixture:mixed-' + key
record['journalVector']['snapshot']['analysisAt'] = record['overriddenSymbols']['generatedAt']
record['journalVector']['createdAt'] = record['journalVector']['snapshot']['capturedAt'] = '2026-10-11T00:00:00.000Z'
(repo / 'fixtures/mixed-workspace.snapshot.json').write_text(json.dumps(record, indent=2) + '\n')
fixture = repo / 'fixtures/mixed-workspace'
hashes = {str(p.relative_to(fixture)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(fixture.rglob('*')) if p.is_file()}
provenance = {'parserCommit': '88d62abb68d3ba57deefb59c9878fdd43aaaa599', 'graphCommit': '2a6b73da3fce1ce099e91fa386986c4b2f63a44e', 'generator': 'cargo run --no-default-features --example integration_fixture -- FIXTURE_ROOT DISPOSABLE_APP_DATA', 'normalization': 'Absolute root replaced with public fixture label; graph and journal timestamps fixed; identities, digests, ranges, facts and relationships unchanged.', 'sourceSha256': hashes}
(repo / 'fixtures/mixed-workspace.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(f"Recorded {len(record['overriddenAnalysis']['files'])} files with {record['overriddenAnalysis']['identity']['extractor']}.")
