// Busca somente metadados de OS em relatórios autorizados, sem carregar fotos.
const norm=value=>String(value).normalize('NFC').toLocaleLowerCase('pt-BR');
export function parseTeamOsQuery(value,mode='partial',offset=0){
 if(typeof value!=='string')throw Error('OS inválida');
 const query=value.trim();
 if(query.length<2||query.length>80||! /^[\p{L}\p{N} ._/-]+$/u.test(query))throw Error('Informe pelo menos 2 caracteres válidos da OS');
 if(mode!=='partial'&&mode!=='exact')throw Error('Modo de pesquisa inválido');
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('Página inválida');
 return {query,mode,offset};
}
export function findOsMatches(document,{query,mode}){
 if(!document||typeof document!=='object'||Array.isArray(document))throw Error('Relatório inválido');
 const isMatch=os=>typeof os==='string'&&os.length>0&&(mode==='exact'?norm(os.trim())===norm(query):norm(os).includes(norm(query)));
 const matches=[];
 const general=document.meta?.workOrder;
 if(isMatch(general))matches.push({scope:'report',os:general.trim(),pointId:null,tag:null});
 if(!Array.isArray(document.records))throw Error('Registros inválidos');
 for(let i=0;i<document.records.length;i++){
  const point=document.records[i];
  if(!point||typeof point!=='object')continue;
  const os=point.pointWorkOrder;
  if(isMatch(os))matches.push({
   scope:'point',os:os.trim(),pointId:typeof point.pointId==='string'?point.pointId:null,
   tag:typeof point.tag==='string'?point.tag.slice(0,140):null
  });
 }
 return matches;
}
export async function scanTeamOsPage(rows,args,loadDoc){
 if(!Array.isArray(rows)||rows.length>20)throw Error('Página excedida');
 const matches=[];
 let truncated=false;
 for(let i=0;i<rows.length;i+=4){
  const group=rows.slice(i,i+4);
  const results=await Promise.all(group.map(async row=>{
   if(!row?.drive_file_id)return [];
   const doc=await loadDoc(row.drive_file_id);
   return findOsMatches(doc,args).map(x=>({
    report_id:row.report_id,revision:row.revision,...x
   }));
  }));
  for(const result of results)for(const match of result){
   if(matches.length<200)matches.push(match);else truncated=true;
  }
 }
 return {matches,truncated};
}
