import type { GraphNodeDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';

export const PREVIEW_SOURCE_PATH = 'src-tauri/src/source/mod.rs';
export const PREVIEW_UPSTREAM = '3e299d6bf1e7495d80377b8e2ba47ba48366a5a3';
const fileId = `file:${PREVIEW_SOURCE_PATH}`;
const node = (kind: GraphNodeDto['kind'], label: string, line: number): GraphNodeDto => ({
  id: kind === 'file' ? fileId : `${kind}:${PREVIEW_SOURCE_PATH}:${label}`, kind, label,
  sourceRange: { path: PREVIEW_SOURCE_PATH, startLine: line, endLine: line, startColumn: 1, endColumn: 1 },
});
const symbols = [
  node('struct', 'ValidatedRepoPath', 6), node('impl', 'ValidatedRepoPath impl', 10),
  node('method', 'parse_existing_source_root', 11), node('method', 'parse_existing_cargo_repo', 39),
  node('method', 'require_cargo_manifest', 45), node('method', 'as_path', 56),
  node('method', 'resolve_existing_child', 60), node('method', 'display_path', 101),
  node('enum', 'SourcePathError', 107),
];

/** Curated renderer fixture from public upstream, not native analyzer output. */
export const previewGraph: GraphSnapshotDto = {
  schemaVersion: 1, sourceRoot: 'public-fixture:MrScripty/whip-docs', generatedAt: `fixture:${PREVIEW_UPSTREAM}`,
  nodes: [node('file', PREVIEW_SOURCE_PATH, 1), ...symbols],
  edges: [
    ...symbols.map(symbol => ({ id: `defines:${symbol.id}`, kind: 'defines' as const, sourceId: fileId, targetId: symbol.id, provenance: 'normalized' as const, confidence: 'exact' as const })),
    ...symbols.filter(symbol => symbol.kind === 'method').map(symbol => ({ id: `defines_method:${symbol.id}`, kind: 'defines_method' as const, sourceId: symbols[1].id, targetId: symbol.id, provenance: 'normalized' as const, confidence: 'exact' as const })),
  ],
  diagnostics: [{ code: 'preview_fixture', message: 'Curated public source fixture. Native analysis has not run. Symbol ranges are approximate. Call resolution and dynamic relationships are not demonstrated.', sourcePath: PREVIEW_SOURCE_PATH }],
};
