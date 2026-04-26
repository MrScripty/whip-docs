import { writable } from 'svelte/store';
import type { AnalysisStatusDto } from '../../backends/TauriArchitectureBackend';

export const analysisStatus = writable<AnalysisStatusDto>({
  phase: 'idle',
  workspaceRoot: null,
  activeJobId: null,
  diagnostics: [],
});
