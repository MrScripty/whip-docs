import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { LayoutNodePosition, LayoutResult, RenderGraph } from './types';

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

test('radial layout places child groups on local parent radii', () => {
  const layout = layoutRadialTree(branchingGraph, { depthSpacing: 10 });
  const srcToLib = horizontalDistanceBetween(layout, 'src', 'lib');
  const srcToMain = horizontalDistanceBetween(layout, 'src', 'main');
  const srcRadius = radiusForNode(layout, 'src');

  assert.equal(round(srcToLib), round(srcToMain));
  assert.ok(srcToLib < srcRadius);
  assert.ok(Math.abs(yForNode(layout, 'lib') - yForNode(layout, 'main')) > 0);
});

test('radial layout places child groups on parent-local circles instead of fan arcs', () => {
  const layout = layoutRadialTree(branchingGraph, { depthSpacing: 10 });

  assert.equal(round(angleBetweenChildren(layout, 'src', 'lib', 'main')), round(Math.PI));
  assert.equal(round(angleBetweenChildren(layout, 'docs', 'api', 'guide')), round(Math.PI));
});

test('radial branch radius grows to fit wide local child groups', () => {
  const layout = layoutRadialTree(wideBranchGraph);
  const narrowRadius = horizontalDistanceBetween(layout, 'narrow', 'single');
  const wideRadii = childIds('wide-child', 16).map((nodeId) => horizontalDistanceBetween(layout, 'wide', nodeId));
  const uniqueWideRadii = new Set(wideRadii.map(round));

  assert.ok(uniqueWideRadii.size > 1);
  assert.ok(Math.max(...wideRadii) > narrowRadius);
  assert.ok(Math.max(...wideRadii) < 80);
});

test('radial branch spacing option separates sibling branch footprints', () => {
  const compact = layoutRadialTree(wideBranchGraph, { siblingSpacing: 4 });
  const expanded = layoutRadialTree(wideBranchGraph, { siblingSpacing: 20 });

  assert.ok(
    horizontalDistanceBetween(expanded, 'wide', 'narrow') >
      horizontalDistanceBetween(compact, 'wide', 'narrow'),
  );
});

test('radial layout separates adjacent sibling branch descendant footprints', () => {
  const layout = layoutRadialTree(adjacentWideBranchGraph, { siblingSpacing: 10 });
  const leftBranchRadius = maxHorizontalDistanceFrom(layout, 'alpha', childIds('alpha-child', 18));
  const rightBranchRadius = maxHorizontalDistanceFrom(layout, 'beta', childIds('beta-child', 18));
  const branchOriginDistance = horizontalDistanceBetween(layout, 'alpha', 'beta');

  assert.ok(branchOriginDistance >= leftBranchRadius + rightBranchRadius + 10);
});

test('radial layout does not propagate nested branch footprint into every ancestor ring', () => {
  const layout = layoutRadialTree(deepWideBranchGraph, { siblingSpacing: 10 });
  const nestedBranchDistance = horizontalDistanceBetween(layout, 'alpha', 'beta');

  assert.ok(nestedBranchDistance < 120);
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

test('layered grid uses z rows for local branch grids', () => {
  const layout = layoutLayeredGrid(wideBranchGraph);
  const zValues = childIds('wide-child', 16).map((nodeId) => zForNode(layout, nodeId));
  const uniqueZValues = new Set(zValues.map(round));

  assert.ok(uniqueZValues.size > 1);
  assert.ok(zValues.some((z) => z !== 0));
});

test('layered grid branch spacing option separates sibling branch footprints', () => {
  const compact = layoutLayeredGrid(wideBranchGraph, { siblingSpacing: 4 });
  const expanded = layoutLayeredGrid(wideBranchGraph, { siblingSpacing: 20 });

  assert.ok(
    horizontalDistanceBetween(expanded, 'wide', 'narrow') >
      horizontalDistanceBetween(compact, 'wide', 'narrow'),
  );
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

const wideBranchGraph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    {
      id: 'repo',
      kind: 'repo',
      name: 'repo',
      path: '',
      childIds: ['wide', 'narrow'],
    },
    {
      id: 'wide',
      kind: 'directory',
      name: 'wide',
      path: 'wide',
      parentId: 'repo',
      childIds: childIds('wide-child', 16),
    },
    {
      id: 'narrow',
      kind: 'directory',
      name: 'narrow',
      path: 'narrow',
      parentId: 'repo',
      childIds: ['single'],
    },
    {
      id: 'single',
      kind: 'file',
      name: 'single',
      path: 'narrow/single',
      parentId: 'narrow',
      childIds: [],
    },
    ...childIds('wide-child', 16).map((id) => ({
      id,
      kind: 'file' as const,
      name: id,
      path: `wide/${id}`,
      parentId: 'wide',
      childIds: [],
    })),
  ],
  edges: [
    { id: 'repo-wide', kind: 'tree', fromNodeId: 'repo', toNodeId: 'wide' },
    { id: 'repo-narrow', kind: 'tree', fromNodeId: 'repo', toNodeId: 'narrow' },
    { id: 'narrow-single', kind: 'tree', fromNodeId: 'narrow', toNodeId: 'single' },
    ...childIds('wide-child', 16).map((id) => ({
      id: `wide-${id}`,
      kind: 'tree' as const,
      fromNodeId: 'wide',
      toNodeId: id,
    })),
  ],
};

const adjacentWideBranchGraph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    {
      id: 'repo',
      kind: 'repo',
      name: 'repo',
      path: '',
      childIds: ['alpha', 'beta', 'gamma'],
    },
    {
      id: 'alpha',
      kind: 'directory',
      name: 'alpha',
      path: 'alpha',
      parentId: 'repo',
      childIds: childIds('alpha-child', 18),
    },
    {
      id: 'beta',
      kind: 'directory',
      name: 'beta',
      path: 'beta',
      parentId: 'repo',
      childIds: childIds('beta-child', 18),
    },
    {
      id: 'gamma',
      kind: 'directory',
      name: 'gamma',
      path: 'gamma',
      parentId: 'repo',
      childIds: ['gamma-child'],
    },
    {
      id: 'gamma-child',
      kind: 'file',
      name: 'gamma-child',
      path: 'gamma/gamma-child',
      parentId: 'gamma',
      childIds: [],
    },
    ...childIds('alpha-child', 18).map((id) => ({
      id,
      kind: 'file' as const,
      name: id,
      path: `alpha/${id}`,
      parentId: 'alpha',
      childIds: [],
    })),
    ...childIds('beta-child', 18).map((id) => ({
      id,
      kind: 'file' as const,
      name: id,
      path: `beta/${id}`,
      parentId: 'beta',
      childIds: [],
    })),
  ],
  edges: [
    { id: 'repo-alpha', kind: 'tree', fromNodeId: 'repo', toNodeId: 'alpha' },
    { id: 'repo-beta', kind: 'tree', fromNodeId: 'repo', toNodeId: 'beta' },
    { id: 'repo-gamma', kind: 'tree', fromNodeId: 'repo', toNodeId: 'gamma' },
    { id: 'gamma-child', kind: 'tree', fromNodeId: 'gamma', toNodeId: 'gamma-child' },
    ...childIds('alpha-child', 18).map((id) => ({
      id: `alpha-${id}`,
      kind: 'tree' as const,
      fromNodeId: 'alpha',
      toNodeId: id,
    })),
    ...childIds('beta-child', 18).map((id) => ({
      id: `beta-${id}`,
      kind: 'tree' as const,
      fromNodeId: 'beta',
      toNodeId: id,
    })),
  ],
};

const deepWideBranchGraph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    {
      id: 'repo',
      kind: 'repo',
      name: 'repo',
      path: '',
      childIds: ['alpha', 'beta', 'gamma'],
    },
    {
      id: 'alpha',
      kind: 'directory',
      name: 'alpha',
      path: 'alpha',
      parentId: 'repo',
      childIds: childIds('alpha-dir', 12),
    },
    {
      id: 'beta',
      kind: 'directory',
      name: 'beta',
      path: 'beta',
      parentId: 'repo',
      childIds: childIds('beta-dir', 12),
    },
    {
      id: 'gamma',
      kind: 'directory',
      name: 'gamma',
      path: 'gamma',
      parentId: 'repo',
      childIds: [],
    },
    ...nestedDirectoryNodes('alpha-dir', 'alpha-file', 'alpha'),
    ...nestedDirectoryNodes('beta-dir', 'beta-file', 'beta'),
  ],
  edges: [
    { id: 'repo-alpha', kind: 'tree', fromNodeId: 'repo', toNodeId: 'alpha' },
    { id: 'repo-beta', kind: 'tree', fromNodeId: 'repo', toNodeId: 'beta' },
    { id: 'repo-gamma', kind: 'tree', fromNodeId: 'repo', toNodeId: 'gamma' },
    ...nestedDirectoryEdges('alpha-dir', 'alpha-file', 'alpha'),
    ...nestedDirectoryEdges('beta-dir', 'beta-file', 'beta'),
  ],
};

function childIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index.toString().padStart(2, '0')}`);
}

function nestedDirectoryNodes(
  directoryPrefix: string,
  filePrefix: string,
  parentId: string,
): RenderGraph['nodes'] {
  return childIds(directoryPrefix, 12).flatMap((directoryId) => [
    {
      id: directoryId,
      kind: 'directory' as const,
      name: directoryId,
      path: `${parentId}/${directoryId}`,
      parentId,
      childIds: childIds(`${filePrefix}-${directoryId}`, 12),
    },
    ...childIds(`${filePrefix}-${directoryId}`, 12).map((fileId) => ({
      id: fileId,
      kind: 'file' as const,
      name: fileId,
      path: `${parentId}/${directoryId}/${fileId}`,
      parentId: directoryId,
      childIds: [],
    })),
  ]);
}

function nestedDirectoryEdges(
  directoryPrefix: string,
  filePrefix: string,
  parentId: string,
): RenderGraph['edges'] {
  return childIds(directoryPrefix, 12).flatMap((directoryId) => [
    {
      id: `${parentId}-${directoryId}`,
      kind: 'tree' as const,
      fromNodeId: parentId,
      toNodeId: directoryId,
    },
    ...childIds(`${filePrefix}-${directoryId}`, 12).map((fileId) => ({
      id: `${directoryId}-${fileId}`,
      kind: 'tree' as const,
      fromNodeId: directoryId,
      toNodeId: fileId,
    })),
  ]);
}

function horizontalDistanceBetween(layout: LayoutResult, firstNodeId: string, secondNodeId: string): number {
  const firstPosition = positionForNode(layout, firstNodeId);
  const secondPosition = positionForNode(layout, secondNodeId);
  const deltaX = firstPosition.x - secondPosition.x;
  const deltaZ = firstPosition.z - secondPosition.z;

  return Math.hypot(deltaX, deltaZ);
}

function maxHorizontalDistanceFrom(
  layout: LayoutResult,
  originNodeId: string,
  targetNodeIds: readonly string[],
): number {
  return Math.max(
    ...targetNodeIds.map((targetNodeId) => horizontalDistanceBetween(layout, originNodeId, targetNodeId)),
  );
}

function positionForNode(layout: LayoutResult, nodeId: string): LayoutNodePosition['position'] {
  const position = layout.positions.get(nodeId)?.position;

  if (!position) {
    throw new Error(`Missing layout position for ${nodeId}`);
  }

  return position;
}

function angleBetweenChildren(
  layout: LayoutResult,
  parentNodeId: string,
  firstChildId: string,
  secondChildId: string,
): number {
  const parent = positionForNode(layout, parentNodeId);
  const first = positionForNode(layout, firstChildId);
  const second = positionForNode(layout, secondChildId);
  const firstVector = { x: first.x - parent.x, z: first.z - parent.z };
  const secondVector = { x: second.x - parent.x, z: second.z - parent.z };
  const dot = firstVector.x * secondVector.x + firstVector.z * secondVector.z;
  const firstLength = Math.hypot(firstVector.x, firstVector.z);
  const secondLength = Math.hypot(secondVector.x, secondVector.z);

  return Math.acos(dot / (firstLength * secondLength));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function xForNode(layout: LayoutResult, nodeId: string): number {
  const position = layout.positions.get(nodeId)?.position;

  if (!position) {
    throw new Error(`Missing layout position for ${nodeId}`);
  }

  return position.x;
}

function zForNode(layout: LayoutResult, nodeId: string): number {
  return positionForNode(layout, nodeId).z;
}

function yForNode(layout: LayoutResult, nodeId: string): number {
  return positionForNode(layout, nodeId).y;
}

function radiusForNode(layout: LayoutResult, nodeId: string): number {
  const radius = layout.positions.get(nodeId)?.radius;

  if (radius === undefined) {
    throw new Error(`Missing layout radius for ${nodeId}`);
  }

  return radius;
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function rangesDoNotOverlap(left: readonly number[], right: readonly number[]): boolean {
  return Math.max(...left) < Math.min(...right) || Math.max(...right) < Math.min(...left);
}
