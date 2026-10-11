import type { AppConfigDto, FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import type { SourceAnalysisDto, SyntaxDialect } from '../../backends/SyntaxAnalysis';
import { validateGraphAnalysis } from './syntaxSupport.ts';

export type WorkspaceBackend = {
  loadFileRelationGraph(path: string): Promise<FileRelationGraphSnapshotDto>;
  setSourceRepoPath(path: string): Promise<AppConfigDto>;
  analyzeSourceRepo(dialectOverrides?: Record<string, SyntaxDialect>): Promise<GraphSnapshotDto>;
  getSourceAnalysis?(expectedSourceRoot: string, expectedAnalysisAt: string): Promise<SourceAnalysisDto | null>;
};

/** Serialize backend mutations and suppress every superseded response, including failures. */
export class WorkspaceLoader {
  private generation = 0;
  private pending: Promise<void> = Promise.resolve();
  invalidate(): void { this.generation += 1; }
  open(backend: WorkspaceBackend, path: string, receive: {
    files(snapshot: FileRelationGraphSnapshotDto): void;
    configured(): void;
    symbols(snapshot: GraphSnapshotDto, analysis: SourceAnalysisDto | null): void;
    error(error: unknown): void;
    done(): void;
  }, dialectOverrides?: Record<string, SyntaxDialect>): Promise<void> {
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const run = async () => {
      if (!current()) return;
      try {
        const files = await backend.loadFileRelationGraph(path.trim());
        if (!current()) return;
        receive.files(files);
        // Preserve the original file-relation pipeline independently of syntax metadata.
        const config = await backend.setSourceRepoPath(files.sourceRoot);
        if (!current()) return;
        if (config.sourceRepoPath !== files.sourceRoot) throw new Error('Repository changed while opening. Open it again.');
        receive.configured();
        const symbols = await backend.analyzeSourceRepo(dialectOverrides);
        if (!current()) return;
        if (symbols.sourceRoot !== files.sourceRoot) throw new Error('Analysis belongs to another repository. Open it again.');
        const analysis = symbols.schemaVersion === 2 ? await backend.getSourceAnalysis?.(symbols.sourceRoot, symbols.generatedAt) ?? null : null;
        if (!current()) return;
        receive.symbols(symbols, validateGraphAnalysis(symbols, analysis));
      } catch (error) { if (current()) receive.error(error); }
      finally { if (current()) receive.done(); }
    };
    this.pending = this.pending.then(run, run);
    return this.pending;
  }
}
