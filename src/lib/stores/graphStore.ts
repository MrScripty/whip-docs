import { writable } from 'svelte/store';
import type { GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';

export const graphSnapshot = writable<GraphSnapshotDto | null>(null);
export const graphError = writable<string | null>(null);
