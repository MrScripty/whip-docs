import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { RenderGraph } from './types';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const {
  buildSelectionIndex,
  diffSelectionState,
  emptySelectionState,
  selectionDistanceByNodeId,
  selectionNeighborhood,
  selectionStateForNode,
} = (await import(new URL('./selectionIndex.ts', import.meta.url).href)) as typeof import('./selectionIndex');

const graph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    { id: 'repo', kind: 'repo', name: 'repo', path: '.', childIds: ['src', 'docs'] },
    { id: 'src', kind: 'directory', name: 'src', path: 'src', parentId: 'repo', childIds: ['lib', 'main'] },
    { id: 'lib', kind: 'file', name: 'lib.rs', path: 'src/lib.rs', parentId: 'src', childIds: [] },
    { id: 'main', kind: 'file', name: 'main.rs', path: 'src/main.rs', parentId: 'src', childIds: [] },
    { id: 'docs', kind: 'directory', name: 'docs', path: 'docs', parentId: 'repo', childIds: [] },
  ],
  edges: [
    { id: 'repo-src', kind: 'contains', fromNodeId: 'repo', toNodeId: 'src' },
    { id: 'repo-docs', kind: 'contains', fromNodeId: 'repo', toNodeId: 'docs' },
    { id: 'src-lib', kind: 'contains', fromNodeId: 'src', toNodeId: 'lib' },
    { id: 'src-main', kind: 'contains', fromNodeId: 'src', toNodeId: 'main' },
  ],
};

test('buildSelectionIndex indexes nodes, edges, incident edges, adjacency, and node pairs', () => {
  const index = buildSelectionIndex(graph);

  assert.equal(index.nodeById.get('src')?.path, 'src');
  assert.equal(index.edgeById.get('src-lib')?.toNodeId, 'lib');
  assert.deepEqual(index.incidentEdgeIdsByNodeId.get('src'), ['repo-src', 'src-lib', 'src-main']);
  assert.deepEqual(index.adjacentNodeIdsByNodeId.get('src'), ['lib', 'main', 'repo']);
  assert.deepEqual(index.edgeIdsByNodePair.get('lib\0src'), ['src-lib']);
});

test('buildSelectionIndex excludes hidden edges from neighborhoods and distance', () => {
  const relationGraph: RenderGraph = {
    ...graph,
    edges: [
      ...graph.edges,
      {
        id: 'main-imports-lib',
        kind: 'imports',
        fromNodeId: 'main',
        toNodeId: 'lib',
        visibleAtDetails: ['imports'],
      },
    ],
  };
  const index = buildSelectionIndex(relationGraph, {
    visibleEdgeIds: ['repo-src', 'repo-docs', 'src-lib', 'src-main'],
  });

  assert.equal(index.edgeById.has('main-imports-lib'), false);
  assert.deepEqual(selectionNeighborhood(index, 'main'), {
    highlightedNodeIds: ['main', 'src'],
    highlightedEdgeIds: ['src-main'],
    labeledNodeIds: ['main', 'src', 'lib', 'repo'],
    firstLevelNodeIds: ['src'],
    secondLevelNodeIds: ['lib', 'repo'],
  });
  assert.equal(selectionDistanceByNodeId(index, 'main').get('lib'), 2);
});

test('selectionNeighborhood resolves bidirectional first and second level node sets', () => {
  const index = buildSelectionIndex(graph);

  assert.deepEqual(selectionNeighborhood(index, 'src'), {
    highlightedNodeIds: ['src', 'lib', 'main', 'repo'],
    highlightedEdgeIds: ['repo-src', 'src-lib', 'src-main'],
    labeledNodeIds: ['src', 'lib', 'main', 'repo', 'docs'],
    firstLevelNodeIds: ['lib', 'main', 'repo'],
    secondLevelNodeIds: ['docs'],
  });
});

test('selectionDistanceByNodeId resolves graph distance from the selected node', () => {
  const index = buildSelectionIndex(graph);

  assert.deepEqual([...selectionDistanceByNodeId(index, 'src').entries()].sort(), [
    ['docs', 2],
    ['lib', 1],
    ['main', 1],
    ['repo', 1],
    ['src', 0],
  ]);
});

test('selectionDistanceByNodeId returns an empty map for null or unknown nodes', () => {
  const index = buildSelectionIndex(graph);

  assert.deepEqual([...selectionDistanceByNodeId(index, null).entries()], []);
  assert.deepEqual([...selectionDistanceByNodeId(index, 'missing').entries()], []);
});

test('selectionNeighborhood returns empty sets for null or unknown nodes', () => {
  const index = buildSelectionIndex(graph);
  const emptyNeighborhood = {
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    labeledNodeIds: [],
    firstLevelNodeIds: [],
    secondLevelNodeIds: [],
  };

  assert.deepEqual(selectionNeighborhood(index, null), emptyNeighborhood);
  assert.deepEqual(selectionNeighborhood(index, 'missing'), emptyNeighborhood);
});

test('diffSelectionState reports only entered and exited selected graph IDs', () => {
  const index = buildSelectionIndex(graph);
  const previous = selectionStateForNode(index, 'src');
  const next = selectionStateForNode(index, 'lib');

  assert.deepEqual(diffSelectionState(previous, next), {
    enteredHighlightedNodeIds: [],
    exitedHighlightedNodeIds: ['main', 'repo'],
    enteredHighlightedEdgeIds: [],
    exitedHighlightedEdgeIds: ['repo-src', 'src-main'],
    enteredLabeledNodeIds: [],
    exitedLabeledNodeIds: ['docs'],
  });
});

test('diffSelectionState reports none-to-node and unchanged state transitions', () => {
  const index = buildSelectionIndex(graph);
  const next = selectionStateForNode(index, 'docs');

  assert.deepEqual(diffSelectionState(emptySelectionState(), next), {
    enteredHighlightedNodeIds: ['docs', 'repo'],
    exitedHighlightedNodeIds: [],
    enteredHighlightedEdgeIds: ['repo-docs'],
    exitedHighlightedEdgeIds: [],
    enteredLabeledNodeIds: ['docs', 'repo', 'src'],
    exitedLabeledNodeIds: [],
  });

  assert.deepEqual(diffSelectionState(next, next), {
    enteredHighlightedNodeIds: [],
    exitedHighlightedNodeIds: [],
    enteredHighlightedEdgeIds: [],
    exitedHighlightedEdgeIds: [],
    enteredLabeledNodeIds: [],
    exitedLabeledNodeIds: [],
  });
});
