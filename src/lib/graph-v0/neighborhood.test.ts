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

const { graphNeighborhood } = (await import(
  new URL('./neighborhood.ts', import.meta.url).href
)) as typeof import('./neighborhood');

const graph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    { id: 'repo', kind: 'repo', name: 'repo', path: '.', childIds: ['src'] },
    { id: 'src', kind: 'directory', name: 'src', path: 'src', childIds: ['lib', 'main'] },
    { id: 'lib', kind: 'file', name: 'lib.rs', path: 'src/lib.rs', childIds: [] },
    { id: 'main', kind: 'file', name: 'main.rs', path: 'src/main.rs', childIds: [] },
    { id: 'docs', kind: 'directory', name: 'docs', path: 'docs', childIds: [] },
  ],
  edges: [
    { id: 'repo-src', kind: 'tree', fromNodeId: 'repo', toNodeId: 'src' },
    { id: 'repo-docs', kind: 'tree', fromNodeId: 'repo', toNodeId: 'docs' },
    { id: 'src-lib', kind: 'tree', fromNodeId: 'src', toNodeId: 'lib' },
    { id: 'src-main', kind: 'tree', fromNodeId: 'src', toNodeId: 'main' },
  ],
};

test('graphNeighborhood highlights selected node immediate edges and two label levels', () => {
  assert.deepEqual(graphNeighborhood(graph, 'src'), {
    highlightedNodeIds: ['src', 'lib', 'main', 'repo', 'docs'],
    highlightedEdgeIds: ['repo-src', 'src-lib', 'src-main'],
    labeledNodeIds: ['src', 'lib', 'main', 'repo', 'docs'],
    firstLevelNodeIds: ['lib', 'main', 'repo'],
    secondLevelNodeIds: ['docs'],
  });
});

test('graphNeighborhood returns empty sets without a selected node', () => {
  assert.deepEqual(graphNeighborhood(graph, null), {
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    labeledNodeIds: [],
    firstLevelNodeIds: [],
    secondLevelNodeIds: [],
  });
});
