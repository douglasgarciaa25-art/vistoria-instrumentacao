/* Lixeira de pontos vinculada à vistoria. Só remove/restaura após ação explícita. */
(()=>{
 'use strict';
 let deletedPoints=[];
 const box=document.createElement('details');box.className='card';box.id='deleted-points-panel';
 const heading=document.createElement('summary');heading.textContent='Lixeira de pontos desta vistoria';box.append(heading);
 const info=document.createElement('p');info.className='muted';info.textContent='Os pontos excluídos e suas fotos continuam no relatório e no backup até serem restaurados. Evite ultrapassar 12 MB ao sincronizar com a equipe.';box.append(info);
 const list=document.createElement('div');box.append(list);$('entries').after(box);
 function draw(){
  list.replaceChildren();
  if(!deletedPoints.length){list.textContent='Nenhum ponto excluído nesta vistoria.';return;}
  for(const [index,item] of deletedPoints.entries()){
   const row=document.createElement('div');row.className='entry';
   const label=document.createElement('p');label.textContent=(item.point?.tag||'TAG não informada')+' — OS '+(item.point?.pointWorkOrder||$('workOrder').value||'Não informada')+' — '+new Date(item.deletedAt).toLocaleString('pt-BR');row.append(label);
   const button=document.createElement('button');button.type='button';button.textContent='Restaurar ponto e fotos';
   button.onclick=()=>{
    if(busy||historyBusy)return notify('Aguarde a operação atual.');
    if(!confirm('Restaurar este equipamento e suas fotos à vistoria atual?'))return;
    const point=deletedPoints[index]?.point;
    if(!point)return;
    window.VistoriaPointIds?.ensure(records,activeReportId);
    if(records.some(r=>r.pointId===point.pointId))return notify('Este equipamento já está presente na vistoria.');
    records.push(structuredClone(point));deletedPoints.splice(index,1);render();save();notify('Ponto restaurado. Sincronize para registrar a restauração na equipe.');
   };
   row.append(button);list.append(row);
  }
 }
 const priorData=data;data=function(){const doc=priorData();doc.deletedPoints=structuredClone(deletedPoints);return doc;};
 const priorFill=fill;fill=function(doc){deletedPoints=Array.isArray(doc?.deletedPoints)?structuredClone(doc.deletedPoints).filter(x=>x&&x.point&&Array.isArray(x.point.photos)&&typeof x.deletedAt==='string'):[];const result=priorFill(doc);draw();return result;};
 const previousBlank=blankReport;blankReport=function(){deletedPoints=[];const result=previousBlank();draw();return result;};
 const previousRender=render;render=function(){previousRender();draw();};
 function removePoint(index){
  if(busy||historyBusy)return notify('Aguarde a operação atual.');
  if(!records[index])return;
  if(!confirm('Enviar este ponto e suas fotos para a lixeira da vistoria?'))return;
  window.VistoriaPointIds?.ensure(records,activeReportId);
  deletedPoints.push({point:structuredClone(records[index]),deletedAt:new Date().toISOString()});
  records.splice(index,1);
  if(editing===index)reset();else if(editing!==null&&editing>index)editing--;
  render();save();notify('Ponto movido para a lixeira da vistoria.');
 }
 const priorClick=$('entries').onclick;
 $('entries').onclick=e=>{
  const index=e.target.dataset.delete;
  if(index!==undefined){removePoint(Number(index));return;}
  return priorClick(e);
 };
 const delEditing=$('deleteEditingPoint');
 if(delEditing)delEditing.addEventListener('click',e=>{
  if(editing===null)return;
  e.preventDefault();e.stopImmediatePropagation();removePoint(editing);
 },true);
 draw();
})();
