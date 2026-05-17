import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { RenderGraph, RenderGraphEdge } from './types';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { isEdgeVisibleAtRelationDetails, visibleEdgeIdsForRelationDetails } = (await import(
  new URL('./relationVisibility.ts', import.meta.url).href
)) as typeof import('./relationVisibility');

const graph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    { id: 'repo', kind: 'repo', name: 'repo', path: '.', childIds: ['src'] },
    { id: 'src', kind: 'directory', name: 'src', path: 'src', parentId: 'repo', childIds: ['main', 'lib'] },
    { id: 'main', kind: 'file', name: 'main.rs', path: 'src/main.rs', parentId: 'src', childIds: [] },
    { id: 'lib', kind: 'file', name: 'lib.rs', path: 'src/lib.rs', parentId: 'src', childIds: [] },
  ],
  edges: [
    { id: 'repo-src', kind: 'contains', fromNodeId: 'repo', toNodeId: 'src' },
    {
      id: 'main-imports-lib',
      kind: 'imports',
      fromNodeId: 'main',
      toNodeId: 'lib',
      visibleAtDetails: ['imports'],
    },
    {
      id: 'main-calls-lib',
      kind: 'calls',
      fromNodeId: 'main',
      toNodeId: 'lib',
      visibleAtDetails: ['calls'],
    },
    {
      id: 'main-borrows-lib',
      kind: 'borrows_data',
      fromNodeId: 'main',
      toNodeId: 'lib',
      visibleAtDetails: ['data'],
    },
  ],
};

test('visibleEdgeIdsForRelationDetails maps selected detail categories to edge IDs', () => {
  assert.deepEqual([...visibleEdgeIdsForRelationDetails(graph, ['structure', 'imports'])].sort(), [
    'main-imports-lib',
    'repo-src',
  ]);
});

test('visibleEdgeIdsForRelationDetails accepts detail sets', () => {
  assert.deepEqual([...visibleEdgeIdsForRelationDetails(graph, new Set(['calls', 'data']))].sort(), [
    'main-borrows-lib',
    'main-calls-lib',
  ]);
});

test('isEdgeVisibleAtRelationDetails defaults containment edges to structure', () => {
  const edge = { id: 'src-main', kind: 'contains', fromNodeId: 'src', toNodeId: 'main' } satisfies RenderGraphEdge;

  assert.equal(isEdgeVisibleAtRelationDetails(edge, new Set(['structure'])), true);
  assert.equal(isEdgeVisibleAtRelationDetails(edge, new Set(['imports'])), false);
});
