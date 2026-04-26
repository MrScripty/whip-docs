import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GraphNodeDto } from '../../backends/TauriArchitectureBackend.ts';
import { filterGraphNodes, graphNodeKinds } from './graphView.ts';

const nodes: GraphNodeDto[] = [
  {
    id: 'function:entry',
    kind: 'function',
    label: 'entry',
    sourceRange: {
      path: 'src/lib.rs',
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    },
  },
  {
    id: 'struct:widget',
    kind: 'struct',
    label: 'Widget',
    sourceRange: null,
  },
  {
    id: 'module:domain',
    kind: 'module',
    label: 'domain',
    sourceRange: null,
  },
];

test('filterGraphNodes searches labels and source paths', () => {
  assert.deepEqual(
    filterGraphNodes(nodes, { query: 'lib.rs', kinds: [], limit: 10 }).map((node) => node.id),
    ['function:entry'],
  );
});

test('filterGraphNodes filters by kind and limit', () => {
  assert.deepEqual(
    filterGraphNodes(nodes, { query: '', kinds: ['function', 'module'], limit: 1 }).map(
      (node) => node.id,
    ),
    ['function:entry'],
  );
});

test('graphNodeKinds returns stable sorted kinds', () => {
  assert.deepEqual(graphNodeKinds(nodes), ['function', 'module', 'struct']);
});
