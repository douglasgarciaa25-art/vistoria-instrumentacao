/* Edit points in any locally saved report without mixing reports or discarding drafts. */
(()=>{
 const picker=document.createElement('label');picker.className='wide';const pickerTitle=document.createElement('span');picker.append(pickerTitle);
 const select=document.createElement('select');select.id='savedPointPicker';picker.append(select);
 const hint=document.createElement('small');hint.className='muted';hint.textContent='Selecione um ponto de qualquer vistoria salva neste aparelho. O aplicativo abre a vistoria correspondente.';picker.append(hint);$('formTitle').after(picker);
 const choices=new Map();
 function pointLabel(r,i){return String(i+1).padStart(2,'0')+'. '+(r.tag||'TAG não informada')+' — '+[r.area,r.status].filter(Boolean).join(' · ');}
 function otherSavedReports(items,currentId){return items.filter(row=>row.id!==currentId&&Array.isArray(row.document?.records)&&row.document.records.length);}
 function refreshPicker(){
  const others=otherSavedReports(historyItems,activeReportId);
  const total=records.length+others.reduce((sum,row)=>sum+row.document.records.length,0);
  picker.hidden=!total;pickerTitle.textContent='Ponto salvo para editar ('+total+' '+(total===1?'ponto':'pontos')+' em '+(others.length+(records.length?1:0))+' vistoria(s))';
  choices.clear();select.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Selecione um ponto salvo';select.append(placeholder);
  function addGroup(title,points,reportId,current){
   if(!points.length)return;const group=document.createElement('optgroup');group.label=title;
   points.forEach((r,i)=>{const option=document.createElement('option');const key=current?String(i):'saved:'+choices.size;option.value=key;option.textContent=pointLabel(r,i);choices.set(key,{reportId,pointId:r.pointId,index:i,current});group.append(option)});select.append(group);
  }
  // Current records always come from the live form, never the saved snapshot.
  addGroup('Vistoria aberta · '+($('number').value||'Sem referência'),records,activeReportId,true);
  for(const row of others){
   const meta=row.document.meta||{},points=row.document.records.map(r=>({pointId:r.pointId,tag:r.tag,area:r.area,status:r.status}));
   window.VistoriaPointIds?.ensure(points,row.id);
   addGroup([meta.title||'Vistoria',meta.number,meta.workOrder?'OS '+meta.workOrder:'',meta.date].filter(Boolean).join(' · '),points,row.id,false);
  }
  select.value=editing===null?'':String(editing);
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
 select.onchange=async()=>{const target=choices.get(select.value);if(!target)return;if(busy||historyBusy){refreshPicker();notify('Aguarde a operação em andamento.');return}if(target.current){openPoint(target.index);return}select.disabled=true;try{await openSavedReportPoint(target)}finally{select.disabled=false;refreshPicker()}};
 const originalRender=render;render=function(){originalRender();refreshPicker()};
 const originalReset=reset;reset=function(){originalReset();refreshPicker()};
 const originalFill=fill;fill=function(d){originalFill(d);refreshPicker()};
 window.openSavedPointEditor=function(){if(!hasPendingDraft()&&records.length)openPoint(0);refreshPicker()};
 document.addEventListener('vistoria-saved',refreshPicker);
 refreshPicker();
})();
