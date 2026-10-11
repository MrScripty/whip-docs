import type { GraphEdgeDto, GraphNodeDto, GraphSnapshotDto, SourceRangeDto } from '../../backends/TauriArchitectureBackend';

export type IntentKind = 'original' | 'interpretation' | 'proposal';
export type IntentRecord = {
  id: string;
  kind: IntentKind;
  text: string;
  parentId: string | null;
  originalId: string;
  createdAt: string;
  symbol: { nodeId: string; label: string; kind: GraphNodeDto['kind']; sourceRange: SourceRangeDto; sourceRoot: string };
  snapshot: { contentHash: string; hashAlgorithm: string; byteLength: number; capturedAt: string; analysisAt: string; precision: 'structural_snapshot_symbol_range_unverified'; repositoryRevision: string | null; worktreeDigest: string; worktreeDigestScope: 'analyzed_rust_sources'; structuralSnapshot: { nodes: GraphNodeDto[]; edges: GraphEdgeDto[] } };
  bindingStatus: 'current' | 'stale' | 'missing' | 'unverified';
};
export type AppendIntent = { nodeId: string; text: string; kind: IntentKind; parentId: string | null; expectedAnalysisAt: string };
export type IntentBackend = {
  listRecords(): Promise<IntentRecord[]>;
  appendRecord(input: AppendIntent): Promise<IntentRecord>;
};
export type IntentGraphState = { graph: GraphSnapshotDto; records: IntentRecord[] };
