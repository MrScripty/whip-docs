import snapshot from '../../../fixtures/mixed-workspace.snapshot.json';
import type { SourceAnalysisDto } from '../../backends/SyntaxAnalysis';
import type { FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';

export const mixedFiles=snapshot.files as FileRelationGraphSnapshotDto;
export const mixedSymbols=snapshot.overriddenSymbols as GraphSnapshotDto;
export const mixedAnalysis=snapshot.overriddenAnalysis as SourceAnalysisDto;
export async function mixedSources():Promise<ReadonlyMap<string,string>> {
  const readers=import.meta.glob('../../../fixtures/mixed-workspace/**/*',{query:'?raw',import:'default'});
  const wanted=new Set(mixedAnalysis.identity.files.map(file=>file.path));
  return new Map(await Promise.all(Object.entries(readers).filter(([path])=>wanted.has(path.split('/mixed-workspace/')[1])).map(async([path,read])=>[path.split('/mixed-workspace/')[1],await read() as string] as const)));
}
