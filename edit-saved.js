/* Edit points in any locally saved report without mixing reports or discarding drafts. */
(()=>{
 const picker=document.createElement('label');picker.className='wide';const pickerTitle=document.createElement('span');picker.append(pickerTitle);
 const select=document.createElement('select');select.id='savedPointPicker';picker.append(select);
 const hint=document.createElement('small');hint.className='muted';hint.textContent='Selecione um ponto de qualquer vistoria salva neste aparelho. O aplicativo abre a vistoria correspondente.';picker.append(hint);$('formTitle').after(picker);
 let choices=new Map(),pickerSignature='',pickerFocused=false;
 select.addEventListener('focus',()=>{pickerFocused=true});
 select.addEventListener('blur',()=>{pickerFocused=false;setTimeout(()=>refreshPicker(),200)});
 function pointLabel(r){return String(r.tag||'').trim()||'TAG não informada';}
 function otherSavedReports(items,currentId){return items.filter(row=>row.id!==currentId&&Array.isArray(row.document?.records)&&row.document.records.length);}
 function refreshPicker(){
  // Android may close or jump its native picker when its options are rebuilt.
  // Keep a stable snapshot while it is focused and only change DOM when options change.
  if(pickerFocused)return;
  window.VistoriaPointIds?.ensure(records,activeReportId);
  const others=otherSavedReports(historyItems,activeReportId).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const total=records.length+others.reduce((sum,row)=>sum+row.document.records.length,0);
  const title='Ponto salvo para editar ('+total+' '+(total===1?'ponto':'pontos')+' em '+(others.length+(records.length?1:0))+' vistoria(s))';
  if(picker.hidden!==!total)picker.hidden=!total;
  if(pickerTitle.textContent!==title)pickerTitle.textContent=title;
  const nextChoices=new Map();
  function addPoints(points,reportId,current,reference){
   points.forEach((r,i)=>{const key=JSON.stringify([reportId,r.pointId||'index:'+i]);const tag=pointLabel(r);nextChoices.set(key,{reportId,pointId:r.pointId,index:i,current,tag,reference,area:r.area,status:r.status})});
  }
  addPoints(records,activeReportId,true,$('number').value||'Vistoria aberta');
  for(const row of others){
   const meta=row.document.meta||{},points=row.document.records.map(r=>({pointId:r.pointId,tag:r.tag,area:r.area,status:r.status}));
   window.VistoriaPointIds?.ensure(points,row.id);
   addPoints(points,row.id,false,[meta.number,meta.workOrder?'OS '+meta.workOrder:'',meta.date].filter(Boolean).join(' · ')||'Vistoria salva');
  }
  const ordered=[...nextChoices].sort((a,b)=>a[1].tag.localeCompare(b[1].tag,'pt-BR',{numeric:true})||a[0].localeCompare(b[0]));
  const signature=JSON.stringify(ordered.map(([key,p])=>[key,p.tag]));
  choices=nextChoices;
  if(signature!==pickerSignature){
   const fragment=document.createDocumentFragment();
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Selecione um ponto salvo';fragment.append(placeholder);
   for(const [key,p] of ordered){const option=document.createElement('option');option.value=key;option.textContent=p.tag;fragment.append(option)}
   select.replaceChildren(fragment);pickerSignature=signature;
  }
  const selected=editing===null?'':([...choices].find(([,p])=>p.current&&p.index===editing)?.[0]||'');
  if(select.value!==selected)select.value=selected;
 }
 function hasPendingDraft(){
  const defaults={condition:'',priority:'Média',status:'Pendente'};
  return editing!==null||photos.length||itemKeys.some(k=>{const el=$(k);if(!el)return false;const value=el.value.trim();if(!value)return false;if(el.tagName==='SELECT')return value!==(el.querySelector('option[selected]')||el.options[0])?.value;return value!==(defaults[k]||'')});
 }
 function openPoint(i){if(!records[i])return;$('entries').onclick({target:{dataset:{edit:String(i)}}});refreshPicker();save()}
 function pointIndex(points,target){return target.pointId?points.findIndex(r=>r.pointId===target.pointId):-1}
 async function openSavedReportPoint(target){
  await guarded(async()=>{
   await persistCurrent(); // Keep the previous report, including any unfinished form, under its original ID.
   const row=await requestResult(db.transaction('reports').objectStore('reports').get(target.reportId));
   if(!row)throw Error('Esta vistoria não está mais disponível. Atualize a lista.');
   const doc=structuredClone(row.document);
   window.VistoriaPointIds?.ensure(doc.records,row.id);
   const i=pointIndex(doc.records,target);
   if(i<0)throw Error('O ponto foi alterado ou excluído. Selecione novamente.');
   reset();activeReportId=row.id;fill(doc);
   if(hasPendingDraft()){
    await persistCurrent();
    if(editing!==i)notify('Vistoria aberta. Existe uma edição ou novo ponto em andamento; salve ou cancele antes de escolher outro ponto.');
    else notify('Edição existente recuperada.');
   }else{
    openPoint(i);await persistCurrent();
    notify('Ponto aberto na vistoria original. Use Salvar alteração para concluir.');
   }
   refreshPicker();document.dispatchEvent(new CustomEvent('vistoria-point-editor-opened'));
  });
 }
 select.onchange=async()=>{const target=choices.get(select.value);pickerFocused=false;select.blur();if(!target){refreshPicker();return;}if(busy||historyBusy){refreshPicker();notify('Aguarde a operação em andamento.');return}if([...choices.values()].filter(p=>p.tag===target.tag).length>1&&!confirm('Existem registros com a mesma TAG. Abrir '+target.tag+'?\n'+[target.reference,target.area,target.status,'Ponto '+(target.index+1)].filter(Boolean).join(' · '))){refreshPicker();return}if(target.reportId===activeReportId){window.VistoriaPointIds?.ensure(records,activeReportId);const i=pointIndex(records,target);if(i<0){refreshPicker();return notify('O ponto foi alterado. Selecione novamente.')}openPoint(i);return}select.disabled=true;try{await openSavedReportPoint(target)}finally{select.disabled=false;refreshPicker()}};
 const originalRender=render;render=function(){originalRender();refreshPicker()};
 const originalReset=reset;reset=function(){originalReset();refreshPicker()};
 const originalFill=fill;fill=function(d){originalFill(d);refreshPicker()};
 window.openSavedPointEditor=function(){if(!hasPendingDraft()&&records.length)openPoint(0);refreshPicker()};
 document.addEventListener('vistoria-saved',refreshPicker);
 refreshPicker();
})();
