import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { LayoutNodePosition } from './types';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.includes('/src/lib/graph-v0/') &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const { directoryEdgeCurve, directoryEdgePathPoints } = (await import(
  new URL('./edgeGeometry.ts', import.meta.url).href
)) as typeof import('./edgeGeometry');

test('straight edge path connects source bottom to target top', () => {
  const points = directoryEdgePathPoints(sourceNode, targetNode, 'straight');

  assert.equal(points.length, 2);
  assert.deepEqual(points[0].toArray(), [0, -2, 0]);
  assert.deepEqual(points[1].toArray(), [12, -22.5, 5]);
});

test('bezier edge path leaves source bottom and enters target top vertically', () => {
  const points = directoryEdgePathPoints(sourceNode, targetNode, 'bezier');
  const first = points[0];
  const second = points[1];
  const penultimate = points[points.length - 2];
  const last = points[points.length - 1];

  assert.ok(points.length > 2);
  assert.deepEqual(first.toArray(), [0, -2, 0]);
  assert.deepEqual(last.toArray(), [12, -22.5, 5]);
  assert.ok(second.y < first.y);
  assert.ok(penultimate.y > last.y);
  assert.ok(second.x > first.x);
  assert.ok(penultimate.x < last.x);
});

test('c curve edge path leaves source bottom horizontally and enters target top vertically', () => {
  const curve = directoryEdgeCurve(sourceNode, targetNode, 'c-curve');
  const points = directoryEdgePathPoints(sourceNode, targetNode, 'c-curve');
  const first = points[0];
  const last = points[points.length - 1];

  assert.deepEqual(first.toArray(), [0, -2, 0]);
  assert.deepEqual(last.toArray(), [12, -22.5, 5]);
  assert.equal(curve.v1.y, curve.v0.y);
  assert.ok(curve.v1.x > curve.v0.x);
  assert.ok(curve.v1.z > curve.v0.z);
  assert.equal(curve.v2.x, curve.v3.x);
  assert.equal(curve.v2.z, curve.v3.z);
  assert.ok(curve.v2.y > curve.v3.y);
});

test('elbow edge path uses a hard horizontal then vertical 90 degree turn', () => {
  const points = directoryEdgePathPoints(sourceNode, targetNode, 'elbow');

  assert.equal(points.length, 3);
  assert.deepEqual(points[0].toArray(), [0, -2, 0]);
  assert.deepEqual(points[1].toArray(), [12, -2, 5]);
  assert.deepEqual(points[2].toArray(), [12, -22.5, 5]);
});

const sourceNode: LayoutNodePosition = {
  nodeId: 'source',
  position: { x: 0, y: 0, z: 0 },
  radius: 2,
  depth: 0,
  order: 0,
};

const targetNode: LayoutNodePosition = {
  nodeId: 'target',
  position: { x: 12, y: -24, z: 5 },
  radius: 1.5,
  depth: 1,
  order: 0,
};
