// Conciliação conservadora de três vias. Nunca publica ou elimina dados em conflito.
export function mergeReport(base, local, remote) {
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
  return fail(path,l===missing||r===missing?'delete-edit':'same-field');
 }
 if(![base,local,remote].every(d=>isObject(d)&&isObject(d.meta)&&ids(d.records)))return {document:null,conflicts:[{path:[],reason:'invalid-base-or-point-identity'}]};
 const document=walk(base,local,remote,[]);
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
