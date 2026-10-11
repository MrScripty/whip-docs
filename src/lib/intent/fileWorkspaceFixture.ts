import snapshot from '../../../fixtures/file-workspace.snapshot.json';
import type { FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';

/** Recorded output of the real Rust file-relation and symbol services; replayed without native IPC. */
export const fixtureFiles = snapshot.files as FileRelationGraphSnapshotDto;
export const fixtureSymbols = snapshot.symbols as GraphSnapshotDto;
export async function fixtureSources(): Promise<ReadonlyMap<string, string>> {
  const sources = import.meta.glob('../../../fixtures/file-workspace/**/*.rs', { query: '?raw', import: 'default' });
  const entries = await Promise.all(Object.entries(sources).map(async ([path, read]) => [path.split('/file-workspace/')[1], await read() as string] as const));
  return new Map(entries);
}
