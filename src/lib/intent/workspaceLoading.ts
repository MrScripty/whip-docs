import type { AppConfigDto, FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';

export type WorkspaceBackend = {
  loadFileRelationGraph(path: string): Promise<FileRelationGraphSnapshotDto>;
  setSourceRepoPath(path: string): Promise<AppConfigDto>;
  analyzeSourceRepo(): Promise<GraphSnapshotDto>;
};

/** Serialize backend mutations and suppress every superseded response, including failures. */
export class WorkspaceLoader {
  private generation = 0;
  private pending: Promise<void> = Promise.resolve();
  invalidate(): void { this.generation += 1; }
  open(backend: WorkspaceBackend, path: string, receive: {
    files(snapshot: FileRelationGraphSnapshotDto): void;
    configured(): void;
    symbols(snapshot: GraphSnapshotDto): void;
    error(error: unknown): void;
    done(): void;
  }): Promise<void> {
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const run = async () => {
      if (!current()) return;
      try {
        const files = await backend.loadFileRelationGraph(path.trim());
        if (!current()) return;
        receive.files(files);
        // File overview works for generic source roots even if Cargo analysis fails.
        const config = await backend.setSourceRepoPath(files.sourceRoot);
        if (!current()) return;
        if (config.sourceRepoPath !== files.sourceRoot) throw new Error('Repository changed while opening. Open it again.');
        receive.configured();
        const symbols = await backend.analyzeSourceRepo();
        if (!current()) return;
        if (symbols.sourceRoot !== files.sourceRoot) throw new Error('Analysis belongs to another repository. Open it again.');
        receive.symbols(symbols);
      } catch (error) { if (current()) receive.error(error); }
      finally { if (current()) receive.done(); }
    };
    this.pending = this.pending.then(run, run);
    return this.pending;
  }
}
