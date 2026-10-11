import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { PreviewIntentBackend, PREVIEW_STORAGE_KEY, LEGACY_PREVIEW_STORAGE_KEY, fingerprint, sourceSetDigest } from './PreviewIntentBackend.ts';
import { previewGraph } from './previewFixture.ts';
import type { AppendIntent } from './types.ts';

const SOURCE = '// PRIVATE_COMMENT_DO_NOT_RETAIN\r\npub struct Path;\nconst SECRET_MARKER: &str = "not-a-real-secret";\n';
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const backend = new PreviewIntentBackend(storage, previewGraph, SOURCE);
  const input: AppendIntent = { nodeId: previewGraph.nodes[1].id, text: 'Preserve source boundaries exactly.\nKeep the original intent verbatim. 🧭', kind: 'original', parentId: null, expectedAnalysisAt: previewGraph.generatedAt };
  return { values, storage, backend, input };
}

test('verbatim intent and structural history survive reopening without retained source', async () => {
  const { backend, input, storage, values } = fixture();
  const first = await backend.appendRecord(input);
  const reopened = new PreviewIntentBackend(storage, previewGraph, SOURCE);
  assert.deepEqual(await reopened.listRecords(), [first]);
  assert.equal((await reopened.listRecords())[0].text, input.text);
  const journal = values.get(PREVIEW_STORAGE_KEY)!;
  for (const marker of ['PRIVATE_COMMENT_DO_NOT_RETAIN', 'SECRET_MARKER', 'not-a-real-secret', 'pub struct Path', 'exactSource', 'sourceSnapshot']) assert.equal(journal.includes(marker), false, marker);
  assert.equal(first.snapshot.contentHash, 'sha256:' + createHash('sha256').update(SOURCE).digest('hex'));
  assert.ok(first.snapshot.structuralSnapshot.nodes.some(node => node.id === input.nodeId));
  assert.equal(first.snapshot.worktreeDigestScope, 'analyzed_rust_sources');
});

test('interpretations and proposals append separately without changing original', async () => {
  const { backend, input, storage } = fixture();
  const first = await backend.appendRecord(input);
  const originalBytes = JSON.stringify(JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY)!)[0]);
  await backend.appendRecord({ ...input, text: 'Consider explicit symlink diagnostics.', kind: 'proposal', parentId: first.id });
  await backend.appendRecord({ ...input, text: 'The boundary includes canonicalized symlinks.', kind: 'interpretation', parentId: first.id });
  const records = await backend.listRecords();
  assert.equal(records.length, 3); assert.deepEqual(records[0], first);
  assert.equal(records[1].originalId, first.id); assert.deepEqual(records[2].snapshot, first.snapshot);
  assert.equal(JSON.stringify(JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY)!)[0]), originalBytes);
});

test('digest changes and renamed symbols never silently relink historical records', async () => {
  const { backend, input, storage } = fixture();
  const first = await backend.appendRecord(input);
  const changed = new PreviewIntentBackend(storage, previewGraph, SOURCE + '// changed\n');
  assert.equal((await changed.listRecords())[0].bindingStatus, 'stale');
  await assert.rejects(changed.appendRecord({ ...input, kind: 'interpretation', parentId: first.id }), /Historical/);
  const renamed = structuredClone(previewGraph); renamed.nodes[1].id = 'renamed';
  assert.equal((await new PreviewIntentBackend(storage, renamed, SOURCE).listRecords())[0].bindingStatus, 'missing');
});

test('structural metadata changes are stale even when source digest is unchanged', async () => {
  const { backend, input, storage } = fixture();
  const first = await backend.appendRecord(input);
  const moved = structuredClone(previewGraph); moved.nodes[1].sourceRange!.startLine += 1;
  const reopened = new PreviewIntentBackend(storage, moved, SOURCE);
  assert.equal((await reopened.listRecords())[0].bindingStatus, 'stale');
  await assert.rejects(reopened.appendRecord({ ...input, kind: 'proposal', parentId: first.id }), /Historical/);
});

test('stale selections and invalid inputs never append', async () => {
  const { backend, input } = fixture();
  await assert.rejects(backend.appendRecord({ ...input, expectedAnalysisAt: 'old' }), /Analysis changed/);
  await assert.rejects(backend.appendRecord({ ...input, text: '  ' }), /Enter nonblank/);
  await assert.rejects(backend.appendRecord({ ...input, text: '🧭'.repeat(5000) }), /16 KiB/);
  await assert.rejects(backend.appendRecord({ ...input, nodeId: previewGraph.nodes[0].id }), /symbol/);
  await assert.rejects(backend.appendRecord({ ...input, kind: 'proposal', parentId: 'missing' }), /original/);
  assert.equal((await backend.listRecords()).length, 0);
});

test('corrupt journal fails closed and remains unchanged', async () => {
  const { backend, input, storage } = fixture();
  storage.setItem(PREVIEW_STORAGE_KEY, 'broken');
  await assert.rejects(backend.appendRecord(input));
  assert.equal(storage.getItem(PREVIEW_STORAGE_KEY), 'broken');
});

test('legacy source-retaining journal is never silently copied, erased or migrated', async () => {
  const { backend, input, storage } = fixture();
  const old = JSON.stringify([{ exactSource: SOURCE }]);
  storage.setItem(LEGACY_PREVIEW_STORAGE_KEY, old);
  await assert.rejects(backend.listRecords(), /legacy/);
  await assert.rejects(backend.appendRecord(input), /legacy/);
  assert.equal(storage.getItem(LEGACY_PREVIEW_STORAGE_KEY), old);
  assert.equal(storage.getItem(PREVIEW_STORAGE_KEY), null);
});

test('fingerprint uses SHA-256 over exact UTF-8 bytes', async () => {
  assert.equal(await fingerprint(''), 'sha256:' + createHash('sha256').update('').digest('hex'));
  assert.equal(await fingerprint('hello'), 'sha256:' + createHash('sha256').update('hello').digest('hex'));
  assert.notEqual(await fingerprint('x\n'), await fingerprint('x'));
});

test('missing metadata cannot silently extend a damaged preview journal', async () => {
  const { backend, input, storage } = fixture();
  storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify([{ schemaVersion: 2, record: { id: 'x', text: 'x' } }]));
  const before = storage.getItem(PREVIEW_STORAGE_KEY);
  await assert.rejects(backend.appendRecord(input), /invalid/);
  assert.equal(storage.getItem(PREVIEW_STORAGE_KEY), before);
});

test('captured-source digest matches native domain separation and byte framing', async () => {
  const path = 'src/路径.rs';
  const contentHash = await fingerprint(SOURCE);
  const pathBytes = Buffer.from(path);
  const sourceBytes = Buffer.byteLength(SOURCE);
  const pathLength = Buffer.alloc(8); pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
  const sourceLength = Buffer.alloc(8); sourceLength.writeBigUInt64BE(BigInt(sourceBytes));
  const expected = 'sha256:' + createHash('sha256').update('whip-docs:analyzed-rust-sources:v1\0').update(pathLength).update(pathBytes).update(sourceLength).update(contentHash).digest('hex');
  assert.equal(await sourceSetDigest([{ path, contentHash, byteLength: sourceBytes }]), expected);
  assert.notEqual(await sourceSetDigest([{ path: 'renamed.rs', contentHash, byteLength: sourceBytes }]), expected);
});

test('changed observed structure cannot relink a historical original', async () => {
  const { backend, input, storage } = fixture();
  const first = await backend.appendRecord(input);
  const changed = structuredClone(previewGraph);
  changed.edges = changed.edges.filter(edge => edge.kind !== 'defines_method');
  const reopened = new PreviewIntentBackend(storage, changed, SOURCE);
  assert.equal((await reopened.listRecords())[0].bindingStatus, 'stale');
  await assert.rejects(reopened.appendRecord({ ...input, kind: 'interpretation', parentId: first.id }), /Historical/);
});
