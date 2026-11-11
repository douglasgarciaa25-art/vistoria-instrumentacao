/* Revisão técnica opcional: a equipe escreve; a IA só sugere; ninguém perde o original sem confirmar. */
(()=>{
 'use strict';
 const fields=[
  ['analysisDraft','Etapa do andamento'],
  ['problem','Condição encontrada'],
  ['impact','Impacto / consequência'],
  ['action','Ação recomendada'],
  ['completionWork','Serviço realizado'],
  ['objective','Objetivo'],
  ['conclusion','Conclusão']
 ];
 let requesting=false;
 const resetPanels=[];

 for(const [id,title] of fields){
  const field=document.getElementById(id);
  if(!field||!field.closest('label'))continue;

  const container=document.createElement('div');
  container.className='technical-review';
  const review=document.createElement('button');
  review.type='button';review.className='secondary';
  review.textContent='Revisar redação técnica com IA';
  const undo=document.createElement('button');
  undo.type='button';undo.className='secondary';undo.textContent='Desfazer revisão';undo.hidden=true;
  const status=document.createElement('p');
  status.className='muted technical-review-status';status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');

  const panel=document.createElement('div');
  panel.className='technical-review-preview';panel.hidden=true;
  const label=document.createElement('label');
  label.textContent='Sugestão de redação técnica — confira os dados antes de aceitar';
  const suggestion=document.createElement('textarea');
  suggestion.rows=5;suggestion.setAttribute('aria-label','Texto técnico sugerido para '+title);
  label.append(suggestion);
  const accept=document.createElement('button');
  accept.type='button';accept.textContent='Usar texto revisado';
  const dismiss=document.createElement('button');
  dismiss.type='button';dismiss.className='secondary';dismiss.textContent='Manter meu texto';
  const commands=document.createElement('div');commands.className='actions';
  commands.append(accept,dismiss);
  panel.append(label,commands);

  const buttons=document.createElement('div');buttons.className='actions';buttons.append(review,undo);
  container.append(buttons,status,panel);
  field.closest('label').after(container);

  let pending=null,applied=null;
  function clear(){
   pending=null;applied=null;panel.hidden=true;undo.hidden=true;
   suggestion.value='';status.textContent='';
  }
  resetPanels.push(clear);
  field.addEventListener('input',()=>{
   if(pending&&field.value!==pending.original){pending=null;panel.hidden=true;status.textContent='O texto mudou. Solicite outra revisão, se desejar.'}
   if(applied&&field.value!==applied.revised){applied=null;undo.hidden=true}
  });

  review.addEventListener('click',async()=>{
   if(requesting)return notify('Aguarde o término da revisão em andamento.');
   const original=field.value;
   if(!original.trim())return notify('Escreva primeiro a sua descrição de '+title.toLowerCase()+'.');
   if(original.trim().length>3500)return notify('Revise um trecho com até 3.500 caracteres.');
   if(!navigator.onLine)return notify('Sem internet. Seu texto permanece disponível para edição e salvamento offline.');
   const key=typeof cloudKey==='string'?cloudKey:'';
   if(!key)return notify('Conecte a chave da nuvem para habilitar a revisão com IA.');
   if(!confirm('Enviar APENAS o texto deste campo ao modelo OpenAI para sugestão de redação técnica? Não inclua informações sigilosas sem autorização. O uso da IA pode gerar custos na Vercel.'))return;

   requesting=true;review.disabled=true;review.textContent='Revisando...';
   pending=null;panel.hidden=true;undo.hidden=true;applied=null;
   status.textContent='Analisando a redação. O original não será alterado.';
   try{
    const response=await fetch('/api/technical-review',{
     method:'POST',
     cache:'no-store',
     headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
     body:JSON.stringify({field:id,text:original}),
     signal:AbortSignal.timeout(45000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Serviço de revisão indisponível.');
    if(typeof result.suggested!=='string'||!result.suggested.trim())throw Error('A IA não retornou um texto válido.');
    if(field.value!==original){
     status.textContent='Você alterou o texto enquanto a IA revisava. Nada foi substituído; solicite nova revisão.';
     return;
    }
    pending={original};
    suggestion.value=result.suggested.trim();
    panel.hidden=false;
    status.textContent='Compare a sugestão com o que realmente foi observado. Você pode editar a sugestão ou manter o original.';
   }catch(error){
    status.textContent='Revisão não concluída: '+(error.name==='TimeoutError'?'tempo de resposta excedido.':error.message);
   }finally{
    requesting=false;review.disabled=false;review.textContent='Revisar redação técnica com IA';
   }
  });

  accept.addEventListener('click',()=>{
   if(!pending)return;
   if(field.value!==pending.original){panel.hidden=true;pending=null;return notify('O texto mudou. Solicite nova revisão.')}
   const revised=suggestion.value.trim();
   if(!revised)return notify('A sugestão precisa ter algum texto.');
   const original=pending.original;
   pending=null;panel.hidden=true;suggestion.value='';
   field.value=revised;
   field.dispatchEvent(new Event('input',{bubbles:true}));
   applied={original,revised};undo.hidden=false;
   status.textContent='Redação técnica aplicada. O registro só será adicionado/salvo pelas ações normais do aplicativo.';
   notify('Texto revisado aplicado. Confira dados, TAGs, medições e serviços antes de salvar.');
  });
  dismiss.addEventListener('click',()=>{
   pending=null;panel.hidden=true;suggestion.value='';
   status.textContent='Texto original mantido, sem alterações.';
  });
  undo.addEventListener('click',()=>{
   if(!applied)return;
   if(field.value!==applied.revised)return notify('O texto já foi alterado; não é possível desfazer automaticamente.');
   const original=applied.original;
   applied=null;undo.hidden=true;
   field.value=original;field.dispatchEvent(new Event('input',{bubbles:true}));
   status.textContent='Relato original restaurado.';
   notify('Texto original restaurado.');
  });
 }

 // Limpa sugestões de outro ponto, mesmo quando os dados foram carregados sem eventos de input.
 const resetBefore=reset;
 reset=function(){for(const clear of resetPanels)clear();return resetBefore.apply(this,arguments)};
 const fillBefore=fill;
 fill=function(){for(const clear of resetPanels)clear();return fillBefore.apply(this,arguments)};
 document.getElementById('appendAnalysis')?.addEventListener('click',()=>{
  for(const clear of resetPanels)clear();
 });

 const note=document.createElement('p');
 note.className='muted technical-review-note';
 note.textContent='O texto é sempre escrito pela equipe. A IA apenas propõe uma redação; não confirma execução, testes, medições ou conformidade técnica. Confira e aprove antes de registrar.';
 document.getElementById('analysisDraft')?.closest('label')?.parentElement?.append(note);
})();
