/* Keep the original PDF bytes with an editable continuation report. */
(()=>{
 const extra=['sourcePdf','sourcePdfName'];metaKeys.push(...extra);
 for(const key of extra){const input=document.createElement('input');input.type='hidden';input.id=key;($('identification')||$('meta')).append(input)}
 const label=document.createElement('label');label.className='filebtn secondary';label.textContent='Importar vistoria em PDF';
 const input=document.createElement('input');input.type='file';input.accept='.pdf,application/pdf';input.hidden=true;input.id='importInspectionPdf';label.append(input);$('historySearch').before(label);
 const note=document.createElement('p');note.className='muted';note.textContent='Importe um PDF de até 20 MB. O original será preservado; os novos andamentos serão editáveis e anexados ao PDF exportado. Textos e fotos antigos não são convertidos em campos.';label.after(note);
 const source=document.createElement('div');source.className='photo';source.hidden=true;
 const name=document.createElement('p');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Baixar PDF original';source.append(name,button);($('identification')||$('meta')).append(source);
 function update(){source.hidden=!$('sourcePdf').value;name.textContent='Documento original: '+$('sourcePdfName').value}
 const previousFill=fill;fill=function(d){previousFill(d);update()};
 const previousBlank=blankReport;blankReport=function(){previousBlank();extra.forEach(k=>$(k).value='');update()};
 function bytesFromData(value){const base64=value.split(',')[1];if(!base64)throw Error('PDF original indisponível.');return Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}
 button.onclick=()=>{try{download(new Blob([bytesFromData($('sourcePdf').value)],{type:'application/pdf'}),$('sourcePdfName').value||'vistoria-original.pdf')}catch(e){notify(e.message)}};
 input.onchange=async()=>{const file=input.files[0];if(!file)return;await guarded(async()=>{
  if(file.size>20*1024*1024)throw Error('O PDF excede 20 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let pdf;try{pdf=await PDFLib.PDFDocument.load(bytes)}catch{throw Error('Não foi possível ler o PDF. Verifique se o arquivo está válido e sem senha.')}
  if(!pdf.getPageCount())throw Error('O PDF não contém páginas.');
  const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha na leitura do arquivo.'));reader.readAsDataURL(new Blob([bytes],{type:'application/pdf'}))});
  await persistCurrent();
  const meta=Object.fromEntries(metaKeys.map(k=>[k,'']));meta.title='Continuação — '+file.name.replace(/\.pdf$/i,'');meta.sourcePdf=src;meta.sourcePdfName=file.name;
  const record=Object.fromEntries(itemKeys.map(k=>[k,'']));Object.assign(record,{tag:'PDF IMPORTADO',area:'A confirmar',problem:'Relato inicial preservado no PDF original: '+file.name+'. Preencha a TAG e a área e registre novas descobertas em Andamento da análise.',priority:'Média',status:'Em acompanhamento',photos:[]});
  const document={version:1,meta,records:[record]},id=newId();
  const transaction=db.transaction('reports','readwrite');transaction.objectStore('reports').put({id,updated:new Date().toISOString(),document});await transactionDone(transaction);
  reset();activeReportId=id;fill(document);window.openSavedPointEditor();await persistCurrent();
  window.document.querySelector('[data-view="editor"]').click();notify('PDF importado. Informe a TAG, a área e a data da vistoria; acrescente os novos andamentos.');
 });input.value=''};
 const previousValid=valid;valid=function(d){return previousValid(d)&&(!d.meta.sourcePdf||typeof d.meta.sourcePdf==='string'&&/^data:application\/pdf;base64,[a-zA-Z0-9+/=]+$/.test(d.meta.sourcePdf))};
 update();
})();
