/* Groups persisted calibration documents without modifying historical readings. */
(function(root){
 const normalizeTag=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR');
 function collect(rows){
  const valid=rows.filter(r=>r.document?.calibration?.enabled===true);
  const assets=valid.filter(r=>r.document.calibration.kind==='asset').sort((a,b)=>b.updated.localeCompare(a.updated));
  const byTag=new Map();for(const a of assets){const c=a.document.calibration,t=normalizeTag(c.tag);if(t&&!byTag.has(t))byTag.set(t,c.assetId||'tag:'+t)}
  const groups=new Map();
  for(const row of valid){const c=row.document.calibration,t=normalizeTag(c.tag),key=c.assetId||byTag.get(t)||(t?'tag:'+t:'record:'+row.id);if(!groups.has(key))groups.set(key,{key,asset:null,calibrations:[],metadata:null});const g=groups.get(key);if(c.kind==='asset'){if(!g.asset||row.updated>g.asset.updated)g.asset=row}else g.calibrations.push(row)}
  for(const g of groups.values()){g.calibrations.sort((a,b)=>(b.document.calibration.date||'').localeCompare(a.document.calibration.date||'')||b.updated.localeCompare(a.updated));g.metadata=g.asset?.document.calibration||g.calibrations[0]?.document.calibration}
  return [...groups.values()].sort((a,b)=>normalizeTag(a.metadata.tag).localeCompare(normalizeTag(b.metadata.tag),'pt-BR',{numeric:true}));
 }
 root.ScaleRegistryCore={normalizeTag,collect};
})(typeof window==='undefined'?globalThis:window);
