import type { AnalysisIdentity, ByteRange, SourceAnalysisDto, SyntaxDialect } from '../../backends/SyntaxAnalysis';
import type { GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';

export const SYNTAX_DIALECTS: SyntaxDialect[] = ['rust','typescript','tsx','javascript','jsx','python','lua','kotlin','zig','csharp','c','cpp','odin','svelte5'];
export const SYNTAX_DECLARATIONS = new Set(['function','method','class','struct','enum','interface','trait','implementation','module','type_alias','binding','field','variant','parameter','component','snippet']);
export const QUALIFICATION_GAPS = 'Supported subset only: no Python type/default evaluation, Kotlin context resolution, or C width evaluation. Kotlin context destructuring properties are excluded. Svelte file/snippet containment does not describe lexical visibility; anonymous expression declarations and newer generic snippets/directives are not fully qualified. Calls and types remain unresolved syntax evidence. Kotlin/Zig declaration and ownership results and C++/Odin callable inventories still have known extraction gaps. Complete language or Passeur parity is not claimed.';
export function coverageLabel(value: string): string {
  return value === 'supported_subset' ? 'Supported subset' : value === 'incomplete' ? 'Incomplete' : value === 'unavailable' ? 'Unavailable' : 'Outside captured scope';
}
export function dialectChoices(path: string): SyntaxDialect[] {
  return path.endsWith('.h') ? ['c','cpp'] : path.endsWith('.js') && !path.endsWith('.svelte.js') ? ['jsx'] : [];
}
export function restoredDialectOverrides(analysis: SourceAnalysisDto | null): Map<string,SyntaxDialect> {
  return new Map(analysis?.identity.files.filter(file=>dialectChoices(file.path).includes(file.dialect)).map(file=>[file.path,file.dialect]) ?? []);
}
export function canonicalIdentity(identity: AnalysisIdentity): AnalysisIdentity {
  return { schemaVersion: identity.schemaVersion, sourceScope: identity.sourceScope, parser: identity.parser, extractor: identity.extractor, discoveryComplete: identity.discoveryComplete,
    files: identity.files.map(file => ({ path:file.path,dialect:file.dialect,grammars:file.grammars.map(grammar=>({dialect:grammar.dialect,grammar:grammar.grammar})),sourceDigest:file.sourceDigest,structureDigest:file.structureDigest,byteLength:file.byteLength,coverage:file.coverage })) };
}
export function validIdentity(identity: AnalysisIdentity | undefined): identity is AnalysisIdentity {
  if (!identity || identity.schemaVersion !== 1 || identity.sourceScope !== 'captured_multilingual_sources_v1' || typeof identity.parser !== 'string' || typeof identity.extractor !== 'string' || typeof identity.discoveryComplete !== 'boolean' || !Array.isArray(identity.files) || identity.files.length > 4096) return false;
  return new Set(identity.files.map(file=>file.path)).size === identity.files.length && identity.files.every(file => typeof file.path === 'string' && file.path.split('/').every(part=>part && part!=='.' && part!=='..' && !part.includes('\\')) && SYNTAX_DIALECTS.includes(file.dialect) && Number.isSafeInteger(file.byteLength) && file.byteLength>=0 && file.byteLength<=2*1024*1024 && ['supported_subset','incomplete','unavailable'].includes(file.coverage) && /^sha256:[a-f0-9]{64}$/.test(file.sourceDigest) && /^sha256:[a-f0-9]{64}$/.test(file.structureDigest) && Array.isArray(file.grammars) && file.grammars.every(grammar=>SYNTAX_DIALECTS.includes(grammar.dialect) && typeof grammar.grammar==='string'));
}

/** Fail closed on contract drift; the caller retains the authoritative file graph and history. */
export function validateGraphAnalysis(graph: GraphSnapshotDto, analysis: SourceAnalysisDto | null): SourceAnalysisDto | null {
  if (![1,2].includes(graph.schemaVersion)) throw Error(`Unsupported graph schema ${graph.schemaVersion}. File overview and history remain available.`);
  if (graph.schemaVersion===1) return null;
  if (!analysis || analysis.schemaVersion!==1 || !validIdentity(analysis.identity) || !Array.isArray(analysis.files) || !Array.isArray(analysis.diagnostics)) throw Error('Unsupported or missing source-analysis metadata. Analyze again.');
  if (JSON.stringify(canonicalIdentity({...analysis.identity,files:analysis.files.map(file=>file.identity)}))!==JSON.stringify(canonicalIdentity(analysis.identity))) throw Error('Source-analysis identity and file inventory disagree.');
  const declared=new Map<string,{path:string;kind:string;name:string;complete:boolean}>();
  for (const file of analysis.files) {
    const validRange=(range:ByteRange)=>range && Number.isSafeInteger(range.startByte) && Number.isSafeInteger(range.endByte) && range.startByte>=0 && range.startByte<=range.endByte && range.endByte<=file.identity.byteLength;
    if (!Array.isArray(file.declarations) || file.declarations.length>4096 || !Array.isArray(file.relations) || file.relations.length>8192 || !Array.isArray(file.diagnostics)) throw Error('Source-analysis inventory exceeds its contract.');
    for (const declaration of file.declarations) {
      if (declared.has(declaration.id) || !validRange(declaration.range) || !validRange(declaration.nameRange) || !SYNTAX_DECLARATIONS.has(declaration.kind) || !SYNTAX_DIALECTS.includes(declaration.dialect) || typeof declaration.name!=='string') throw Error('Invalid syntax declaration or byte range.');
      declared.set(declaration.id,{path:file.identity.path,kind:declaration.kind==='implementation'?'impl':declaration.kind,name:declaration.name,complete:declaration.headerComplete});
    }
    for (const fact of file.relations) if (!validRange(fact.range) || !validRange(fact.targetRange) || !['written_type','import_syntax','call_syntax','inheritance_syntax'].includes(fact.kind)) throw Error('Invalid syntax fact or byte range.');
  }
  const ids=new Set(graph.nodes.map(node=>node.id));
  if (ids.size!==graph.nodes.length) throw Error('Duplicate graph identities.');
  for (const node of graph.nodes) {
    if (node.kind==='workspace') continue;
    if (node.kind==='file' && analysis.files.some(file=>node.id===`file:${file.identity.path}` && node.label===file.identity.path)) continue;
    const declaration=declared.get(node.id);
    if (!declaration || !declaration.complete || node.sourceRange?.path!==declaration.path || node.kind!==declaration.kind || node.label!==declaration.name) throw Error('Graph and syntax declarations disagree. Analyze again.');
  }
  if (graph.edges.some(edge=>!ids.has(edge.sourceId)||!ids.has(edge.targetId)||edge.kind!=='contains'||edge.provenance!=='tree_sitter')) throw Error('Unsupported syntax graph relationships. Unresolved facts must not become edges.');
  return analysis;
}
