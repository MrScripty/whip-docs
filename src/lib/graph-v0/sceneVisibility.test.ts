import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { RenderGraphNode } from './types';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { shouldRenderSceneEdge } = (await import(
  new URL('./sceneVisibility.ts', import.meta.url).href
)) as typeof import('./sceneVisibility');

const nodeById = new Map<string, RenderGraphNode>([
  ['repo', { id: 'repo', kind: 'repo', name: 'repo', path: '.', childIds: ['src'] }],
  ['src', { id: 'src', kind: 'directory', name: 'src', path: 'src', parentId: 'repo', childIds: ['main'] }],
  ['main', { id: 'main', kind: 'file', name: 'main.rs', path: 'src/main.rs', parentId: 'src', childIds: [] }],
  ['lib', { id: 'lib', kind: 'file', name: 'lib.rs', path: 'src/lib.rs', parentId: 'src', childIds: [] }],
]);

test('shouldRenderSceneEdge keeps directory containment edges visible', () => {
  assert.equal(
    shouldRenderSceneEdge(
      { id: 'repo-src', kind: 'contains', fromNodeId: 'repo', toNodeId: 'src' },
      nodeById,
    ),
    true,
  );
});

test('shouldRenderSceneEdge hides file containment edges', () => {
  assert.equal(
    shouldRenderSceneEdge(
      { id: 'src-main', kind: 'contains', fromNodeId: 'src', toNodeId: 'main' },
      nodeById,
    ),
    false,
  );
});

test('shouldRenderSceneEdge keeps file relation edges visible', () => {
  assert.equal(
    shouldRenderSceneEdge(
      { id: 'main-imports-lib', kind: 'imports', fromNodeId: 'main', toNodeId: 'lib' },
      nodeById,
    ),
    true,
  );
});
