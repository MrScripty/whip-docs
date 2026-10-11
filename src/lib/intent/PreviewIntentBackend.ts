import type { GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import type { AppendIntent, IntentBackend, IntentRecord } from './types';
import { PREVIEW_UPSTREAM } from './previewFixture.ts';

export const PREVIEW_STORAGE_KEY = 'whip-docs.intent-preview.v2';
export const LEGACY_PREVIEW_STORAGE_KEY = 'whip-docs.intent-preview.v1';
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type StoredRecord = { schemaVersion: 2; record: IntentRecord };

/** Cryptographic source digest; source bytes remain ephemeral. */
export async function fingerprint(source: string): Promise<string> {
  return digestBytes(new TextEncoder().encode(source));
}

/** Explicit browser fixture only. Native persistence is implemented separately in Rust. */
export class PreviewIntentBackend implements IntentBackend {
  private storage: StoragePort;
  private graph: GraphSnapshotDto;
  private exactSources: ReadonlyMap<string, string>;
  constructor(storage: StoragePort, graph: GraphSnapshotDto, exactSource: string | ReadonlyMap<string, string>) {
    this.storage = storage; this.graph = structuredClone(graph); this.exactSources = typeof exactSource === 'string' ? new Map([[graph.nodes.find(node => node.kind === 'file')?.sourceRange?.path ?? '', exactSource]]) : new Map(exactSource);
  }

  private read(): StoredRecord[] {
    if (this.storage.getItem(LEGACY_PREVIEW_STORAGE_KEY) !== null) throw new Error('A legacy preview journal retained source bodies. Export and review it separately, then remove that old preview key yourself before using this version. It was not copied or deleted.');
    const value = this.storage.getItem(PREVIEW_STORAGE_KEY);
    if (value === null) return [];
    const decoded: unknown = JSON.parse(value);
    if (!Array.isArray(decoded) || decoded.some(row => !validStoredRecord(row))) throw new Error('The preview journal is invalid. It was left unchanged.');
    const rows = decoded as StoredRecord[];
    const prior = new Map<string, StoredRecord>();
    for (const { record } of rows) {
      if (prior.has(record.id)) throw new Error('Duplicate preview journal ID. Nothing was changed.');
      if (record.kind === 'original') {
        if (record.parentId !== null || record.originalId !== record.id) throw new Error('Invalid original binding. Nothing was changed.');
      } else {
        const original = prior.get(record.originalId);
        if (!original || original.record.kind !== 'original' || record.parentId !== original.record.id || JSON.stringify(original.record.symbol) !== JSON.stringify(record.symbol) || JSON.stringify(original.record.snapshot) !== JSON.stringify(record.snapshot)) throw new Error('Invalid derivative binding. Nothing was changed.');
      }
      prior.set(record.id, { schemaVersion: 2, record });
    }
    return rows;
  }

  private fingerprints() {
    return Promise.all([...this.exactSources].map(async ([path, source]) => ({ path, contentHash: await fingerprint(source), byteLength: new TextEncoder().encode(source).length })));
  }

  async listRecords(): Promise<IntentRecord[]> {
    const files = await this.fingerprints();
    const worktreeDigest = await sourceSetDigest(files);
    return this.read().filter(({ record }) => record.symbol.sourceRoot === this.graph.sourceRoot).map(({ record }) => {
      const hash = files.find(file => file.path === record.symbol.sourceRange.path)?.contentHash;
      const node = this.graph.nodes.find(node => node.id === record.symbol.nodeId);
      return { ...record, bindingStatus: !node || !hash ? 'missing' : record.snapshot.contentHash === hash && node.label === record.symbol.label && node.kind === record.symbol.kind && JSON.stringify(node.sourceRange) === JSON.stringify(record.symbol.sourceRange) && record.snapshot.worktreeDigest === worktreeDigest && JSON.stringify(record.snapshot.structuralSnapshot) === JSON.stringify(structureFor(this.graph, record.symbol.sourceRange.path)) ? 'current' : 'stale' };
    });
  }

  async appendRecord(input: AppendIntent): Promise<IntentRecord> {
    if (input.expectedAnalysisAt !== this.graph.generatedAt) throw new Error('Analysis changed. Select the symbol again.');
    if (!['original', 'interpretation', 'proposal'].includes(input.kind)) throw new Error('Unknown intent record kind.');
    if (!input.text.trim() || new TextEncoder().encode(input.text).length > 16 * 1024) throw new Error('Enter nonblank text within the 16 KiB limit.');
    const node = this.graph.nodes.find(node => node.id === input.nodeId);
    if (!node?.sourceRange || ['file', 'workspace', 'crate'].includes(node.kind)) throw new Error('Select a symbol first.');
    const source = this.exactSources.get(node.sourceRange.path);
    if (source === undefined) throw new Error('Source is unavailable for this fixture symbol.');
    const hash = await fingerprint(source);
    const worktreeDigest = await sourceSetDigest(await this.fingerprints());
    // Re-read after async hashing, then append without another asynchronous gap.
    const rows = this.read();
    const parent = rows.find(row => row.record.id === input.parentId)?.record;
    if (input.kind === 'original' && input.parentId !== null) throw new Error('Original intent cannot have a parent.');
    if (input.kind !== 'original' && (!parent || parent.kind !== 'original' || parent.symbol.nodeId !== node.id)) throw new Error('Choose an original intent on this symbol.');
    const symbol = { nodeId: node.id, label: node.label, kind: node.kind, sourceRange: node.sourceRange, sourceRoot: this.graph.sourceRoot };
    const structuralSnapshot = structureFor(this.graph, node.sourceRange.path);
    if (parent && (parent.snapshot.contentHash !== hash || parent.snapshot.worktreeDigest !== worktreeDigest || JSON.stringify(parent.symbol) !== JSON.stringify(symbol) || JSON.stringify(parent.snapshot.structuralSnapshot) !== JSON.stringify(structuralSnapshot))) throw new Error('Source or selection changed. Historical intent is not relinked.');
    const now = new Date().toISOString();
    const id = `preview-${crypto.randomUUID()}`;
    const record: IntentRecord = {
      id, kind: input.kind, text: input.text, parentId: input.parentId, originalId: parent?.id ?? id, createdAt: now,
      symbol: parent?.symbol ?? symbol,
      snapshot: parent?.snapshot ?? {
        contentHash: hash, hashAlgorithm: 'sha256', byteLength: new TextEncoder().encode(source).length,
        capturedAt: now, analysisAt: this.graph.generatedAt, precision: 'structural_snapshot_symbol_range_unverified',
        repositoryRevision: this.graph.generatedAt === `fixture:${PREVIEW_UPSTREAM}` ? PREVIEW_UPSTREAM : null, worktreeDigest, worktreeDigestScope: 'analyzed_rust_sources',
        structuralSnapshot,
      },
      bindingStatus: 'current',
    };
    this.storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify([...rows, { schemaVersion: 2, record }]));
    return structuredClone(record);
  }
}

function validStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<StoredRecord>;
  const record = row.record;
  if (Object.keys(row).some(key => !['schemaVersion', 'record'].includes(key)) || row.schemaVersion !== 2) return false;
  if (record && Object.keys(record).some(key => !['id', 'kind', 'text', 'parentId', 'originalId', 'createdAt', 'symbol', 'snapshot', 'bindingStatus'].includes(key))) return false;
  if (!record || typeof record.id !== 'string' || typeof record.text !== 'string' || !record.text.trim() || new TextEncoder().encode(record.text).length > 16 * 1024) return false;
  if (!['original', 'interpretation', 'proposal'].includes(record.kind) || typeof record.originalId !== 'string' || typeof record.createdAt !== 'string') return false;
  if (!record.symbol || typeof record.symbol.nodeId !== 'string' || typeof record.symbol.sourceRoot !== 'string' || typeof record.symbol.label !== 'string' || !record.symbol.sourceRange?.path) return false;
  const snapshot = record.snapshot;
  if (snapshot && Object.keys(snapshot).some(key => !['contentHash', 'hashAlgorithm', 'byteLength', 'capturedAt', 'analysisAt', 'precision', 'repositoryRevision', 'worktreeDigest', 'worktreeDigestScope', 'structuralSnapshot'].includes(key))) return false;
  return Boolean(snapshot && snapshot.precision === 'structural_snapshot_symbol_range_unverified' && snapshot.hashAlgorithm === 'sha256' && /^sha256:[a-f0-9]{64}$/.test(snapshot.contentHash) && Number.isSafeInteger(snapshot.byteLength) && snapshot.byteLength >= 0 && /^sha256:[a-f0-9]{64}$/.test(snapshot.worktreeDigest) && snapshot.worktreeDigestScope === 'analyzed_rust_sources' && Array.isArray(snapshot.structuralSnapshot?.nodes) && Array.isArray(snapshot.structuralSnapshot?.edges));
}

export async function digestBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Same domain-separated, length-prefixed encoding as native source_set_digest. */
export async function sourceSetDigest(files: { path: string; contentHash: string; byteLength: number }[]): Promise<string> {
  const encode = new TextEncoder();
  const chunks: Uint8Array[] = [encode.encode('whip-docs:analyzed-rust-sources:v1\0')];
  const sorted = [...files].sort((a, b) => {
    const first = encode.encode(a.path), second = encode.encode(b.path);
    for (let i = 0; i < Math.min(first.length, second.length); i++) if (first[i] !== second[i]) return first[i] - second[i];
    return first.length - second.length;
  });
  const length = (value: number) => { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false); return bytes; };
  for (const file of sorted) {
    const path = encode.encode(file.path);
    chunks.push(length(path.length), path, length(file.byteLength), encode.encode(file.contentHash));
  }
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return digestBytes(bytes);
}

export function structureFor(graph: GraphSnapshotDto, path: string): IntentRecord['snapshot']['structuralSnapshot'] {
  const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const nodes = graph.nodes.filter(node => !['workspace', 'crate', 'file'].includes(node.kind) && node.sourceRange?.path === path).sort(byId);
  const ids = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => ids.has(edge.sourceId) && ids.has(edge.targetId)).sort(byId);
  return { nodes, edges };
}
