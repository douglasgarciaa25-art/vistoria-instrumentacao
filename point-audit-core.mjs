// Compara somente identificadores permanentes. Dados legados sem ID não produzem autoria presumida.
const fieldKeys=['tag','pointWorkOrder','area','equipment','condition','priority','status','problem','impact','action','owner','deadline','completionDate','completionWork','completionBy'];
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{8,160}$/.test(id);
const summary=p=>Object.fromEntries(fieldKeys.map(k=>[k,String(p?.[k]??'')]));
export function pointChanges(before,after){
 const previous=Array.isArray(before?.records)?before.records:[];
 const next=Array.isArray(after?.records)?after.records:[];
 const seen=new Set(),old=new Map(),events=[];
 for(const p of previous)if(validId(p?.pointId)&&!old.has(p.pointId))old.set(p.pointId,p);
 for(const p of next){
  const id=p?.pointId;
  if(!validId(id))continue; // Clientes antigos: nunca inferir a identidade
  if(seen.has(id))throw Error('Identificador de equipamento duplicado');
  seen.add(id);
  const was=old.get(id);
  if(!was){
   // A primeira sincronização de uma vistoria antiga não prova autoria dos pontos
   if(!before)events.push({point_id:id,action:'created',tag:String(p.tag||'').slice(0,200),work_order:String(p.pointWorkOrder||after.meta?.workOrder||'').slice(0,100),current_status:String(p.status||'').slice(0,80)});
   continue;
  }
  const oldStatus=String(was.status||''),newStatus=String(p.status||'');
  let action='';
  if(oldStatus!=='Corrigido'&&newStatus==='Corrigido')action='completed';
  else if(oldStatus==='Corrigido'&&newStatus!=='Corrigido')action='reopened';
  else if(JSON.stringify(summary(was))!==JSON.stringify(summary(p)))action='edited';
  if(action)events.push({point_id:id,action,tag:String(p.tag||'').slice(0,200),work_order:String(p.pointWorkOrder||after.meta?.workOrder||'').slice(0,100),previous_status:oldStatus.slice(0,80),current_status:newStatus.slice(0,80)});
 }
 for(const [id,p] of old)if(!seen.has(id))events.push({point_id:id,action:'deleted',tag:String(p.tag||'').slice(0,200),work_order:String(p.pointWorkOrder||before?.meta?.workOrder||'').slice(0,100),previous_status:String(p.status||'').slice(0,80)});
 if(events.length>500)throw Error('Quantidade de alterações por revisão excedida');
 return events;
}
