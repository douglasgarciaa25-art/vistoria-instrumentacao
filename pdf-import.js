/* Identidade de PDFs nativos: nunca recriar uma vistoria a partir de uma cópia visual. */
function vistoriaPdfIdentity(pdf,filename=''){
 const title=String(pdf.getTitle()||'').trim();
 const subject=String(pdf.getSubject()||'');
 const prefix='VISTORIA-REF-V1:';
 let reference='';
 if(subject.startsWith(prefix)){try{reference=decodeURIComponent(subject.slice(prefix.length))}catch{}}
 const native=subject.startsWith(prefix)||/^Relatorio-vistoria-|^Vistorias-reunidas-/i.test(filename)||/^Continua[cç][aã]o\s*[-—]|^Vistorias reunidas\s*-/i.test(title);
 return {title,reference,native};
}
function vistoriaPdfMatch(identity,rows){
 if(identity.reference){
  const matches=rows.filter(r=>r.document?.meta?.number===identity.reference&&!r.document.meta.sourcePdf);
  return matches.length===1?matches[0]:null;
 }
 if(!identity.title||/^Continua[cç][aã]o\s*[-—]|^Vistorias reunidas\s*-/i.test(identity.title))return null;
 const normalize=s=>String(s||'').trim().replace(/[–—]/g,'-').replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 const title=normalize(identity.title);
 const matches=rows.filter(r=>!r.document?.meta?.sourcePdf&&normalize(r.document?.meta?.title)===title);
 return matches.length===1?matches[0]:null;
}
async function vistoriaPdfRecoveryId(identity,bytes){
 const key=identity.native&&identity.reference?new TextEncoder().encode('vistoria-reference:'+identity.reference):bytes;
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',key));
 return 'pdf-'+Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
/* Keep the original PDF bytes with an editable continuation report. */
(()=>{
 const extra=['sourcePdf','sourcePdfName'];metaKeys.push(...extra);
 for(const key of extra){const input=document.createElement('input');input.type='hidden';input.id=key;($('identification')||$('meta')).append(input)}
 const label=document.createElement('label');label.className='filebtn secondary';label.textContent='Importar vistoria em PDF';
 const input=document.createElement('input');input.type='file';input.accept='.pdf,application/pdf';input.hidden=true;input.id='importInspectionPdf';label.append(input);$('historySearch').before(label);
 const note=document.createElement('p');note.className='muted';note.textContent='O aplicativo procura a vistoria original no aparelho e na nuvem. Se não encontrar, você poderá preservar o PDF e criar uma continuação local, sem substituir a vistoria original nem publicar outra automaticamente.';label.after(note);
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
  await persistCurrent();
  const identity=vistoriaPdfIdentity(pdf,file.name);
  const readRows=()=>requestResult(db.transaction('reports').objectStore('reports').getAll());
  let rows=await readRows(),existing=vistoriaPdfMatch(identity,rows);
  if(!existing&&identity.native&&window.VistoriaGoogleDrive?.receiveForPdf){
   notify('Procurando a vistoria original na nuvem…');
   await window.VistoriaGoogleDrive.receiveForPdf();
   rows=await readRows();existing=vistoriaPdfMatch(identity,rows);
  }
  if(existing){
   if(!identity.reference&&!confirm('Existe uma vistoria com este título: '+(existing.document.meta.number||existing.document.meta.title)+'. Abrir o registro salvo em vez de importar uma cópia?'))return;
   reset();activeReportId=existing.id;fill(existing.document);window.openSavedPointEditor?.();
   window.document.querySelector('[data-view="editor"]').click();
   notify('Vistoria existente aberta. O PDF não criou outro registro.');return;
  }
  const id=await vistoriaPdfRecoveryId(identity,bytes);
  const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha na leitura do arquivo.'));reader.readAsDataURL(new Blob([bytes],{type:'application/pdf'}))});
  const recovered=rows.find(r=>r.id===id||r.document?.meta?.sourcePdf===src);
  if(recovered){
   reset();activeReportId=recovered.id;fill(recovered.document);window.openSavedPointEditor?.();
   window.document.querySelector('[data-view="editor"]').click();
   notify('PDF já importado. Continuação existente aberta, sem duplicar.');return;
  }
  const trashed=await requestResult(db.transaction('trash').objectStore('trash').getAll());
  const marker=await requestResult(db.transaction('draft').objectStore('draft').get('deleted-report:'+id));
  if(marker||trashed.some(r=>r.id===id||r.document?.meta?.sourcePdf===src||(identity.reference&&r.document?.meta?.number===identity.reference)))throw Error('Esta vistoria ou PDF está na lixeira. Restaure o registro existente antes de importar.');
  const message=identity.native?'Registro editável original não localizado. Deseja preservar este PDF e criar uma continuação somente local? Os pontos e fotos anteriores permanecerão no PDF original; não serão convertidos em campos editáveis. A continuação não será publicada automaticamente.':'Importar como documento externo separado? O original ficará disponível para download, sem ser concatenado ao relatório. A continuação será inicialmente local.';
  if(!confirm(message))return;
  const meta=Object.fromEntries(metaKeys.map(k=>[k,'']));meta.title='Continuação — '+(identity.title&&!/^Continua[cç][aã]o\s*[-—]/i.test(identity.title)?identity.title:file.name.replace(/\.pdf$/i,''));meta.sourcePdf=src;meta.sourcePdfName=file.name;
  const record=Object.fromEntries(itemKeys.map(k=>[k,'']));Object.assign(record,{tag:'PDF IMPORTADO',area:'A confirmar',problem:'Relato inicial preservado no PDF original: '+file.name+'. Preencha a TAG e a área e registre novas descobertas em Andamento da análise.',priority:'Média',status:'Em acompanhamento',photos:[]});
  const document={version:1,meta,records:[record]};
  window.VistoriaGoogleDrive?.markPdfLocal(id);
  const transaction=db.transaction(['reports','trash','draft'],'readwrite'),store=transaction.objectStore('reports');
  let inserted=false;
  const check=store.get(id);
  check.onsuccess=()=>{if(check.result)return;const deleted=transaction.objectStore('draft').get('deleted-report:'+id);deleted.onsuccess=()=>{if(deleted.result)return;const old=transaction.objectStore('trash').get(id);old.onsuccess=()=>{if(old.result)return;store.add({id,updated:new Date().toISOString(),document});inserted=true;};};};
  await transactionDone(transaction);
  if(!inserted){notify('O registro mudou durante a importação. Atualize a lista e abra a vistoria existente.');await refreshHistory();return;}
  reset();activeReportId=id;fill(document);window.openSavedPointEditor();await persistCurrent();
  window.document.querySelector('[data-view="editor"]').click();notify('PDF importado. Informe a TAG, a área e a data da vistoria; acrescente os novos andamentos.');
 });input.value=''};
 const previousValid=valid;valid=function(d){return previousValid(d)&&(!d.meta.sourcePdf||typeof d.meta.sourcePdf==='string'&&/^data:application\/pdf;base64,[a-zA-Z0-9+/=]+$/.test(d.meta.sourcePdf))};
 update();
})();
