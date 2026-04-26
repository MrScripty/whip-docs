import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GraphEdgeDto, GraphNodeDto } from '../../backends/TauriArchitectureBackend.ts';
import {
  buildGraphLayout,
  filterGraphNodes,
  graphLabel,
  graphNodeKinds,
  projectGraph,
} from './graphView.ts';

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
    id: 'file:src/lib.rs',
    kind: 'file',
    label: 'src/lib.rs',
    sourceRange: {
      path: 'src/lib.rs',
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    },
  },
  {
    id: 'file:src/domain.rs',
    kind: 'file',
    label: 'src/domain.rs',
    sourceRange: {
      path: 'src/domain.rs',
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    },
  },
];

const edges: GraphEdgeDto[] = [
  {
    id: 'defines:function',
    kind: 'defines',
    sourceId: 'file:src/domain.rs',
    targetId: 'function:entry',
    provenance: 'syn',
    confidence: 'exact',
  },
  {
    id: 'missing:endpoint',
    kind: 'calls',
    sourceId: 'function:entry',
    targetId: 'function:missing',
    provenance: 'syn',
    confidence: 'partial',
  },
];

test('filterGraphNodes searches labels and source paths', () => {
  assert.deepEqual(
    filterGraphNodes(nodes, { query: 'lib.rs', kinds: [], limit: 10 }).map((node) => node.id),
    ['function:entry', 'file:src/lib.rs'],
  );
});

test('filterGraphNodes filters by kind and limit', () => {
  assert.deepEqual(
    filterGraphNodes(nodes, { query: '', kinds: ['function', 'file'], limit: 1 }).map(
      (node) => node.id,
    ),
    ['function:entry'],
  );
});

test('graphNodeKinds returns stable sorted kinds', () => {
  assert.deepEqual(graphNodeKinds(nodes), ['file', 'function', 'struct']);
});

test('projectGraph collapses symbol relationships into file architecture edges', () => {
  const projection = projectGraph(nodes, edges, 'architecture');

  assert.deepEqual(
    projection.nodes.map((node) => node.id),
    ['file:src/lib.rs', 'file:src/domain.rs'],
  );
  assert.deepEqual(projection.edges, [
    {
      ...edges[0],
      id: 'defines:file:src/domain.rs:file:src/lib.rs',
      sourceId: 'file:src/domain.rs',
      targetId: 'file:src/lib.rs',
    },
  ]);
});

test('buildGraphLayout renders visible nodes and edges only', () => {
  const layout = buildGraphLayout(nodes, edges);

  assert.deepEqual(
    new Set(layout.nodes.map((node) => node.id)),
    new Set(['function:entry', 'struct:widget', 'file:src/lib.rs', 'file:src/domain.rs']),
  );
  assert.deepEqual(
    layout.edges.map((edge) => edge.id),
    ['defines:function'],
  );
  assert.equal(layout.width >= 1300, true);
  assert.equal(layout.height >= 760, true);
  assert.match(layout.edges[0].path, /^M /);
});

test('graphLabel truncates long SVG labels', () => {
  assert.equal(graphLabel('short', 8), 'short');
  assert.equal(graphLabel('very-long-label', 8), 'very-...');
});
