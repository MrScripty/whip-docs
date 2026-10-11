import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GraphEdgeDto,
  GraphNodeDto,
  GraphSnapshotDto,
} from '../../backends/TauriArchitectureBackend.ts';
import { projectIntentGraph } from './projection.ts';

function node(id: string, kind: GraphNodeDto['kind'], path: string | null): GraphNodeDto {
  return {
    id, kind, label: id,
    sourceRange: path ? { path, startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 } : null,
  };
}
function edge(
  id: string, sourceId: string, targetId: string,
  kind: GraphEdgeDto['kind'] = 'defines',
  confidence: GraphEdgeDto['confidence'] = 'exact',
): GraphEdgeDto {
  return { id, sourceId, targetId, kind, confidence, provenance: 'syn' };
}
function fixture(): GraphSnapshotDto {
  return {
    schemaVersion: 1, sourceRoot: '/example', generatedAt: '2026-10-11', diagnostics: [],
    nodes: [
      node('workspace', 'workspace', null), node('crate', 'crate', null),
      node('a.rs', 'file', 'a.rs'), node('b.rs', 'file', 'b.rs'),
      node('module-a', 'module', 'a.rs'), node('struct-a', 'struct', 'a.rs'),
      node('impl-a', 'impl', 'a.rs'), node('method-a', 'method', null),
      node('function-b', 'function', 'b.rs'), node('unknown', 'function', 'missing.rs'),
    ],
    edges: [
      edge('workspace-crate', 'workspace', 'crate', 'contains'),
      edge('a-module', 'a.rs', 'module-a'), edge('module-struct', 'module-a', 'struct-a'),
      edge('module-impl', 'module-a', 'impl-a'),
      edge('impl-method', 'impl-a', 'method-a', 'defines_method'),
      edge('b-function', 'b.rs', 'function-b'),
      edge('file-import', 'a.rs', 'b.rs', 'imports', 'partial'),
      edge('partial-call', 'method-a', 'function-b', 'calls', 'partial'),
      edge('inferred-reference', 'struct-a', 'function-b', 'references', 'inferred'),
      edge('dangling', 'method-a', 'missing', 'calls', 'partial'),
    ],
  };
}

test('initial view shows only file nodes and original file edges', () => {
  const snapshot = fixture();
  const projected = projectIntentGraph(snapshot, new Set());
  assert.deepEqual(projected.nodes.map((n) => n.id), ['a.rs', 'b.rs']);
  assert.deepEqual(projected.edges.map((e) => e.id), ['file-import']);
  assert.equal(projected.nodes[0], snapshot.nodes[2]);
  assert.equal(projected.edges[0], snapshot.edges[6]);
});

test('expansion includes typed symbols by path and nested structural membership', () => {
  const graph = projectIntentGraph(fixture(), new Set(['a.rs']));
  assert.deepEqual(graph.nodes.map((n) => n.id), [
    'a.rs', 'b.rs', 'module-a', 'struct-a', 'impl-a', 'method-a',
  ]);
  assert.equal(graph.fileIdByNodeId.get('method-a'), 'a.rs');
  assert.ok(graph.edges.some((e) => e.kind === 'defines_method'));
  assert.ok(!graph.edges.some((e) => e.kind === 'calls'));
  assert.equal(graph.positions.size, graph.nodes.length);
});

test('collapse restores file projection and leaves file positions unchanged', () => {
  const snapshot = fixture();
  const collapsed = projectIntentGraph(snapshot, new Set());
  const expanded = projectIntentGraph(snapshot, new Set(['a.rs', 'b.rs']));
  for (const node of collapsed.nodes) {
    assert.deepEqual(expanded.positions.get(node.id), collapsed.positions.get(node.id));
  }
  assert.deepEqual(projectIntentGraph(snapshot, new Set()), collapsed);
  assert.ok(!collapsed.edges.some((e) => e.id === 'partial-call'));
});

test('keeps uncertain edges and every original evidence field unchanged', () => {
  const snapshot = fixture();
  const before = JSON.stringify(snapshot);
  const graph = projectIntentGraph(snapshot, new Set(['a.rs', 'b.rs']));
  for (const id of ['partial-call', 'inferred-reference', 'file-import']) {
    const original = snapshot.edges.find((e) => e.id === id)!;
    assert.equal(graph.edges.find((e) => e.id === id), original);
  }
  assert.equal(JSON.stringify(snapshot), before);
});

test('ignores unknown expansion IDs, dangling refs, and unrelated source paths', () => {
  const snapshot = fixture();
  snapshot.edges.push(edge('wrong-owner', 'a.rs', 'unknown'));
  const graph = projectIntentGraph(snapshot, new Set(['a.rs', 'nonexistent']));
  assert.ok(!graph.nodes.some((n) => n.id === 'unknown'));
  assert.ok(!graph.edges.some((e) => e.id === 'dangling' || e.id === 'wrong-owner'));
  assert.ok(!graph.nodes.some((n) => n.id === 'function-b'));
});

test('ownership cycles terminate and ambiguous missing-range owners stay hidden', () => {
  const snapshot = fixture();
  snapshot.edges.push(edge('cycle', 'method-a', 'impl-a', 'contains'));
  snapshot.edges.push(edge('ambiguous', 'b.rs', 'method-a'));
  const graph = projectIntentGraph(snapshot, new Set(['a.rs', 'b.rs']));
  assert.ok(!graph.nodes.some((n) => n.id === 'method-a'));
  assert.equal(graph.fileIdByNodeId.get('method-a'), undefined);
});

test('layout is deterministic independent of snapshot ordering', () => {
  const snapshot = fixture();
  const expanded = new Set(['a.rs', 'b.rs']);
  const original = projectIntentGraph(snapshot, expanded);
  const reordered = projectIntentGraph({ ...snapshot, nodes: [...snapshot.nodes].reverse(), edges: [...snapshot.edges].reverse() }, expanded);
  assert.deepEqual(reordered.positions, original.positions);
});

test('handles empty snapshots and does not invent structural edges for path membership', () => {
  const snapshot = fixture();
  snapshot.edges = [];
  const graph = projectIntentGraph(snapshot, new Set(['a.rs']));
  assert.equal(graph.edges.length, 0);
  assert.ok(graph.nodes.some((n) => n.id === 'struct-a'));
  assert.ok(!graph.nodes.some((n) => n.id === 'method-a'));
  assert.deepEqual(projectIntentGraph({ ...snapshot, nodes: [] }, new Set()).nodes, []);
});
