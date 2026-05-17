import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type {
  DirectoryGraphSnapshotDto,
  FileRelationGraphSnapshotDto,
} from '../../backends/TauriArchitectureBackend.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { directorySnapshotToRenderGraph, fileRelationSnapshotToRenderGraph } = (await import(
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
        kind: 'contains',
        fromNodeId: 'repo:.',
        toNodeId: 'dir:src',
      },
    ],
  });
});

test('fileRelationSnapshotToRenderGraph preserves cross-file relation metadata', () => {
  const snapshot: FileRelationGraphSnapshotDto = {
    schemaVersion: 1,
    sourceRoot: '/repo',
    generatedAt: 'unix:1',
    rootNodeId: 'repo:.',
    nodes: [
      {
        id: 'repo:.',
        kind: 'repo',
        name: 'repo',
        path: '.',
        parentId: null,
        childIds: ['dir:src'],
        language: null,
      },
      {
        id: 'dir:src',
        kind: 'directory',
        name: 'src',
        path: 'src',
        parentId: 'repo:.',
        childIds: ['file:src/main.rs', 'file:src/lib.rs'],
        language: null,
      },
      {
        id: 'file:src/main.rs',
        kind: 'file',
        name: 'main.rs',
        path: 'src/main.rs',
        parentId: 'dir:src',
        childIds: [],
        language: 'rust',
      },
      {
        id: 'file:src/lib.rs',
        kind: 'file',
        name: 'lib.rs',
        path: 'src/lib.rs',
        parentId: 'dir:src',
        childIds: [],
        language: 'rust',
      },
    ],
    edges: [
      {
        id: 'imports:file:src/main.rs:file:src/lib.rs',
        kind: 'imports',
        fromNodeId: 'file:src/main.rs',
        toNodeId: 'file:src/lib.rs',
        weight: 3,
        direction: 'directed',
        confidence: 'exact',
        provenance: 'syn',
        evidenceCount: 3,
        evidenceSample: [
          {
            kind: 'import',
            sourceRange: {
              path: 'src/main.rs',
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 15,
            },
            targetRange: null,
            sourceLabel: 'use crate::lib',
            targetLabel: 'lib',
            access: null,
            analyzer: 'syn',
          },
        ],
      },
    ],
    analyzers: [{ analyzer: 'syn', language: 'rust', version: null }],
    diagnostics: [],
  };

  assert.deepEqual(fileRelationSnapshotToRenderGraph(snapshot), {
    rootNodeId: 'repo:.',
    nodes: [
      {
        id: 'repo:.',
        kind: 'repo',
        name: 'repo',
        path: '.',
        parentId: undefined,
        childIds: ['dir:src'],
        language: undefined,
      },
      {
        id: 'dir:src',
        kind: 'directory',
        name: 'src',
        path: 'src',
        parentId: 'repo:.',
        childIds: ['file:src/main.rs', 'file:src/lib.rs'],
        language: undefined,
      },
      {
        id: 'file:src/main.rs',
        kind: 'file',
        name: 'main.rs',
        path: 'src/main.rs',
        parentId: 'dir:src',
        childIds: [],
        language: 'rust',
      },
      {
        id: 'file:src/lib.rs',
        kind: 'file',
        name: 'lib.rs',
        path: 'src/lib.rs',
        parentId: 'dir:src',
        childIds: [],
        language: 'rust',
      },
    ],
    edges: [
      {
        id: 'imports:file:src/main.rs:file:src/lib.rs',
        kind: 'imports',
        fromNodeId: 'file:src/main.rs',
        toNodeId: 'file:src/lib.rs',
        weight: 3,
        direction: 'directed',
        confidence: 'exact',
        provenance: 'syn',
        evidenceCount: 3,
        visibleAtDetails: ['imports'],
      },
    ],
  });
});
