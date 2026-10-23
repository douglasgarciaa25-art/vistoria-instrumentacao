/* Ongoing findings stay with their inspection point; each entry can be deleted independently. */
(()=>{
 itemKeys.push('analysisHistory','analysisDraft');
 const section=document.createElement('details');
 section.className='advanced';
 section.open=true;
 section.innerHTML=`
  <summary>Andamento da análise</summary>
  <p class="muted">Registre novos achados sobre o mesmo equipamento sem apagar a condição inicial.</p>
  <label>Andamentos registrados
    <textarea id="analysisHistory" readonly placeholder="Nenhum andamento acrescentado." style="min-height:100px"></textarea>
  </label>
  <div id="analysisEntries" aria-live="polite" style="margin:8px 0 16px"></div>
  <label>Novo achado ou teste realizado
    <textarea id="analysisDraft" placeholder="Ex.: painel com acúmulo de sujeira; teste de comunicação com o switch realizado."></textarea>
  </label>
  <button type="button" class="secondary" id="appendAnalysis">Acrescentar andamento</button>
  <p class="muted">Para remover um andamento, use o botão Excluir do registro correspondente. As demais informações e fotos serão mantidas. Depois de editar um ponto salvo, toque em Salvar alteração.</p>`;
 $('problem').closest('label').after(section);
 const historyField=$('analysisHistory');
 const entriesContainer=$('analysisEntries');

 // Support existing saved histories (plain text with dated ANDAMENTO headings), no schema migration.
 function splitEntries(value){
  const src=String(value||'').trim();
  if(!src)return [];
  const markers=[...src.matchAll(/^ANDAMENTO\s*[—–-]\s*[^\r\n]*$/gm)];
  if(!markers.length)return [src];
  const entries=[];
  const prefix=src.slice(0,markers[0].index).trim();
  if(prefix)entries.push(prefix);
  markers.forEach((match,index)=>{
   const start=match.index;
   const end=index+1<markers.length?markers[index+1].index:src.length;
   const part=src.slice(start,end).trim();
   if(part)entries.push(part);
  });
  return entries;
 }
 function refreshEntries(){
  entriesContainer.replaceChildren();
  const entries=splitEntries(historyField.value);
  if(!entries.length){
   const message=document.createElement('p');message.className='muted';
   message.textContent='Nenhum andamento registrado neste ponto.';
   entriesContainer.append(message);return;
  }
  entries.forEach((raw,index)=>{
   const box=document.createElement('div');
   box.className='entry';
   box.style.cssText='padding:12px;margin:8px 0;overflow-wrap:anywhere';
   const heading=document.createElement('div');
   heading.style.cssText='font-weight:600;margin-bottom:6px';
   heading.textContent='Andamento '+(index+1);
   const text=document.createElement('p');
   text.style.cssText='white-space:pre-wrap;margin:6px 0 12px';
   text.textContent=raw;
   const button=document.createElement('button');
   button.type='button';button.className='danger';
   button.dataset.deleteAnalysis=String(index);
   button.textContent='Excluir este andamento';
   button.setAttribute('aria-label','Excluir andamento '+(index+1));
   box.append(heading,text,button);entriesContainer.append(box);
  });
 }
 entriesContainer.addEventListener('click',event=>{
  const button=event.target.closest('[data-delete-analysis]');
  if(!button)return;
  const index=Number(button.dataset.deleteAnalysis);
  const entries=splitEntries(historyField.value);
  if(!Number.isInteger(index)||index<0||index>=entries.length)return;
  if(!confirm('Excluir somente o andamento '+(index+1)+'? Os outros registros e fotos serão preservados.'))return;
  entries.splice(index,1);
  historyField.value=entries.join('\n\n');
  refreshEntries();save();
  notify('Andamento excluído. '+(editing!==null?'Toque em Salvar alteração para atualizar o ponto.':'Alteração salva no rascunho automaticamente.'));
 });
 $('analysisDraft').addEventListener('input',()=>save());
 $('appendAnalysis').onclick=()=>{
  const text=$('analysisDraft').value.trim();
  if(!text)return notify('Descreva o novo achado ou teste realizado.');
  const stamp=new Date().toLocaleString('pt-BR');
  const entries=splitEntries(historyField.value);
  entries.push('ANDAMENTO — '+stamp+'\n'+text);
  historyField.value=entries.join('\n\n');
  $('analysisDraft').value='';
  if($('status').value==='Pendente')$('status').value='Em acompanhamento';
  refreshEntries();save();
  notify('Andamento acrescentado. '+(editing!==null?'Toque em Salvar alteração para atualizar o ponto.':'Rascunho salvo automaticamente.'));
 };
 // Keep list synchronized when opening another report, point or a saved draft.
 const oldFill=fill;
 fill=function(d){oldFill(d);refreshEntries()};
 const oldReset=reset;
 reset=function(){oldReset();refreshEntries()};
 $('entries').addEventListener('click',event=>{
  if(event.target.closest('[data-edit]')||event.target.closest('[data-delete]')){
   queueMicrotask(refreshEntries);
  }
 });
 // Selecting an entry in the saved-point picker calls the same edit handler.
 $('savedPointPicker')?.addEventListener('change',()=>queueMicrotask(refreshEntries));
 refreshEntries();
})();
