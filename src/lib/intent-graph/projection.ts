import type {
  GraphEdgeDto,
  GraphNodeDto,
  GraphSnapshotDto,
} from '../../backends/TauriArchitectureBackend.ts';

export type IntentGraphPosition = Readonly<{ x: number; y: number; z: number }>;

export type IntentGraphProjection = {
  /** Original backend objects. Projection never rewrites an endpoint or confidence. */
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  positions: ReadonlyMap<string, IntentGraphPosition>;
  /** Layout membership only; it is not a newly observed graph relationship. */
  fileIdByNodeId: ReadonlyMap<string, string>;
};

const OWNERSHIP_KINDS = new Set(['contains', 'defines', 'defines_method']);
const EXCLUDED_KINDS = new Set(['workspace', 'crate']);

/**
 * A conservative view of the backend symbol graph. Collapsed symbols and their
 * edges disappear; calls are never aggregated into invented file-to-file edges.
 * Source locations are used only to group nodes, never as verified navigation.
 */
export function projectIntentGraph(
  snapshot: GraphSnapshotDto,
  expandedFileIds: ReadonlySet<string>,
): IntentGraphProjection {
  const files = snapshot.nodes.filter((node) => node.kind === 'file');
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const filesByPath = new Map<string, string[]>();
  const fileIdByNodeId = new Map<string, string>();
  for (const file of files) {
    const path = file.sourceRange?.path ?? file.label;
    filesByPath.set(path, [...(filesByPath.get(path) ?? []), file.id]);
    fileIdByNodeId.set(file.id, file.id);
  }

  // Exact path membership takes precedence over ownership fallback. Ambiguous
  // duplicate file paths are deliberately not resolved by guessing.
  for (const node of snapshot.nodes) {
    if (node.kind === 'file' || EXCLUDED_KINDS.has(node.kind)) continue;
    const candidates = node.sourceRange ? filesByPath.get(node.sourceRange.path) : undefined;
    if (candidates?.length === 1) fileIdByNodeId.set(node.id, candidates[0]);
  }

  const children = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    if (!OWNERSHIP_KINDS.has(edge.kind)) continue;
    if (!nodesById.has(edge.sourceId) || !nodesById.has(edge.targetId)) continue;
    children.set(edge.sourceId, [...(children.get(edge.sourceId) ?? []), edge.targetId]);
  }
  const inferredOwners = new Map<string, Set<string>>();
  for (const file of files) {
    const visited = new Set<string>([file.id]);
    const queue = [file.id];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const childId of children.get(queue[cursor]) ?? []) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        const child = nodesById.get(childId)!;
        if (child.kind === 'file' || EXCLUDED_KINDS.has(child.kind)) continue;
        // A range in a different or unknown file must not become local merely
        // because a structural edge reaches it.
        if (child.sourceRange && fileIdByNodeId.get(childId) !== file.id) continue;
        if (!child.sourceRange) {
          const owners = inferredOwners.get(childId) ?? new Set<string>();
          owners.add(file.id);
          inferredOwners.set(childId, owners);
        }
        queue.push(childId);
      }
    }
  }
  for (const [nodeId, owners] of inferredOwners) {
    if (owners.size === 1) fileIdByNodeId.set(nodeId, owners.values().next().value!);
  }

  const nodes = snapshot.nodes.filter((node) => {
    if (node.kind === 'file') return true;
    if (EXCLUDED_KINDS.has(node.kind)) return false;
    const owner = fileIdByNodeId.get(node.id);
    return owner !== undefined && expandedFileIds.has(owner);
  });
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = snapshot.edges.filter(
    (edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId),
  );

  // Layout is intentionally independent of which files are expanded: expanding
  // a file does not reshuffle the rest of the user's mental map.
  const positions = new Map<string, IntentGraphPosition>();
  const sortedFiles = [...files].sort(byId);
  const columns = Math.max(1, Math.ceil(Math.sqrt(sortedFiles.length)));
  const rows = Math.ceil(sortedFiles.length / columns);
  const symbolsByFile = new Map<string, GraphNodeDto[]>();
  for (const node of snapshot.nodes) {
    if (node.kind === 'file' || EXCLUDED_KINDS.has(node.kind)) continue;
    const owner = fileIdByNodeId.get(node.id);
    if (owner) symbolsByFile.set(owner, [...(symbolsByFile.get(owner) ?? []), node]);
  }
  const largestCluster = Math.max(0, ...[...symbolsByFile.values()].map((group) => group.length));
  const spacing = Math.max(25, 15 + Math.ceil(Math.sqrt(largestCluster)) * 4);
  sortedFiles.forEach((file, index) => {
    const row = Math.floor(index / columns);
    const countInRow = Math.min(columns, sortedFiles.length - row * columns);
    const origin = {
      x: ((index % columns) - (countInRow - 1) / 2) * spacing,
      y: ((rows - 1) / 2 - row) * spacing * 0.84,
      z: sortedFiles.length === 1 ? 0 : (index % 3 - 1) * 1.4,
    };
    positions.set(file.id, origin);
    const symbols = (symbolsByFile.get(file.id) ?? []).sort(byId);
    symbols.forEach((node, symbolIndex) => {
      if (!visibleIds.has(node.id)) return;
      // Successive rings leave the file hub clear and keep long labels readable.
      let ring = 0;
      let ringStart = 0;
      while (symbolIndex >= ringStart + (ring + 1) * 8) {
        ringStart += (ring + 1) * 8;
        ring += 1;
      }
      const count = Math.min((ring + 1) * 8, symbols.length - ringStart);
      const angle = -Math.PI / 2 + ((symbolIndex - ringStart) / count) * Math.PI * 2 + ring * 0.3;
      const radius = 6.4 + ring * 4;
      positions.set(node.id, {
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius * 0.83,
        z: origin.z + Math.sin(angle * 2) * 1.5 + (ring % 2 ? -0.6 : 0.6),
      });
    });
  });
  return { nodes, edges, positions, fileIdByNodeId };
}

function byId(a: GraphNodeDto, b: GraphNodeDto): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
