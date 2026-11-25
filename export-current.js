/* PDF export is read-only: incomplete editor drafts must not block registered points. */
(()=>{
 const allPoints=document.createElement('button');allPoints.id='pdfAllPoints';allPoints.type='button';allPoints.textContent='Baixar PDF com todos os pontos';
 $('pdf').after(allPoints);
 allPoints.onclick=()=>guarded(async()=>{if(!ready())return;await persistCurrent();const snapshot=structuredClone(data());snapshot.meta.title=(snapshot.meta.title||'Relatório de vistoria técnica')+' — Todos os '+snapshot.records.length+' pontos';await exportReportDocuments([snapshot],[activeReportId])});
 const previousRender=render;
 render=function(){previousRender();document.querySelectorAll('#entries [data-edit]').forEach(editButton=>{
  const index=Number(editButton.dataset.edit);const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Baixar PDF do ponto '+(index+1);
  button.onclick=()=>guarded(async()=>{await persistCurrent();const snapshot=structuredClone(data());const point=snapshot.records[index];if(!point)return notify('Ponto não encontrado. Reabra a vistoria.');snapshot.records=[point];snapshot.meta.sourcePdf='';snapshot.meta.sourcePdfName='';snapshot.meta.title=(snapshot.meta.title||'Relatório de vistoria técnica')+' — Ponto '+(index+1)+' — '+point.tag;snapshot.exportPointNumber=index+1;delete snapshot.pending;await exportReportDocuments([snapshot])});
  editButton.parentElement.append(button);
 })};
 render();
 // Keep the original export handlers; only explicit form submission validates completion.
})();
