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

test('radial layout keeps descendants inside their parent branch sector', () => {
  const layout = layoutRadialTree(branchingGraph);
  const srcAngle = angleForNode(layout, 'src');
  const docsAngle = angleForNode(layout, 'docs');
  const srcChildAngles = ['lib', 'main'].map((nodeId) => angleForNode(layout, nodeId));
  const docsChildAngles = ['guide', 'api'].map((nodeId) => angleForNode(layout, nodeId));

  assert.ok(srcChildAngles.every((angle) => circularDistance(angle, srcAngle) < circularDistance(angle, docsAngle)));
  assert.ok(docsChildAngles.every((angle) => circularDistance(angle, docsAngle) < circularDistance(angle, srcAngle)));
});

test('layered grid centers parents over their descendant branch spans', () => {
  const layout = layoutLayeredGrid(branchingGraph);
  const srcX = xForNode(layout, 'src');
  const docsX = xForNode(layout, 'docs');
  const srcChildXs = ['lib', 'main'].map((nodeId) => xForNode(layout, nodeId));
  const docsChildXs = ['guide', 'api'].map((nodeId) => xForNode(layout, nodeId));

  assert.equal(srcX, average(srcChildXs));
  assert.equal(docsX, average(docsChildXs));
  assert.ok(rangesDoNotOverlap(srcChildXs, docsChildXs));
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

const branchingGraph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    {
      id: 'repo',
      kind: 'repo',
      name: 'repo',
      path: '',
      childIds: ['src', 'docs'],
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
      id: 'docs',
      kind: 'directory',
      name: 'docs',
      path: 'docs',
      parentId: 'repo',
      childIds: ['api', 'guide'],
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
      kind: 'file',
      name: 'lib.ts',
      path: 'src/lib.ts',
      parentId: 'src',
      childIds: [],
    },
    {
      id: 'api',
      kind: 'file',
      name: 'api.md',
      path: 'docs/api.md',
      parentId: 'docs',
      childIds: [],
    },
    {
      id: 'guide',
      kind: 'file',
      name: 'guide.md',
      path: 'docs/guide.md',
      parentId: 'docs',
      childIds: [],
    },
  ],
  edges: [
    { id: 'repo-src', kind: 'tree', fromNodeId: 'repo', toNodeId: 'src' },
    { id: 'repo-docs', kind: 'tree', fromNodeId: 'repo', toNodeId: 'docs' },
    { id: 'src-main', kind: 'tree', fromNodeId: 'src', toNodeId: 'main' },
    { id: 'src-lib', kind: 'tree', fromNodeId: 'src', toNodeId: 'lib' },
    { id: 'docs-api', kind: 'tree', fromNodeId: 'docs', toNodeId: 'api' },
    { id: 'docs-guide', kind: 'tree', fromNodeId: 'docs', toNodeId: 'guide' },
  ],
};

function angleForNode(layout: LayoutResult, nodeId: string): number {
  const position = layout.positions.get(nodeId)?.position;

  if (!position) {
    throw new Error(`Missing layout position for ${nodeId}`);
  }

  return Math.atan2(position.z, position.x);
}

function circularDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(distance, Math.PI * 2 - distance);
}

function xForNode(layout: LayoutResult, nodeId: string): number {
  const position = layout.positions.get(nodeId)?.position;

  if (!position) {
    throw new Error(`Missing layout position for ${nodeId}`);
  }

  return position.x;
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function rangesDoNotOverlap(left: readonly number[], right: readonly number[]): boolean {
  return Math.max(...left) < Math.min(...right) || Math.max(...right) < Math.min(...left);
}
