import { writable } from 'svelte/store';
import type { AppConfigDto } from '../../backends/TauriArchitectureBackend';

export const appConfig = writable<AppConfigDto>({
  schemaVersion: 1,
  sourceRepoPath: null,
  sourceRepoStatus: 'unconfigured',
});

export const sourceRepoError = writable<string | null>(null);
