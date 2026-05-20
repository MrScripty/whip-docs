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

const {
  buildFocusedFileHierarchy,
  focusedFileHierarchyPath,
  focusedFileHierarchyRadiusRatio,
  focusedFileOffsets,
} = (await import(
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

test('focusedFileOffsets supports explicit grid layout options', () => {
  const offsets = focusedFileOffsets(['a', 'b', 'c', 'd'], [], {
    algorithm: 'grid',
    spacing: 4,
  });

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

test('focusedFileOffsets force-directed layout keeps related files closer than unrelated files', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'a-b', kind: 'imports', fromNodeId: 'a', toNodeId: 'b', weight: 4, direction: 'undirected' },
    { id: 'b-c', kind: 'calls', fromNodeId: 'b', toNodeId: 'c', weight: 2, direction: 'undirected' },
  ];
  const offsets = focusedFileOffsets(['a', 'b', 'c', 'd'], edges, {
    algorithm: 'force-directed',
    spacing: 5,
  });
  const a = requiredOffset(offsets, 'a');
  const b = requiredOffset(offsets, 'b');
  const d = requiredOffset(offsets, 'd');

  assert.ok(distance(a, b) < distance(a, d));
});

test('focusedFileOffsets flow-layered layout places high-output files above high-input files', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'producer-mid-a', kind: 'calls', fromNodeId: 'producer', toNodeId: 'mid-a', weight: 2 },
    { id: 'producer-mid-b', kind: 'imports', fromNodeId: 'producer', toNodeId: 'mid-b', weight: 2 },
    { id: 'producer-sink', kind: 'calls', fromNodeId: 'producer', toNodeId: 'sink', weight: 2 },
    { id: 'mid-a-sink', kind: 'imports', fromNodeId: 'mid-a', toNodeId: 'sink', weight: 1 },
    { id: 'mid-b-sink', kind: 'calls', fromNodeId: 'mid-b', toNodeId: 'sink', weight: 1 },
  ];
  const offsets = focusedFileOffsets(['producer', 'mid-a', 'mid-b', 'sink'], edges, {
    algorithm: 'flow-layered',
    spacing: 5,
  });
  const producer = requiredOffset(offsets, 'producer');
  const midA = requiredOffset(offsets, 'mid-a');
  const midB = requiredOffset(offsets, 'mid-b');
  const sink = requiredOffset(offsets, 'sink');

  assert.ok(producer.y > midA.y);
  assert.ok(producer.y > midB.y);
  assert.ok(midA.y > sink.y);
  assert.ok(midB.y > sink.y);
});

test('focusedFileOffsets dag-layered layout orders dependencies top to bottom', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'entry-service', kind: 'calls', fromNodeId: 'entry', toNodeId: 'service', weight: 1 },
    { id: 'service-model', kind: 'imports', fromNodeId: 'service', toNodeId: 'model', weight: 1 },
    { id: 'entry-view', kind: 'imports', fromNodeId: 'entry', toNodeId: 'view', weight: 1 },
  ];
  const offsets = focusedFileOffsets(['entry', 'service', 'model', 'view'], edges, {
    algorithm: 'dag-layered',
    spacing: 5,
  });
  const entry = requiredOffset(offsets, 'entry');
  const service = requiredOffset(offsets, 'service');
  const model = requiredOffset(offsets, 'model');
  const view = requiredOffset(offsets, 'view');

  assert.ok(entry.y > service.y);
  assert.ok(service.y > model.y);
  assert.ok(entry.y > view.y);
});

test('focusedFileOffsets circular layout places files on a ring', () => {
  const offsets = focusedFileOffsets(['a', 'b', 'c', 'd'], [], {
    algorithm: 'circular',
    spacing: 5,
  });
  const radii = [...offsets.values()].map((offset) => Math.hypot(offset.x, offset.y));

  assert.ok(radii.every((radius) => radius > 0));
  assert.ok(radii.every((radius) => approximatelyEqual(radius, radii[0] ?? 0)));
});

test('focusedFileOffsets circular layout clusters related files around the ring', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'a-b', kind: 'imports', fromNodeId: 'a', toNodeId: 'b', weight: 4 },
    { id: 'b-c', kind: 'calls', fromNodeId: 'b', toNodeId: 'c', weight: 3 },
    { id: 'd-e', kind: 'imports', fromNodeId: 'd', toNodeId: 'e', weight: 4 },
    { id: 'e-f', kind: 'calls', fromNodeId: 'e', toNodeId: 'f', weight: 3 },
  ];
  const offsets = focusedFileOffsets(['a', 'd', 'b', 'e', 'c', 'f'], edges, {
    algorithm: 'circular',
    spacing: 5,
  });

  assert.ok(
    ringDistance(offsets, 'a', 'c') < ringDistance(offsets, 'a', 'd'),
  );
  assert.ok(
    ringDistance(offsets, 'd', 'f') < ringDistance(offsets, 'd', 'a'),
  );
});

test('focusedFileHierarchyPath uses shallow ancestors for local edges and root for distant edges', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'a-b', kind: 'imports', fromNodeId: 'a', toNodeId: 'b', weight: 8 },
    { id: 'c-d', kind: 'imports', fromNodeId: 'c', toNodeId: 'd', weight: 8 },
    { id: 'b-c', kind: 'calls', fromNodeId: 'b', toNodeId: 'c', weight: 1 },
    { id: 'e-f', kind: 'calls', fromNodeId: 'e', toNodeId: 'f', weight: 8 },
  ];
  const hierarchy = buildFocusedFileHierarchy(['a', 'b', 'c', 'd', 'e', 'f'], edges);
  const localPath = focusedFileHierarchyPath(hierarchy, 'a', 'b');
  const bridgePath = focusedFileHierarchyPath(hierarchy, 'a', 'd');
  const distantPath = focusedFileHierarchyPath(hierarchy, 'a', 'e');

  assert.ok(localPath.length < bridgePath.length);
  assert.ok(distantPath.some((node) => node.id === hierarchy.root.id));
});

test('focusedFileHierarchyRadiusRatio keeps small clusters near the outer ring', () => {
  const edges: RenderGraphEdge[] = [
    { id: 'a-b', kind: 'imports', fromNodeId: 'a', toNodeId: 'b', weight: 8 },
    { id: 'b-c', kind: 'calls', fromNodeId: 'b', toNodeId: 'c', weight: 5 },
    { id: 'c-d', kind: 'calls', fromNodeId: 'c', toNodeId: 'd', weight: 1 },
  ];
  const hierarchy = buildFocusedFileHierarchy(['a', 'b', 'c', 'd'], edges);
  const path = focusedFileHierarchyPath(hierarchy, 'a', 'b');
  const localAncestor = path.find((node) => node.children.length > 0 && node.id !== hierarchy.root.id);

  assert.ok(localAncestor);
  assert.equal(focusedFileHierarchyRadiusRatio(hierarchy.root, hierarchy.leafOrder.length), 0);
  assert.ok(focusedFileHierarchyRadiusRatio(localAncestor, hierarchy.leafOrder.length) > 0.4);
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

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function ringDistance(
  offsets: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  leftId: string,
  rightId: string,
): number {
  return distance(requiredOffset(offsets, leftId), requiredOffset(offsets, rightId));
}
