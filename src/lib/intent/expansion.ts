export const MAX_EXPANDED_FILES=24;
export const MAX_EXPANDED_SYMBOLS=4096;
export const EXPANSION_HELP='Click toggles this file. Ctrl-click or Ctrl+Enter/Space applies its new state to every eligible file in the loaded repository, including filtered or collapsed tree rows. Expansion is limited to 24 files and 4,096 symbols; existing open files are retained.';
export type ExpansionCandidate={id:string;path:string;symbolCount:number};
export function isBatchKey(event:Pick<KeyboardEvent,'ctrlKey'|'key'>):boolean {return event.ctrlKey&&(event.key==='Enter'||event.key===' ');}

/** Bounded disclosure only: never mutates file graph, camera, directory state or journal. */
export function toggleExpansion(current:ReadonlySet<string>,target:string,candidates:readonly ExpansionCandidate[],all=false):{expanded:Set<string>;notice:string} {
  const eligible=new Map(candidates.filter(file=>Number.isSafeInteger(file.symbolCount)&&file.symbolCount>0&&file.symbolCount<=MAX_EXPANDED_SYMBOLS).map(file=>[file.id,file]));
  const expanded=new Set([...current].filter(id=>eligible.has(id))),file=eligible.get(target);
  if(!file)return {expanded,notice:`This file has no expandable symbols within the ${MAX_EXPANDED_SYMBOLS.toLocaleString()}-symbol limit.`};
  if(expanded.has(target)){if(all)expanded.clear();else expanded.delete(target);return {expanded,notice:all?'Collapsed all eligible files.':''};}
  let symbols=[...expanded].reduce((count,id)=>count+eligible.get(id)!.symbolCount,0);
  const add=(file:ExpansionCandidate)=>{
    if(expanded.has(file.id))return true;
    if(expanded.size>=MAX_EXPANDED_FILES||symbols+file.symbolCount>MAX_EXPANDED_SYMBOLS)return false;
    expanded.add(file.id);symbols+=file.symbolCount;return true;
  };
  if(!add(file))return {expanded,notice:`Expansion limit: ${MAX_EXPANDED_FILES} files / ${MAX_EXPANDED_SYMBOLS.toLocaleString()} symbols. Close a file before opening another.`};
  if(all){for(const candidate of [...eligible.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))add(candidate);return {expanded,notice:`Expanded ${expanded.size} of ${eligible.size} eligible files.${expanded.size<eligible.size?` Limit: ${MAX_EXPANDED_FILES} files / ${MAX_EXPANDED_SYMBOLS.toLocaleString()} symbols.`:''}`};}
  return {expanded,notice:''};
}
