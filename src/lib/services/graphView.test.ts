import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GraphEdgeDto, GraphNodeDto } from '../../backends/TauriArchitectureBackend.ts';
import { buildGraphLayout, filterGraphNodes, graphLabel, graphNodeKinds } from './graphView.ts';

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

const edges: GraphEdgeDto[] = [
  {
    id: 'defines:function',
    kind: 'defines',
    sourceId: 'module:domain',
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

test('buildGraphLayout renders visible nodes and edges only', () => {
  const layout = buildGraphLayout(nodes, edges);

  assert.deepEqual(
    layout.nodes.map((node) => node.id),
    ['module:domain', 'struct:widget', 'function:entry'],
  );
  assert.deepEqual(
    layout.edges.map((edge) => edge.id),
    ['defines:function'],
  );
  assert.equal(layout.nodes[0].x < layout.nodes[2].x, true);
  assert.match(layout.edges[0].path, /^M /);
});

test('graphLabel truncates long SVG labels', () => {
  assert.equal(graphLabel('short', 8), 'short');
  assert.equal(graphLabel('very-long-label', 8), 'very-...');
});
