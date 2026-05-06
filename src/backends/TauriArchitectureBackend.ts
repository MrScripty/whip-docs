import { invoke, isTauri } from '@tauri-apps/api/core';

export type AppStatusDto = {
  appName: string;
  activeProduct: string;
  shutdownRequested: boolean;
};

export type SourceRepoStatusDto =
  | 'unconfigured'
  | 'valid'
  | 'missing'
  | 'not_directory'
  | 'missing_cargo_manifest'
  | 'invalid_path';

export type AppConfigDto = {
  schemaVersion: number;
  sourceRepoPath: string | null;
  sourceRepoStatus: SourceRepoStatusDto;
};

export type AnalyzerLifecyclePhase =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'busy'
  | 'stopping'
  | 'stopped'
  | 'failed';

export type AnalyzerDiagnosticDto = {
  code: string;
  message: string;
  recoverable: boolean;
};

export type AnalysisStatusDto = {
  phase: AnalyzerLifecyclePhase;
  workspaceRoot: string | null;
  activeJobId: string | null;
  diagnostics: AnalyzerDiagnosticDto[];
};

export type GraphNodeKind =
  | 'workspace'
  | 'crate'
  | 'module'
  | 'file'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'impl'
  | 'function'
  | 'method'
  | 'tauri_command';

export type GraphEdgeKind =
  | 'contains'
  | 'defines'
  | 'defines_method'
  | 'imports'
  | 'calls'
  | 'implements'
  | 'references'
  | 'exposes_command';

export type SourceRangeDto = {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type GraphNodeDto = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sourceRange: SourceRangeDto | null;
};

export type GraphEdgeDto = {
  id: string;
  kind: GraphEdgeKind;
  sourceId: string;
  targetId: string;
  provenance: 'rust_analyzer' | 'syn' | 'normalized';
  confidence: 'exact' | 'inferred' | 'partial';
};

export type GraphDiagnosticDto = {
  code: string;
  message: string;
  sourcePath: string | null;
};

export type GraphSnapshotDto = {
  schemaVersion: number;
  sourceRoot: string;
  generatedAt: string;
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  diagnostics: GraphDiagnosticDto[];
};

export type DirectoryGraphNodeKind = 'repo' | 'directory' | 'file';

export type DirectoryGraphEdgeKind = 'tree';

export type DirectoryGraphNodeDto = {
  id: string;
  kind: DirectoryGraphNodeKind;
  name: string;
  path: string;
  parentId: string | null;
  childIds: string[];
  expanded: boolean;
};

export type DirectoryGraphEdgeDto = {
  id: string;
  kind: DirectoryGraphEdgeKind;
  fromNodeId: string;
  toNodeId: string;
};

export type DirectoryGraphSnapshotDto = {
  schemaVersion: number;
  rootNodeId: string;
  nodes: DirectoryGraphNodeDto[];
  edges: DirectoryGraphEdgeDto[];
  excludedPathCount: number;
};

export type SourceSnippetDto = {
  nodeId: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
};

export type CommandErrorDto = {
  code: string;
  message: string;
  recoverable: boolean;
};

export class TauriArchitectureBackend {
  isAvailable(): boolean {
    return isTauri();
  }

  async getAppStatus(): Promise<AppStatusDto> {
    return invokeTauri<AppStatusDto>('get_app_status');
  }

  async getAppConfig(): Promise<AppConfigDto> {
    return invokeTauri<AppConfigDto>('get_app_config');
  }

  async getAnalysisStatus(): Promise<AnalysisStatusDto> {
    return invokeTauri<AnalysisStatusDto>('get_analysis_status');
  }

  async analyzeSourceRepo(): Promise<GraphSnapshotDto> {
    return invokeTauri<GraphSnapshotDto>('analyze_source_repo');
  }

  async loadDirectoryGraph(path: string): Promise<DirectoryGraphSnapshotDto> {
    return invokeTauri<DirectoryGraphSnapshotDto>('load_directory_graph', { path });
  }

  async getGraphSnapshot(): Promise<GraphSnapshotDto | null> {
    return invokeTauri<GraphSnapshotDto | null>('get_graph_snapshot');
  }

  async getSourceSnippet(nodeId: string): Promise<SourceSnippetDto> {
    return invokeTauri<SourceSnippetDto>('get_source_snippet', { nodeId });
  }

  async setSourceRepoPath(path: string): Promise<AppConfigDto> {
    return invokeTauri<AppConfigDto>('set_source_repo_path', { path });
  }
}

function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return Promise.reject({
      code: 'tauri_unavailable',
      message: 'Open Whip Docs with `npm run dev:desktop`; backend commands are unavailable in a plain browser tab.',
      recoverable: true,
    } satisfies CommandErrorDto);
  }

  return invoke<T>(command, args);
}
