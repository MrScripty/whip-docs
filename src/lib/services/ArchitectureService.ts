import type {
  AppConfigDto,
  AnalysisStatusDto,
  CommandErrorDto,
  DirectoryGraphSnapshotDto,
  FileRelationGraphSnapshotDto,
  GraphSnapshotDto,
  SourceSnippetDto,
} from '../../backends/TauriArchitectureBackend';
import { TauriArchitectureBackend } from '../../backends/TauriArchitectureBackend.ts';

export class ArchitectureService {
  private readonly backend: TauriArchitectureBackend;

  constructor(backend = new TauriArchitectureBackend()) {
    this.backend = backend;
  }

  getConfig(): Promise<AppConfigDto> {
    return this.backend.getAppConfig();
  }

  getAnalysisStatus(): Promise<AnalysisStatusDto> {
    return this.backend.getAnalysisStatus();
  }

  analyzeSourceRepo(): Promise<GraphSnapshotDto> {
    return this.backend.analyzeSourceRepo();
  }

  loadDirectoryGraph(path: string): Promise<DirectoryGraphSnapshotDto> {
    return this.backend.loadDirectoryGraph(path.trim());
  }

  loadFileRelationGraph(path: string): Promise<FileRelationGraphSnapshotDto> {
    return this.backend.loadFileRelationGraph(path.trim());
  }

  getGraphSnapshot(): Promise<GraphSnapshotDto | null> {
    return this.backend.getGraphSnapshot();
  }

  getSourceSnippet(nodeId: string): Promise<SourceSnippetDto> {
    return this.backend.getSourceSnippet(nodeId);
  }

  setSourceRepoPath(path: string): Promise<AppConfigDto> {
    return this.backend.setSourceRepoPath(path.trim());
  }
}

export function commandErrorMessage(error: unknown): string {
  if (isCommandErrorDto(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed';
}

function isCommandErrorDto(error: unknown): error is CommandErrorDto {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  return (
    typeof record.code === 'string' &&
    typeof record.message === 'string' &&
    typeof record.recoverable === 'boolean'
  );
}
