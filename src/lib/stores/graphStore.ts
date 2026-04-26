import { writable } from 'svelte/store';
import type { GraphSnapshotDto, SourceSnippetDto } from '../../backends/TauriArchitectureBackend';

export const graphSnapshot = writable<GraphSnapshotDto | null>(null);
export const graphError = writable<string | null>(null);
export const selectedNodeId = writable<string | null>(null);
export const sourceSnippet = writable<SourceSnippetDto | null>(null);
