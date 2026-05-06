import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { LayoutResult, RenderGraph } from './types';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { layoutLayeredGrid, layoutRadialTree } = (await import(
  new URL('./layouts.ts', import.meta.url).href
)) as typeof import('./layouts');

const sampleGraph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    {
      id: 'repo',
      kind: 'repo',
      name: 'repo',
      path: '',
      childIds: ['src', 'readme'],
    },
    {
      id: 'readme',
      kind: 'file',
      name: 'README.md',
      path: 'README.md',
      parentId: 'repo',
      childIds: [],
    },
    {
      id: 'src',
      kind: 'directory',
      name: 'src',
      path: 'src',
      parentId: 'repo',
      childIds: ['main', 'lib'],
    },
    {
      id: 'main',
      kind: 'file',
      name: 'main.ts',
      path: 'src/main.ts',
      parentId: 'src',
      childIds: [],
    },
    {
      id: 'lib',
      kind: 'directory',
      name: 'lib',
      path: 'src/lib',
      parentId: 'src',
      childIds: [],
    },
  ],
  edges: [
    { id: 'repo-src', kind: 'tree', fromNodeId: 'repo', toNodeId: 'src' },
    { id: 'repo-readme', kind: 'tree', fromNodeId: 'repo', toNodeId: 'readme' },
    { id: 'src-main', kind: 'tree', fromNodeId: 'src', toNodeId: 'main' },
    { id: 'src-lib', kind: 'tree', fromNodeId: 'src', toNodeId: 'lib' },
  ],
};

test('radial layout is deterministic for the same graph and options', () => {
  assert.deepEqual(serializeLayout(layoutRadialTree(sampleGraph)), serializeLayout(layoutRadialTree(sampleGraph)));
});

test('layered grid layout is deterministic for the same graph and options', () => {
  assert.deepEqual(
    serializeLayout(layoutLayeredGrid(sampleGraph, { gridColumns: 2 })),
    serializeLayout(layoutLayeredGrid(sampleGraph, { gridColumns: 2 })),
  );
});

test('layouts sort directories before files at the same depth', () => {
  const layout = layoutLayeredGrid(sampleGraph, { gridColumns: 4 });

  assert.equal(layout.positions.get('src')?.order, 0);
  assert.equal(layout.positions.get('readme')?.order, 1);
  assert.equal(layout.positions.get('lib')?.order, 0);
  assert.equal(layout.positions.get('main')?.order, 1);
});

test('layouts place root at the origin', () => {
  assert.deepEqual(layoutRadialTree(sampleGraph).positions.get('repo')?.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(layoutLayeredGrid(sampleGraph).positions.get('repo')?.position, { x: 0, y: 0, z: 0 });
});

function serializeLayout(layout: LayoutResult): readonly unknown[] {
  return [...layout.positions.values()].map((position) => ({
    nodeId: position.nodeId,
    depth: position.depth,
    order: position.order,
    radius: position.radius,
    position: position.position,
  }));
}
