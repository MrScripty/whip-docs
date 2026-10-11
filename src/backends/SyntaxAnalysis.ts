/** Native schema handoff. Existing scenes must opt into these kinds/coverage. */
import { invoke } from '@tauri-apps/api/core';
import type { GraphEdgeDto, GraphNodeDto, GraphNodeKind, GraphSnapshotDto } from './TauriArchitectureBackend';

export type SyntaxDialect = 'rust' | 'typescript' | 'tsx' | 'javascript' | 'jsx'
  | 'python' | 'lua' | 'kotlin' | 'zig' | 'csharp' | 'c' | 'cpp' | 'odin' | 'svelte5';
export type ByteRange = { startByte: number; endByte: number };
export type SyntaxCoverage = 'supported_subset' | 'incomplete' | 'unavailable';
export type SyntaxDeclarationKind = 'function' | 'method' | 'class' | 'struct' | 'enum'
  | 'interface' | 'trait' | 'implementation' | 'module' | 'type_alias' | 'binding'
  | 'field' | 'variant' | 'parameter' | 'component' | 'snippet';
export type SyntaxDeclaration = {
  id: string; name: string; kind: SyntaxDeclarationKind; syntaxKind: string;
  dialect: SyntaxDialect; parentId: string | null; range: ByteRange; nameRange: ByteRange;
  headerComplete: boolean; bodyComplete: boolean;
};
export type SyntaxRelationFact = {
  ownerId: string | null;
  kind: 'written_type' | 'import_syntax' | 'call_syntax' | 'inheritance_syntax';
  range: ByteRange; targetRange: ByteRange;
  /** These qualify written syntax; targetRange is never a resolved symbol ID. */
  qualification: string;
};
export type SyntaxDiagnostic = { code: string; path: string; range: ByteRange | null; message: string };
export type GrammarIdentity = { dialect: SyntaxDialect; grammar: string };
export type SyntaxFileIdentity = {
  path: string; dialect: SyntaxDialect; grammars: GrammarIdentity[];
  sourceDigest: string; structureDigest: string; byteLength: number; coverage: SyntaxCoverage;
};
export type AnalysisIdentity = {
  schemaVersion: 1; sourceScope: 'captured_multilingual_sources_v1';
  parser: string; extractor: string; discoveryComplete: boolean; files: SyntaxFileIdentity[];
};
export type SyntaxFileAnalysis = {
  identity: SyntaxFileIdentity; declarations: SyntaxDeclaration[];
  relations: SyntaxRelationFact[]; diagnostics: SyntaxDiagnostic[];
};
export type SourceAnalysisDto = {
  schemaVersion: 1; identity: AnalysisIdentity; files: SyntaxFileAnalysis[]; diagnostics: SyntaxDiagnostic[];
};
export type SyntaxGraphNodeKind = GraphNodeKind | 'class' | 'interface' | 'type_alias'
  | 'binding' | 'field' | 'variant' | 'parameter' | 'component' | 'snippet';
export type SyntaxGraphSnapshotDto = Omit<GraphSnapshotDto, 'schemaVersion' | 'nodes' | 'edges'> & {
  schemaVersion: 2;
  nodes: (Omit<GraphNodeDto, 'kind'> & { kind: SyntaxGraphNodeKind })[];
  edges: (Omit<GraphEdgeDto, 'provenance'> & { provenance: GraphEdgeDto['provenance'] | 'tree_sitter' })[];
};

/** The caller must render schema-2 kinds; this does not update existing scenes. */
export function analyzeSyntaxSourceRepo(dialectOverrides?: Record<string, SyntaxDialect>): Promise<SyntaxGraphSnapshotDto> {
  return invoke('analyze_source_repo', { dialectOverrides });
}
export function getSourceAnalysis(): Promise<SourceAnalysisDto | null> {
  return invoke('get_source_analysis');
}
