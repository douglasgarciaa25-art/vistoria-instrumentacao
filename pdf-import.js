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

// A cópia editável é armazenada no catálogo PDF sem alterar as páginas.
function vistoriaPdfEmbed(pdf,document,id){
 if(!id||!document||document.exportPointNumber)return;
 const snapshot=structuredClone(document);
 delete snapshot.meta.sourcePdf;delete snapshot.meta.sourcePdfName;delete snapshot.meta.sourcePdfRecovered;
 delete snapshot.pending;
 const bytes=new TextEncoder().encode(JSON.stringify({format:'vistoria-editable-v1',id,document:snapshot}));
 const key=PDFLib.PDFName.of('VistoriaEditableV1');
 pdf.catalog.set(key,pdf.context.register(pdf.context.flateStream(bytes)));
}
function vistoriaPdfReadEditable(pdf){
 const key=PDFLib.PDFName.of('VistoriaEditableV1');
 if(!pdf.catalog.has(key))return null;
 const stream=pdf.catalog.lookup(key,PDFLib.PDFRawStream);
 const bytes=PDFLib.decodePDFRawStream(stream).decode();
 if(bytes.length>32*1024*1024)throw Error('Dados editáveis do PDF excedem o limite de recuperação.');
 const packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(packet.format!=='vistoria-editable-v1'||!/^[a-zA-Z0-9_-]{1,100}$/.test(packet.id)||!packet.document||!Array.isArray(packet.document.records))throw Error('Dados editáveis do PDF inválidos.');
 return packet;
}
// Compatibilidade com PDFs visuais anteriores, produzidos com Helvetica/WinAnsi pelo app.
// Mantém a ordem de desenho de cada página, em vez de misturar as colunas da grade.
function vistoriaPdfLegacyEvents(pdf){
 const out=[],name=PDFLib.PDFName.of,decoder=new TextDecoder('windows-1252');
 for(const page of pdf.getPages()){
  const contents=page.node.Contents();
  if(!contents)continue;
  const streams=contents instanceof PDFLib.PDFArray?contents.asArray().map(ref=>pdf.context.lookup(ref)): [contents];
  let imageIndex=0;
  for(const stream of streams){
   if(!(stream instanceof PDFLib.PDFRawStream))continue;
   const raw=decoder.decode(PDFLib.decodePDFRawStream(stream).decode());
   for(const match of raw.matchAll(/\bBT\b([\s\S]*?)\bET\b|\/([^\s/]+)\s+Do\b/g)){
    if(match[2]){
     if(imageIndex++===0)continue; // logotipo do cabeçalho
     try{
      const xobjects=page.node.Resources().lookup(name('XObject'),PDFLib.PDFDict);
      const img=xobjects.lookup(name(match[2]),PDFLib.PDFRawStream);
      if(img.dict.get(name('Filter'))?.toString()!=='/DCTDecode')continue;
      const bytes=img.getContents();let binary='';
      for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
      out.push({photo:'data:image/jpeg;base64,'+btoa(binary)});
     }catch{}
     continue;
    }
    const block=match[1],font=block.match(/\/[^\s]+\s+([\d.]+)\s+Tf/),matrix=block.match(/(?:-?[\d.]+\s+){4}(-?[\d.]+)\s+(-?[\d.]+)\s+Tm/);
    if(!font||!matrix||Number(matrix[2])<55||Number(matrix[2])>740)continue;
    for(const hex of block.matchAll(/<([0-9a-f]*)>\s*Tj/gi)){
     const bytes=Uint8Array.from(hex[1].match(/../g)||[],x=>parseInt(x,16));
     out.push({size:Number(font[1]),text:decoder.decode(bytes),x:Number(matrix[1])});
    }
   }
  }
 }
 return out;
}
function vistoriaPdfLegacyFields(events,identity){
 const meta={},records=[];
 const labels={'DATA DA VISTORIA':'date','CÓDIGO / REFERÊNCIA':'number','ORDEM DE SERVIÇO (OS)':'workOrder','RESPONSÁVEL PELO LEVANTAMENTO':'author','EMPRESA / UNIDADE':'company','SETOR':'sector','OBJETIVO DO LEVANTAMENTO':'objective','EQUIPAMENTO':'equipment','CONDIÇÃO':'condition','SITUAÇÃO':'status','PRAZO PREVISTO':'deadline','CONDIÇÃO ENCONTRADA':'problem','ANDAMENTO DA ANÁLISE':'analysisHistory','IMPACTO / CONSEQUÊNCIA':'impact','AÇÃO RECOMENDADA':'action','SERVIÇO REALIZADO (RELATADO)':'actionService','PENDÊNCIAS E AÇÕES RECOMENDADAS':'actionPending','RESPONSÁVEL PELA AÇÃO':'owner','DATA DA CONCLUSÃO':'completionDate','SERVIÇO REALIZADO':'completionWork','EXECUTANTE INFORMADO (SEM VERIFICAÇÃO)':'completionBy','APROVAÇÃO REGISTRADA':'approver','DATA DA APROVAÇÃO':'approvalDate','HOMOLOGAÇÃO REGISTRADA':'homologator','DATA DA HOMOLOGAÇÃO':'homologDate','REVISÃO':'revision','ALTERAÇÕES':'revisionNote'};
 let point=null,field=null,section='',lastPhoto=null,headingParts=[],checklist=false;
 const date=value=>{const m=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:/^\d{4}-\d{2}-\d{2}$/.test(value)?value:''};
 const normalized=value=>/^(não informad[oa]|a definir|não verificad[oa])$/i.test(value.trim())?'':value.trim();
 function flush(){
  if(!field)return;
  let value=normalized(field.values.join(' '));
  if(/date$/i.test(field.key)||field.key==='deadline')value=date(value);
  if(field.key==='checklistData'){if(value)field.target.checks.push({label:field.label,value});}
  else if(value)field.target[field.key]=field.cont&&field.target[field.key]?field.target[field.key]+' '+value:value;
  field=null;
 }
 for(const event of events){
  if(event.photo){flush();if(point&&point.photos.length<8){lastPhoto={src:event.photo,caption:''};point.photos.push(lastPhoto);}continue;}
  const v=event.text.trim();if(!v)continue;
  if(event.size!==9)lastPhoto=null;
  if(event.size===16){flush();if(!point&&section!=='control')headingParts.push(v);continue;}
  if(event.size===12){
   flush();checklist=false;
   if(/^2\.\d+\s+Levantamento de campo$/i.test(v)){point={photos:[],checks:[]};records.push(point);section='point';}
   else if(/^3\.\s+Conclusão/i.test(v)){section='conclusion';point=null;field={target:meta,key:'conclusion',values:[]};}
   else if(/^Controle do documento/i.test(v)){section='control';point=null;}
   else if(/^Checklist\s*-\s*/i.test(v)&&point){point.inspectionType=v.replace(/^Checklist\s*-\s*/i,'');checklist=true;}
   continue;
  }
  if(event.size===14&&point){flush();const [tag,...area]=v.split(/\s+\|\s+/);if(area.length){point.tag=tag;point.area=area.join(' | ');}else if(!point.tag)point.tag=v;else if(point.area)point.area+=' '+v;else point.tag+=' '+v;continue;}
  if(event.size===9&&point&&/^PRIORIDADE:\s*/i.test(v)){flush();const value=v.replace(/^PRIORIDADE:\s*/i,'');point.priority=['A definir','Baixa','Média','Alta','Crítica','Não se aplica'].find(x=>x.toUpperCase()===value.toUpperCase())||'';continue;}
  if(event.size===9&&lastPhoto){const caption=v.match(/^Foto\s+\d+\.\d+(?:\s*-\s*(.*))?$/i);if(caption)lastPhoto.caption=caption[1]||'';else if(lastPhoto.caption)lastPhoto.caption+=' '+v;continue;}
  if(event.size===7||event.size===8){
   flush();const cont=/ \(CONT\.\)$/.test(v),label=v.replace(/ \(CONT\.\)$/,'');
   const key=labels[label];let target=point||meta;
   if(section==='control')target=meta;
   if(key==='workOrder'&&point){field={target:point,key:'pointWorkOrder',values:[],cont};}
   else if(key)field={target,key,values:[],cont};
   else if(checklist&&point&&event.size===8)field={target:point,key:'checklistData',label,values:[],cont};
   continue;
  }
  if(event.size===10&&field)field.values.push(v);
 }
 flush();meta.title=headingParts.join(' ')||identity.title||'';
 if(identity.reference)meta.number=identity.reference;
 for(const r of records){if(r.actionService||r.actionPending)r.action='SERVIÇO REALIZADO: '+(r.actionService||'')+'\nPENDÊNCIAS: '+(r.actionPending||'');delete r.actionService;delete r.actionPending;if(r.checks.length)r.checklistData=JSON.stringify(r.checks);delete r.checks;}
 if(!records.length||!records.every(r=>r.tag&&r.problem))return null;
 return {meta,records};
}

// A lixeira é consultada por ID/referência exatos; nunca pelo título genérico.
function vistoriaPdfTrashMatch(identity,id,src,rows){
 const exact=rows.filter(r=>r.id===id);
 if(exact.length===1)return exact[0];
 const matches=rows.filter(r=>r.document?.meta?.sourcePdf===src||(identity.reference&&r.document?.meta?.number===identity.reference));
 if(matches.length>1)throw Error('Mais de uma vistoria corresponde ao PDF na lixeira. Escolha o registro correto na lixeira.');
 return matches[0]||null;
}
function vistoriaPdfTeamTrash(row,marker,known){
 return !!(known||row?.teamTrash||marker&&typeof marker==='object');
}
// Chamado sob o bloqueio do importador, sem executar outro guarded() aninhado.
async function vistoriaPdfRestoreLocal(id){
 const tx=db.transaction(['reports','trash','draft'],'readwrite'),done=transactionDone(tx);
 const reports=tx.objectStore('reports'),trash=tx.objectStore('trash'),draft=tx.objectStore('draft');
 let restored=null;
 const live=reports.get(id);
 live.onsuccess=()=>{
  if(live.result){restored=live.result;return;}
  const old=trash.get(id);
  old.onsuccess=()=>{
   const row=old.result;if(!row)return;
   const marker=draft.get('deleted-report:'+id);
   marker.onsuccess=()=>{
    if(vistoriaPdfTeamTrash(row,marker.result,window.VistoriaTeamTrash?.known(id)))return;
    restored={id,updated:new Date().toISOString(),document:row.document};
    reports.add(restored);trash.delete(id);draft.delete('deleted-report:'+id);
   };
  };
 };
 await done;return restored;
}
/* Keep the original PDF bytes with an editable continuation report. */
(()=>{
 const extra=['sourcePdf','sourcePdfName','sourcePdfRecovered'];metaKeys.push(...extra);
 for(const key of extra){const input=document.createElement('input');input.type='hidden';input.id=key;($('identification')||$('meta')).append(input)}
 const label=document.createElement('label');label.className='filebtn secondary';label.textContent='Importar vistoria em PDF';
 const input=document.createElement('input');input.type='file';input.accept='.pdf,application/pdf';input.hidden=true;input.id='importInspectionPdf';label.append(input);$('historySearch').before(label);
 const note=document.createElement('p');note.className='muted';note.textContent='O aplicativo procura a vistoria original e restaura os campos editáveis dos PDFs compatíveis. Em PDFs antigos, recupera os campos reconhecidos para conferência, mantendo o original.';label.after(note);
 const source=document.createElement('div');source.className='photo';source.hidden=true;
 const name=document.createElement('p');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Baixar PDF original';source.append(name,button);($('identification')||$('meta')).append(source);
 function update(){source.hidden=!$('sourcePdf').value;name.textContent='Documento original: '+$('sourcePdfName').value}
 const previousFill=fill;fill=function(d){previousFill(d);update()};
 const previousBlank=blankReport;blankReport=function(){previousBlank();extra.forEach(k=>$(k).value='');update()};
 function bytesFromData(value){const base64=value.split(',')[1];if(!base64)throw Error('PDF original indisponível.');return Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}
 button.onclick=()=>{try{download(new Blob([bytesFromData($('sourcePdf').value)],{type:'application/pdf'}),$('sourcePdfName').value||'vistoria-original.pdf')}catch(e){notify(e.message)}};
 input.onchange=async()=>{const file=input.files[0];if(!file)return;await guarded(async()=>{
  if(file.size>40*1024*1024)throw Error('O PDF excede 40 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let pdf;try{pdf=await PDFLib.PDFDocument.load(bytes)}catch{throw Error('Não foi possível ler o PDF. Verifique se o arquivo está válido e sem senha.')}
  if(!pdf.getPageCount())throw Error('O PDF não contém páginas.');
  await persistCurrent();
  const identity=vistoriaPdfIdentity(pdf,file.name);
  const packet=vistoriaPdfReadEditable(pdf);
  if(packet&&!valid(packet.document))throw Error('Os campos editáveis do PDF não passaram na validação.');
  const readRows=()=>requestResult(db.transaction('reports').objectStore('reports').getAll());
  const match=rows=>packet?(rows.find(r=>r.id===packet.id)||vistoriaPdfMatch(identity,rows)):vistoriaPdfMatch(identity,rows);
  let rows=await readRows(),existing=match(rows);
  if(!existing&&identity.native&&window.VistoriaGoogleDrive?.receiveForPdf){
   notify('Procurando a vistoria original na nuvem…');
   await window.VistoriaGoogleDrive.receiveForPdf();
   rows=await readRows();existing=match(rows);
  }
  if(existing){
   if(!identity.reference&&!confirm('Existe uma vistoria com este título: '+(existing.document.meta.number||existing.document.meta.title)+'. Abrir o registro salvo em vez de importar uma cópia?'))return;
   reset();activeReportId=existing.id;fill(existing.document);window.openSavedPointEditor?.();
   window.document.querySelector('[data-view="editor"]').click();
   notify('Vistoria existente aberta. O PDF não criou outro registro.');return;
  }
  const id=packet?.id||await vistoriaPdfRecoveryId(identity,bytes);
  const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha na leitura do arquivo.'));reader.readAsDataURL(new Blob([bytes],{type:'application/pdf'}))});
  const recovered=rows.find(r=>r.id===id||r.document?.meta?.sourcePdf===src);
  if(recovered){
   reset();activeReportId=recovered.id;fill(recovered.document);window.openSavedPointEditor?.();
   window.document.querySelector('[data-view="editor"]').click();
   notify('PDF já importado. Continuação existente aberta, sem duplicar.');return;
  }
  const trashed=await requestResult(db.transaction('trash').objectStore('trash').getAll());
  const trashedRow=vistoriaPdfTrashMatch(identity,id,src,trashed);
  const restoreId=trashedRow?.id||id;
  const marker=await requestResult(db.transaction('draft').objectStore('draft').get('deleted-report:'+restoreId));
  const teamTrash=vistoriaPdfTeamTrash(trashedRow,marker,window.VistoriaTeamTrash?.known(restoreId));
  if((trashedRow||marker)&&teamTrash){
   if(!confirm('Esta vistoria está na lixeira da equipe. Restaurar o registro original em todos os aparelhos? É necessária uma conta de administrador.'))return;
   if(!window.VistoriaTeamTrash?.restore)throw Error('Conecte-se à equipe para restaurar a vistoria.');
   await window.VistoriaTeamTrash.restore(restoreId);
   const restored=(await readRows()).find(r=>r.id===restoreId);
   if(!restored){notify('Restauração solicitada à equipe. Sincronize a nuvem e importe novamente; nenhuma cópia foi criada.');return;}
   reset();activeReportId=restored.id;fill(restored.document);window.openSavedPointEditor?.();
   await persistCurrent();window.document.querySelector('[data-view="editor"]').click();
   notify('Vistoria original restaurada da equipe, sem duplicar.');return;
  }
  if(trashedRow){
   if(!confirm('Esta vistoria está na lixeira deste aparelho. Restaurar o registro existente, com todos os campos e fotos salvos?'))return;
   const restored=await vistoriaPdfRestoreLocal(restoreId);
   if(!restored)throw Error('A situação da lixeira mudou. Atualize a lista e tente novamente.');
   reset();activeReportId=restored.id;fill(restored.document);window.openSavedPointEditor?.();
   await persistCurrent();await window.refreshTrash?.();window.document.querySelector('[data-view="editor"]').click();
   notify('Vistoria restaurada da lixeira com o mesmo ID.');return;
  }
  // Uma exclusão local definitiva pode ser revertida por importação explícita de
  // um PDF que contenha dados recuperáveis, mas nunca por download automático.
  const recoverDeleted=marker===true&&!teamTrash;
  let legacy=null;
  if(!packet&&identity.native&&!/^Vistorias reunidas/i.test(identity.title)&&!/^Vistorias-reunidas-/i.test(file.name)){try{legacy=vistoriaPdfLegacyFields(vistoriaPdfLegacyEvents(pdf),identity);}catch{}}
  if(marker&&!recoverDeleted)throw Error('Registro excluído da equipe. Restaure pela nuvem antes de importar.');
  if(recoverDeleted&&!packet&&!legacy)throw Error('O registro foi apagado e o PDF não contém campos recuperáveis. Nenhuma cópia foi criada.');
  const message=packet?'Restaurar todos os campos e fotos salvos neste PDF, com o ID original? A recuperação não será publicada automaticamente.':legacy?'Recuperar os campos reconhecidos neste PDF antigo? Confira todos os dados e fotos antes de compartilhar. O PDF original será preservado; campos não reconhecidos ficam vazios.':'Registro editável original não localizado. Importar o PDF como referência local? Não foi possível recuperar os campos automaticamente.';
  if(!confirm((recoverDeleted?'A vistoria foi apagada da lixeira local. Recuperar pelo PDF usando o mesmo identificador?\n\n':'')+message))return;
  const meta=Object.fromEntries(metaKeys.map(k=>[k,'']));meta.title='Continuação — '+(identity.title||file.name.replace(/\.pdf$/i,''));meta.sourcePdf=src;meta.sourcePdfName=file.name;
  const record=Object.fromEntries(itemKeys.map(k=>[k,'']));Object.assign(record,{tag:'PDF IMPORTADO',area:'A confirmar',problem:'Relato inicial preservado no PDF original: '+file.name+'. Preencha a TAG e a área e registre novas descobertas em Andamento da análise.',priority:'Média',status:'Em acompanhamento',photos:[]});
  const document=packet?packet.document:legacy?{version:1,meta:{...meta,...legacy.meta,sourcePdfRecovered:'legacy'},records:legacy.records.map(r=>({...Object.fromEntries(itemKeys.map(k=>[k,''])),...r}))}:{version:1,meta,records:[record]};
  if(!valid(document))throw Error('Não foi possível validar os campos recuperados. O PDF original não foi modificado.');
  const transaction=db.transaction(['reports','trash','draft'],'readwrite'),store=transaction.objectStore('reports');
  let inserted=false;
  const check=store.get(id);
  check.onsuccess=()=>{if(check.result)return;const draft=transaction.objectStore('draft');const deleted=draft.get('deleted-report:'+id);deleted.onsuccess=()=>{if(deleted.result&&!(recoverDeleted&&deleted.result===true&&!window.VistoriaTeamTrash?.known(id)))return;const old=transaction.objectStore('trash').get(id);old.onsuccess=()=>{if(old.result)return;store.add({id,updated:new Date().toISOString(),document});if(recoverDeleted)draft.delete('deleted-report:'+id);inserted=true;};};};
  await transactionDone(transaction);
  if(!inserted){notify('O registro mudou durante a importação. Atualize a lista e abra a vistoria existente.');await refreshHistory();return;}
  window.VistoriaGoogleDrive?.markPdfLocal(id);
  reset();activeReportId=id;fill(document);window.openSavedPointEditor();await persistCurrent();
  window.document.querySelector('[data-view="editor"]').click();notify(packet?'Vistoria restaurada com campos e fotos originais.':legacy?'Campos do PDF antigo recuperados. Confira os dados e fotos com o original.':'PDF preservado como referência; preencha os campos não recuperados.');
 });input.value=''};
 const previousValid=valid;valid=function(d){return previousValid(d)&&(!d.meta.sourcePdf||typeof d.meta.sourcePdf==='string'&&/^data:application\/pdf;base64,[a-zA-Z0-9+/=]+$/.test(d.meta.sourcePdf))};
 update();
})();
