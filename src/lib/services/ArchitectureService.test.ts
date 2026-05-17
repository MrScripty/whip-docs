import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DirectoryGraphSnapshotDto,
  FileRelationGraphSnapshotDto,
} from '../../backends/TauriArchitectureBackend.ts';
import { ArchitectureService, commandErrorMessage } from './ArchitectureService.ts';

test('commandErrorMessage preserves backend validation message', () => {
  const message = commandErrorMessage({
    code: 'validation_error',
    message: 'source repository path cannot contain parent traversal',
    recoverable: true,
  });

  assert.equal(message, 'source repository path cannot contain parent traversal');
});

test('commandErrorMessage handles unknown transport failure', () => {
  assert.equal(commandErrorMessage({}), 'Request failed');
});

test('loadDirectoryGraph trims the path before delegating to backend', async () => {
  const calls: string[] = [];
  const snapshot: DirectoryGraphSnapshotDto = {
    schemaVersion: 1,
    rootNodeId: 'repo:.',
    nodes: [],
    edges: [],
    excludedPathCount: 0,
  };
  const backend = {
    loadDirectoryGraph(path: string): Promise<DirectoryGraphSnapshotDto> {
      calls.push(path);
      return Promise.resolve(snapshot);
    },
  };
  const service = new ArchitectureService(backend as never);

  const result = await service.loadDirectoryGraph('  /tmp/example  ');

  assert.equal(result, snapshot);
  assert.deepEqual(calls, ['/tmp/example']);
});

test('loadFileRelationGraph trims the path before delegating to backend', async () => {
  const calls: string[] = [];
  const snapshot: FileRelationGraphSnapshotDto = {
    schemaVersion: 1,
    sourceRoot: '/tmp/example',
    generatedAt: 'unix:1',
    rootNodeId: 'repo:.',
    nodes: [],
    edges: [],
    analyzers: [],
    diagnostics: [],
  };
  const backend = {
    loadFileRelationGraph(path: string): Promise<FileRelationGraphSnapshotDto> {
      calls.push(path);
      return Promise.resolve(snapshot);
    },
  };
  const service = new ArchitectureService(backend as never);

  const result = await service.loadFileRelationGraph('  /tmp/example  ');

  assert.equal(result, snapshot);
  assert.deepEqual(calls, ['/tmp/example']);
});
