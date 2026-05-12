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

const {
  layoutLayeredGrid,
  layoutRadialTree,
  layoutSafeRadialTree,
  layoutWeightedSafeRadialTree,
} = (await import(
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

test('safe radial layout is deterministic for the same graph and options', () => {
  assert.deepEqual(
    serializeLayout(layoutSafeRadialTree(sampleGraph)),
    serializeLayout(layoutSafeRadialTree(sampleGraph)),
  );
});

test('weighted safe radial layout is deterministic for the same graph and options', () => {
  assert.deepEqual(
    serializeLayout(layoutWeightedSafeRadialTree(sampleGraph)),
    serializeLayout(layoutWeightedSafeRadialTree(sampleGraph)),
  );
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
  assert.deepEqual(layoutSafeRadialTree(sampleGraph).positions.get('repo')?.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(layoutWeightedSafeRadialTree(sampleGraph).positions.get('repo')?.position, { x: 0, y: 0, z: 0 });
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

test('radial level spacing option separates parent and child levels vertically', () => {
  const compact = layoutRadialTree(sampleGraph, { layerSpacing: 4 });
  const expanded = layoutRadialTree(sampleGraph, { layerSpacing: 20 });

  assert.ok(verticalDistanceBetween(expanded, 'repo', 'src') > verticalDistanceBetween(compact, 'repo', 'src'));
  assert.ok(verticalDistanceBetween(expanded, 'repo', 'lib') > verticalDistanceBetween(expanded, 'repo', 'src'));
});

test('radial root level spacing separates root children from deeper levels', () => {
  const layout = layoutRadialTree(sampleGraph, { layerSpacing: 20, rootLayerSpacing: 50 });

  assert.equal(verticalDistanceBetween(layout, 'repo', 'src'), 50);
  assert.equal(verticalDistanceBetween(layout, 'src', 'lib'), 20);
});

test('radial layout stacks a single subdirectory directly under its parent', () => {
  const layout = layoutRadialTree(sampleGraph, { layerSpacing: 20 });
  const repo = positionForNode(layout, 'repo');
  const src = positionForNode(layout, 'src');

  assert.equal(src.x, repo.x);
  assert.equal(src.z, repo.z);
  assert.equal(src.y, repo.y - 20);
});

test('radial layout still places multiple subdirectories around the parent', () => {
  const layout = layoutRadialTree(branchingGraph, { layerSpacing: 20 });
  const repo = positionForNode(layout, 'repo');
  const src = positionForNode(layout, 'src');
  const docs = positionForNode(layout, 'docs');

  assert.notEqual(src.x, repo.x);
  assert.notEqual(docs.x, repo.x);
  assert.equal(src.y, repo.y - 20);
  assert.equal(docs.y, repo.y - 20);
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

test('safe radial layout propagates nested branch footprints to prevent sibling subtree overlap', () => {
  const layout = layoutSafeRadialTree(deepWideBranchGraph, { siblingSpacing: 10 });

  assert.ok(subtreesDoNotOverlap(layout, deepWideBranchGraph, 'alpha', 'beta', 10));
});

test('safe radial layout uses actual subtree shape instead of circular padding', () => {
  const layout = layoutSafeRadialTree(lopsidedNestedBranchGraph, { siblingSpacing: 10 });
  const alphaFootprint = subtreeHorizontalFootprint(layout, lopsidedNestedBranchGraph, 'alpha');
  const betaFootprint = subtreeHorizontalFootprint(layout, lopsidedNestedBranchGraph, 'beta');
  const branchOriginDistance = horizontalDistanceBetween(layout, 'alpha', 'beta');

  assert.ok(subtreesDoNotOverlap(layout, lopsidedNestedBranchGraph, 'alpha', 'beta', 10));
  assert.ok(branchOriginDistance < (alphaFootprint + betaFootprint + 10) * 0.7);
});

test('safe radial layout keeps the single subdirectory vertical stacking rule', () => {
  const layout = layoutSafeRadialTree(sampleGraph, { layerSpacing: 20 });
  const repo = positionForNode(layout, 'repo');
  const src = positionForNode(layout, 'src');

  assert.equal(src.x, repo.x);
  assert.equal(src.z, repo.z);
  assert.equal(src.y, repo.y - 20);
});

test('weighted safe radial layout places smaller sibling branches closer to their parent', () => {
  const layout = layoutWeightedSafeRadialTree(lopsidedNestedBranchGraph, { siblingSpacing: 10 });
  const alphaHeavyDistance = horizontalDistanceBetween(layout, 'alpha', 'alpha-heavy');
  const alphaLightDistance = horizontalDistanceBetween(layout, 'alpha', 'alpha-light');
  const betaHeavyDistance = horizontalDistanceBetween(layout, 'beta', 'beta-heavy');
  const betaLightDistance = horizontalDistanceBetween(layout, 'beta', 'beta-light');

  assert.ok(alphaHeavyDistance > alphaLightDistance);
  assert.ok(betaHeavyDistance > betaLightDistance);
  assert.ok(subtreesDoNotOverlap(layout, lopsidedNestedBranchGraph, 'alpha', 'beta', 10));
});

test('weighted safe radial layout keeps the single subdirectory vertical stacking rule', () => {
  const layout = layoutWeightedSafeRadialTree(sampleGraph, { layerSpacing: 20 });
  const repo = positionForNode(layout, 'repo');
  const src = positionForNode(layout, 'src');

  assert.equal(src.x, repo.x);
  assert.equal(src.z, repo.z);
  assert.equal(src.y, repo.y - 20);
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

test('layered grid level spacing option separates parent and child levels vertically', () => {
  const compact = layoutLayeredGrid(sampleGraph, { layerSpacing: 4 });
  const expanded = layoutLayeredGrid(sampleGraph, { layerSpacing: 20 });

  assert.ok(verticalDistanceBetween(expanded, 'repo', 'src') > verticalDistanceBetween(compact, 'repo', 'src'));
  assert.ok(verticalDistanceBetween(expanded, 'repo', 'lib') > verticalDistanceBetween(expanded, 'repo', 'src'));
});

test('layered grid root level spacing separates root children from deeper levels', () => {
  const layout = layoutLayeredGrid(sampleGraph, { layerSpacing: 20, rootLayerSpacing: 50 });

  assert.equal(verticalDistanceBetween(layout, 'repo', 'src'), 50);
  assert.equal(verticalDistanceBetween(layout, 'src', 'lib'), 20);
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

const lopsidedNestedBranchGraph: RenderGraph = {
  rootNodeId: 'repo',
  nodes: [
    {
      id: 'repo',
      kind: 'repo',
      name: 'repo',
      path: '',
      childIds: ['alpha', 'beta'],
    },
    {
      id: 'alpha',
      kind: 'directory',
      name: 'alpha',
      path: 'alpha',
      parentId: 'repo',
      childIds: ['alpha-heavy', 'alpha-light'],
    },
    {
      id: 'beta',
      kind: 'directory',
      name: 'beta',
      path: 'beta',
      parentId: 'repo',
      childIds: ['beta-heavy', 'beta-light'],
    },
    {
      id: 'alpha-heavy',
      kind: 'directory',
      name: 'alpha-heavy',
      path: 'alpha/heavy',
      parentId: 'alpha',
      childIds: childIds('alpha-file', 20),
    },
    {
      id: 'alpha-light',
      kind: 'directory',
      name: 'alpha-light',
      path: 'alpha/light',
      parentId: 'alpha',
      childIds: [],
    },
    {
      id: 'beta-heavy',
      kind: 'directory',
      name: 'beta-heavy',
      path: 'beta/heavy',
      parentId: 'beta',
      childIds: childIds('beta-file', 20),
    },
    {
      id: 'beta-light',
      kind: 'directory',
      name: 'beta-light',
      path: 'beta/light',
      parentId: 'beta',
      childIds: [],
    },
    ...fileNodes('alpha-file', 'alpha-heavy', 'alpha/heavy', 20),
    ...fileNodes('beta-file', 'beta-heavy', 'beta/heavy', 20),
  ],
  edges: [
    { id: 'repo-alpha', kind: 'tree', fromNodeId: 'repo', toNodeId: 'alpha' },
    { id: 'repo-beta', kind: 'tree', fromNodeId: 'repo', toNodeId: 'beta' },
    { id: 'alpha-heavy', kind: 'tree', fromNodeId: 'alpha', toNodeId: 'alpha-heavy' },
    { id: 'alpha-light', kind: 'tree', fromNodeId: 'alpha', toNodeId: 'alpha-light' },
    { id: 'beta-heavy', kind: 'tree', fromNodeId: 'beta', toNodeId: 'beta-heavy' },
    { id: 'beta-light', kind: 'tree', fromNodeId: 'beta', toNodeId: 'beta-light' },
    ...fileEdges('alpha-file', 'alpha-heavy', 20),
    ...fileEdges('beta-file', 'beta-heavy', 20),
  ],
};

function childIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index.toString().padStart(2, '0')}`);
}

function fileNodes(
  prefix: string,
  parentId: string,
  parentPath: string,
  count: number,
): RenderGraph['nodes'] {
  return childIds(prefix, count).map((fileId) => ({
    id: fileId,
    kind: 'file' as const,
    name: fileId,
    path: `${parentPath}/${fileId}`,
    parentId,
    childIds: [],
  }));
}

function fileEdges(prefix: string, parentId: string, count: number): RenderGraph['edges'] {
  return childIds(prefix, count).map((fileId) => ({
    id: `${parentId}-${fileId}`,
    kind: 'tree' as const,
    fromNodeId: parentId,
    toNodeId: fileId,
  }));
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

function verticalDistanceBetween(layout: LayoutResult, firstNodeId: string, secondNodeId: string): number {
  return Math.abs(yForNode(layout, firstNodeId) - yForNode(layout, secondNodeId));
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

function subtreeHorizontalFootprint(layout: LayoutResult, graph: RenderGraph, rootNodeId: string): number {
  return Math.max(
    ...subtreeNodeIds(graph, rootNodeId).map((nodeId) =>
      horizontalDistanceBetween(layout, rootNodeId, nodeId) + radiusForNode(layout, nodeId),
    ),
  );
}

function subtreeNodeIds(graph: RenderGraph, rootNodeId: string): readonly string[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeIds: string[] = [];

  function append(nodeId: string): void {
    const node = nodeById.get(nodeId);

    if (!node) {
      return;
    }

    nodeIds.push(node.id);

    for (const childId of node.childIds) {
      append(childId);
    }
  }

  append(rootNodeId);
  return nodeIds;
}

function subtreesDoNotOverlap(
  layout: LayoutResult,
  graph: RenderGraph,
  leftRootNodeId: string,
  rightRootNodeId: string,
  spacing: number,
): boolean {
  const leftNodeIds = subtreeNodeIds(graph, leftRootNodeId);
  const rightNodeIds = subtreeNodeIds(graph, rightRootNodeId);

  for (const leftNodeId of leftNodeIds) {
    for (const rightNodeId of rightNodeIds) {
      const distance = horizontalDistanceBetween(layout, leftNodeId, rightNodeId);

      if (distance < radiusForNode(layout, leftNodeId) + radiusForNode(layout, rightNodeId) + spacing - 0.001) {
        return false;
      }
    }
  }

  return true;
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
