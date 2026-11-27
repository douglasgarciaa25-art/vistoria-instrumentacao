// Conciliação conservadora de três vias. Nunca publica ou elimina dados em conflito.
export function mergeReport(base, local, remote, resolutions = new Map()) {
 const missing=Symbol('missing'), conflicts=[];
 const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)?o[k]:missing;
 const equal=(a,b)=>{
  if(a===b)return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  if(isObject(a)&&isObject(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>equal(a[k],own(b,k)));}
  return false;
 };
 const fail=(path,why)=>{conflicts.push({path:[...path],reason:why});return missing;};
 const ids=a=>Array.isArray(a)&&a.every(p=>isObject(p)&&typeof p.pointId==='string'&&/^[A-Za-z0-9:_-]{8,160}$/.test(p.pointId))&&new Set(a.map(p=>p.pointId)).size===a.length;
 function walk(b,l,r,path){
  if(equal(l,r))return l;
  if(equal(b,l))return r;
  if(equal(b,r))return l;
  if(path.length===1&&path[0]==='deletedPoints'&&[b,l,r].every(a=>Array.isArray(a)&&a.every(x=>isObject(x)&&isObject(x.point)&&typeof x.point.pointId==='string'&&x.point.pointId)&&new Set(a.map(x=>x.point.pointId)).size===a.length)){
   const maps=[b,l,r].map(a=>new Map(a.map(x=>[x.point.pointId,x]))),order=[...new Set([...r,...l,...b].map(x=>x.point.pointId))];
   return order.map(id=>walk(...maps.map(map=>map.has(id)?map.get(id):missing),[...path,id])).filter(x=>x!==missing);
  }
  if(path.length===1&&path[0]==='records'){
   if(![b,l,r].every(ids))return fail(path,'point-identity');
   const maps=[b,l,r].map(a=>new Map(a.map(p=>[p.pointId,p])));
   const order=[...new Set([...r,...l,...b].map(p=>p.pointId))];
   const values=new Map();
   for(const id of order){const v=walk(...maps.map(m=>m.has(id)?m.get(id):missing),[...path,id]);if(v!==missing)values.set(id,v);}
   const common=b.map(p=>p.pointId).filter(id=>maps[1].has(id)&&maps[2].has(id));
   const core=a=>a.map(p=>p.pointId).filter(id=>common.includes(id));
   const lc=core(l),rc=core(r);
   if(!equal(lc,rc)&&!equal(lc,common)&&!equal(rc,common))return fail(path,'point-order');
   const chosen=!equal(lc,common)?l:r;
   return [...new Set([...chosen.map(p=>p.pointId),...order])].filter(id=>values.has(id)).map(id=>values.get(id));
  }
  if(isObject(b)&&isObject(l)&&isObject(r)){
   const keys=[...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])];
   const entries=[];
   for(const k of keys){const v=walk(own(b,k),own(l,k),own(r,k),[...path,k]);if(v!==missing)entries.push([k,v]);}
   return Object.fromEntries(entries);
  }
  const reason=l===missing||r===missing?'delete-edit':'same-field';
  const choice=resolutions.get(JSON.stringify(path));
  if(choice==='local')return l;
  if(choice==='remote')return r;
  const describe=v=>v===missing?'Ausente':typeof v==='string'&&!/^data:|^blob:/.test(v)?v.slice(0,500):Array.isArray(v)?v.length+' item(ns)':isObject(v)?'Registro':typeof v==='string'?'Anexo':String(v);
  conflicts.push({path:[...path],reason,local:describe(l),remote:describe(r)});
  return missing;
 }
 if(![base,local,remote].every(d=>isObject(d)&&isObject(d.meta)&&ids(d.records)))return {document:null,conflicts:[{path:[],reason:'invalid-base-or-point-identity'}]};
 const document=walk(base,local,remote,[]);
 if(!conflicts.length&&Array.isArray(document.deletedPoints)){
  const live=new Set(document.records.map(p=>p.pointId));
  if(document.deletedPoints.some(x=>live.has(x?.point?.pointId)))conflicts.push({path:['deletedPoints'],reason:'point-live-and-trash'});
 }
 return {document:conflicts.length?null:JSON.parse(JSON.stringify(document)),conflicts};
}

// Diferenças entre snapshots históricos; anexos são resumidos, nunca embutidos no log.
export function revisionChanges(before,after){
 const changes=[],missing=Symbol('missing');
 const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)?o[k]:missing;
 const equal=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i])))||(obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>equal(a[k],own(b,k))));
 const keyed=a=>Array.isArray(a)&&a.every(p=>obj(p)&&typeof p.pointId==='string'&&p.pointId)&&new Set(a.map(p=>p.pointId)).size===a.length;
 const display=v=>{if(v===missing)return 'Ausente';if(typeof v==='string')return /^data:|^blob:/.test(v)?'Anexo':v.slice(0,500);if(Array.isArray(v))return `${v.length} item(ns)`;if(obj(v))return 'Registro';return String(v);};
 function walk(a,b,path){
  if(equal(a,b))return;
  if(path.length===1&&path[0]==='records'&&keyed(a)&&keyed(b)){
   const am=new Map(a.map(p=>[p.pointId,p])),bm=new Map(b.map(p=>[p.pointId,p]));
   for(const id of new Set([...am.keys(),...bm.keys()]))walk(am.has(id)?am.get(id):missing,bm.has(id)?bm.get(id):missing,[...path,id]);
   const shared=a.map(p=>p.pointId).filter(id=>bm.has(id)),order=b.map(p=>p.pointId).filter(id=>am.has(id));
   if(!equal(shared,order))changes.push({path:['records','ordem'],before:shared.join(', '),after:order.join(', ')});
   return;
  }
  if(obj(a)&&obj(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(own(a,k),own(b,k),[...path,k]);return;}
  changes.push({path,before:display(a),after:display(b),changed:true});
 }
 if(!obj(before)||!obj(after))throw Error('Revisões indisponíveis');
 walk(before,after,[]);return changes;
}

// Somente campos de texto ausentes são recuperados, sem modificar anexos ou IDs.
export function repairLegacyReport(document,metaKeys,itemKeys){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 if(!object(document)||document.version!==1||!object(document.meta)||!Array.isArray(document.records))return null;
 const copy=structuredClone(document);
 const fields=(o,keys)=>{if(!object(o))return false;for(const k of keys)if(!Object.hasOwn(o,k))o[k]='';return true};
 const photos=group=>{if(!Array.isArray(group))return false;for(const p of group){if(!object(p)||typeof p.src!=='string')return false;if(!Object.hasOwn(p,'caption'))p.caption=''}return true};
 fields(copy.meta,metaKeys);
 for(const p of copy.records)if(!fields(p,itemKeys)||!photos(p.photos))return null;
 if(copy.pending!==undefined&&copy.pending!==null){const p=copy.pending;if(!object(p)||!fields(p.fields,itemKeys)||!photos(p.photos))return null;if(!Object.hasOwn(p,'editing'))p.editing=null}
 return copy;
}
// Concilia campos independentes. Com base comprovada, a edição local pendente
// prevalece no mesmo campo de texto não crítico. O chamador arquiva ambas as versões.
export function autoResolveReport(base,local,remote){
 const first=mergeReport(base,local,remote);
 if(!first.conflicts.length)return {...first,choices:[]};
 // Não presumir exclusão, identidade, ordem nem decisões técnicas divergentes.
 const sensitive=new Set(['status','condition','priority','finalizedAt','reopenedAt','completionDate','completionWork','completionBy','photos','deletedPoints','pending','checklistData','pointId','tag','equipment','pointWorkOrder']);
 if(first.conflicts.some(c=>c.reason!=='same-field'||c.path.some(k=>sensitive.has(k))))return {...first,choices:[]};
 const choices=first.conflicts.map(c=>({path:c.path,choice:'local'}));
 return {...mergeReport(base,local,remote,new Map(choices.map(c=>[JSON.stringify(c.path),c.choice]))),choices};
}

/* Envio incremental por campo e ID permanente, protegido pela revisão-base. */
const deltaObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const deltaKey=k=>typeof k==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(k)&&!['constructor','prototype','__proto__'].includes(k);
const deltaId=k=>typeof k==='string'&&/^[A-Za-z0-9:_-]{8,160}$/.test(k);
export function canonicalReport(v){
 if(Array.isArray(v))return '['+v.map(canonicalReport).join(',')+']';
 if(deltaObject(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalReport(v[k])).join(',')+'}';
 const s=JSON.stringify(v);if(s===undefined)throw Error('Valor inválido');return s;
}
function deltaIds(d){
 if(!deltaObject(d)||!deltaObject(d.meta)||!Array.isArray(d.records))throw Error('Documento inválido');
 const ids=d.records.map(p=>deltaObject(p)&&p.pointId);
 if(!ids.every(deltaId)||new Set(ids).size!==ids.length)throw Error('Identidade inválida');
 return ids;
}
export function applyReportDelta(base,changes){
 const ids=deltaIds(base);
 if(!Array.isArray(changes)||!changes.length||changes.length>1000)throw Error('Alterações inválidas');
 const result=structuredClone(base),points=new Map(ids.map((id,i)=>[id,result.records[i]])),seen=new Set();
 for(const op of changes){
  if(!deltaObject(op)||!deltaKey(op.key)||!['root','meta','point'].includes(op.scope))throw Error('Campo inválido');
  if(op.scope==='root'&&['meta','records','version'].includes(op.key)||op.scope==='point'&&op.key==='pointId')throw Error('Identidade protegida');
  if(op.scope==='point'&&!points.has(op.id)||op.scope!=='point'&&Object.hasOwn(op,'id'))throw Error('Ponto inválido');
  if((op.remove===true)===Object.hasOwn(op,'value'))throw Error('Operação inválida');
  const id=JSON.stringify([op.scope,op.id||'',op.key]);if(seen.has(id))throw Error('Campo duplicado');seen.add(id);
  const target=op.scope==='root'?result:op.scope==='meta'?result.meta:points.get(op.id);
  if(op.remove===true){if(!Object.hasOwn(target,op.key))throw Error('Campo inexistente');delete target[op.key];}
  else Object.defineProperty(target,op.key,{value:structuredClone(op.value),writable:true,enumerable:true,configurable:true});
 }
 deltaIds(result);return result;
}
export function buildReportDelta(base,next){
 try{
  const ids=deltaIds(base);if(JSON.stringify(ids)!==JSON.stringify(deltaIds(next))||base.version!==next.version)return null;
  const changes=[];
  function fields(a,b,scope,id,skip=[]){
   for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
    if(skip.includes(key))continue;
    const had=Object.hasOwn(a,key),has=Object.hasOwn(b,key);
    if(had&&has&&canonicalReport(a[key])===canonicalReport(b[key]))continue;
    if(!deltaKey(key)||changes.length>=1000)throw Error('Delta não suportado');
    changes.push({scope,...(id?{id}:{}),key,...(has?{value:b[key]}:{remove:true})});
   }
  }
  fields(base,next,'root',null,['version','meta','records']);fields(base.meta,next.meta,'meta',null);
  ids.forEach((id,i)=>fields(base.records[i],next.records[i],'point',id,['pointId']));
  if(!changes.length)return [];
  return canonicalReport(applyReportDelta(base,changes))===canonicalReport(next)?changes:null;
 }catch{return null;}
}
