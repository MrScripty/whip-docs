import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { decodeSelectionId, encodeSelectionId, selectFromIdMap } = (await import(
  new URL('./selection.ts', import.meta.url).href
)) as typeof import('./selection');

test('selection IDs round-trip node and edge indices', () => {
  const nodeId = encodeSelectionId('node', 42);
  const edgeId = encodeSelectionId('edge', 7);

  assert.deepEqual(decodeSelectionId(nodeId), {
    kind: 'node',
    index: 42,
    selectionId: nodeId,
  });
  assert.deepEqual(decodeSelectionId(edgeId), {
    kind: 'edge',
    index: 7,
    selectionId: edgeId,
  });
});

test('selection chooses nodes over edges inside the sampled radius', () => {
  const edgeId = encodeSelectionId('edge', 1);
  const nodeId = encodeSelectionId('node', 2);
  const ids = new Uint32Array([
    0,
    0,
    0,
    0,
    edgeId,
    nodeId,
    0,
    0,
    0,
  ]);
  const depths = new Float32Array([
    1,
    1,
    1,
    1,
    0.1,
    0.9,
    1,
    1,
    1,
  ]);

  const hit = selectFromIdMap({ width: 3, height: 3, ids, depths }, { x: 1, y: 1 }, { radius: 1 });

  assert.equal(hit?.kind, 'node');
  assert.equal(hit?.index, 2);
});

test('selection chooses nearest depth when candidate kinds match', () => {
  const farNodeId = encodeSelectionId('node', 1);
  const nearNodeId = encodeSelectionId('node', 2);
  const ids = new Uint32Array([
    farNodeId,
    0,
    0,
    0,
    nearNodeId,
    0,
    0,
    0,
    0,
  ]);
  const depths = new Float32Array([
    0.8,
    1,
    1,
    1,
    0.2,
    1,
    1,
    1,
    1,
  ]);

  const hit = selectFromIdMap({ width: 3, height: 3, ids, depths }, { x: 0, y: 0 }, { radius: 2 });

  assert.equal(hit?.kind, 'node');
  assert.equal(hit?.index, 2);
});

test('selection returns null when no encoded IDs are sampled', () => {
  const hit = selectFromIdMap(
    { width: 2, height: 2, ids: new Uint32Array(4) },
    { x: 0, y: 0 },
    { radius: 1 },
  );

  assert.equal(hit, null);
});
