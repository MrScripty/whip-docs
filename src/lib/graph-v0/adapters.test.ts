import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { DirectoryGraphSnapshotDto } from '../../backends/TauriArchitectureBackend.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { directorySnapshotToRenderGraph } = (await import(
  new URL('./adapters.ts', import.meta.url).href
)) as typeof import('./adapters');

test('directorySnapshotToRenderGraph preserves backend graph identity', () => {
  const snapshot: DirectoryGraphSnapshotDto = {
    schemaVersion: 1,
    rootNodeId: 'repo:.',
    nodes: [
      {
        id: 'repo:.',
        kind: 'repo',
        name: 'repo',
        path: '.',
        parentId: null,
        childIds: ['dir:src'],
        expanded: true,
      },
      {
        id: 'dir:src',
        kind: 'directory',
        name: 'src',
        path: 'src',
        parentId: 'repo:.',
        childIds: [],
        expanded: false,
      },
    ],
    edges: [
      {
        id: 'tree:repo:.:dir:src',
        kind: 'tree',
        fromNodeId: 'repo:.',
        toNodeId: 'dir:src',
      },
    ],
    excludedPathCount: 0,
  };

  assert.deepEqual(directorySnapshotToRenderGraph(snapshot), {
    rootNodeId: 'repo:.',
    nodes: [
      {
        id: 'repo:.',
        kind: 'repo',
        name: 'repo',
        path: '.',
        parentId: undefined,
        childIds: ['dir:src'],
      },
      {
        id: 'dir:src',
        kind: 'directory',
        name: 'src',
        path: 'src',
        parentId: 'repo:.',
        childIds: [],
      },
    ],
    edges: [
      {
        id: 'tree:repo:.:dir:src',
        kind: 'tree',
        fromNodeId: 'repo:.',
        toNodeId: 'dir:src',
      },
    ],
  });
});
