import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { RenderGraphEdge } from './types';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { focusedFileOffsets } = (await import(
  new URL('./focusLayout.ts', import.meta.url).href
)) as typeof import('./focusLayout');

test('focusedFileOffsets falls back to a centered grid without relation edges', () => {
  const offsets = focusedFileOffsets(['a', 'b', 'c', 'd'], [], 4);

  assert.deepEqual([...offsets.entries()], [
    ['a', { x: -2, y: 2 }],
    ['b', { x: 2, y: 2 }],
    ['c', { x: -2, y: -2 }],
    ['d', { x: 2, y: -2 }],
  ]);
});

test('focusedFileOffsets places related files closer than unrelated files', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'a-b', kind: 'imports', fromNodeId: 'a', toNodeId: 'b', weight: 4, direction: 'undirected' },
    { id: 'b-c', kind: 'calls', fromNodeId: 'b', toNodeId: 'c', weight: 2, direction: 'undirected' },
  ];
  const offsets = focusedFileOffsets(['a', 'b', 'c', 'd'], edges, 5);
  const a = requiredOffset(offsets, 'a');
  const b = requiredOffset(offsets, 'b');
  const d = requiredOffset(offsets, 'd');

  assert.ok(distance(a, b) < distance(a, d));
});

test('focusedFileOffsets layers high-output files above high-input files', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'producer-mid-a', kind: 'calls', fromNodeId: 'producer', toNodeId: 'mid-a', weight: 2 },
    { id: 'producer-mid-b', kind: 'imports', fromNodeId: 'producer', toNodeId: 'mid-b', weight: 2 },
    { id: 'producer-sink', kind: 'calls', fromNodeId: 'producer', toNodeId: 'sink', weight: 2 },
    { id: 'mid-a-sink', kind: 'imports', fromNodeId: 'mid-a', toNodeId: 'sink', weight: 1 },
    { id: 'mid-b-sink', kind: 'calls', fromNodeId: 'mid-b', toNodeId: 'sink', weight: 1 },
  ];
  const offsets = focusedFileOffsets(['producer', 'mid-a', 'mid-b', 'sink'], edges, 5);
  const producer = requiredOffset(offsets, 'producer');
  const midA = requiredOffset(offsets, 'mid-a');
  const midB = requiredOffset(offsets, 'mid-b');
  const sink = requiredOffset(offsets, 'sink');

  assert.ok(producer.y > midA.y);
  assert.ok(producer.y > midB.y);
  assert.ok(midA.y > sink.y);
  assert.ok(midB.y > sink.y);
});

function requiredOffset(
  offsets: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  id: string,
): { readonly x: number; readonly y: number } {
  const offset = offsets.get(id);

  assert.ok(offset, `missing offset for ${id}`);
  return offset;
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
