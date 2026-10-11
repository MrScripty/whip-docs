import type { GraphEdgeDto, GraphNodeDto, GraphSnapshotDto, SourceRangeDto } from '../../backends/TauriArchitectureBackend';
import type { AnalysisIdentity } from '../../backends/SyntaxAnalysis';

export type IntentSnapshot = {
  contentHash: string; hashAlgorithm: string; byteLength: number; capturedAt: string; analysisAt: string;
  repositoryRevision: string | null; worktreeDigest: string;
  structuralSnapshot: { nodes: GraphNodeDto[]; edges: GraphEdgeDto[] };
} & ({ precision: 'structural_snapshot_symbol_range_unverified'; worktreeDigestScope: 'analyzed_rust_sources'; analysisIdentity?: never }
  | { precision: 'syntax_byte_ranges_v1'; worktreeDigestScope: 'captured_multilingual_sources_v1'; analysisIdentity: AnalysisIdentity });

export type IntentKind = 'original' | 'interpretation' | 'proposal';
export type IntentRecord = {
  id: string;
  kind: IntentKind;
  text: string;
  parentId: string | null;
  originalId: string;
  createdAt: string;
  symbol: { nodeId: string; label: string; kind: GraphNodeDto['kind']; sourceRange: SourceRangeDto; sourceRoot: string };
  snapshot: IntentSnapshot;
  bindingStatus: 'current' | 'stale' | 'missing' | 'unverified';
};
export type AppendIntent = { nodeId: string; text: string; kind: IntentKind; parentId: string | null; expectedAnalysisAt: string };
export type IntentBackend = {
  listRecords(): Promise<IntentRecord[]>;
  appendRecord(input: AppendIntent): Promise<IntentRecord>;
};
export type IntentGraphState = { graph: GraphSnapshotDto; records: IntentRecord[] };
