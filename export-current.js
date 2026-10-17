/* Commit the current complete point through the existing form validation before PDF export. */
(()=>{
 function hasPendingPoint(){
  if(editing!==null)return true;
  if(photos.length)return true;
  return itemKeys.some(k=>{const el=$(k);if(!el)return false;const value=el.value.trim();if(el.tagName==='SELECT')return value!==(el.querySelector('option[selected]')||el.options[0])?.value;return value!==String(el.defaultValue||'').trim()});
 }
 function preparePoint(){
  if(busy||historyBusy){notify('Aguarde a operação atual antes de gerar o PDF.');return false}
  if(!hasPendingPoint())return true;
  if(!$('form').reportValidity()){notify('Complete os campos obrigatórios do ponto para incluí-lo no PDF.');return false}
  for(const k of ['tag','area','problem'])if(!$(k).value.trim()){notify('Preencha TAG, área e condição encontrada para incluir o ponto no PDF.');$(k).focus();return false}
  if($('status').value==='Corrigido'&&(!$('completionDate').value||!$('completionWork').value.trim())){notify('Informe a data e o serviço realizado para concluir o ponto.');return false}
  if($('analysisDraft')?.value.trim())$('appendAnalysis').click();
  $('form').requestSubmit();
  // A successful existing submit resets the editor; otherwise abort the export.
  if(editing!==null||$('tag').value.trim()||$('problem').value.trim()||photos.length){notify('Não foi possível confirmar o ponto. Revise o formulário antes de baixar.');return false}
  return true;
 }
 const allPoints=document.createElement('button');allPoints.id='pdfAllPoints';allPoints.type='button';allPoints.textContent='Baixar PDF com todos os pontos';
 $('pdf').after(allPoints);
 allPoints.onclick=()=>guarded(async()=>{if(!ready())return;await persistCurrent();const snapshot=structuredClone(data());snapshot.meta.title=(snapshot.meta.title||'Relatório de vistoria técnica')+' — Todos os '+snapshot.records.length+' pontos';await exportReportDocuments([snapshot])});
 const previousRender=render;
 render=function(){previousRender();document.querySelectorAll('#entries [data-edit]').forEach(editButton=>{
  const index=Number(editButton.dataset.edit);const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Baixar PDF do ponto '+(index+1);
  button.onclick=()=>{if(!preparePoint())return;return guarded(async()=>{await persistCurrent();const snapshot=structuredClone(data());const point=snapshot.records[index];if(!point)return notify('Ponto não encontrado. Reabra a vistoria.');snapshot.records=[point];snapshot.meta.sourcePdf='';snapshot.meta.sourcePdfName='';snapshot.meta.title=(snapshot.meta.title||'Relatório de vistoria técnica')+' — Ponto '+(index+1)+' — '+point.tag;snapshot.exportPointNumber=index+1;delete snapshot.pending;await exportReportDocuments([snapshot])})};
  editButton.parentElement.append(button);
 })};
 render();
 for(const id of ['pdf','pdfAllPoints','pdfAll','pdfSelected']){const button=$(id);if(!button)continue;const previous=button.onclick;button.onclick=function(e){if(!preparePoint())return;return previous.call(this,e)}}
})();
