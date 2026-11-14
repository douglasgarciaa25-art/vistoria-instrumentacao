/* Montador guiado: somente dados digitados; não utiliza IA ou rede. */
(()=>{
 'use strict';
 const api=window.VistoriaDescritivo;
 const anchor=document.getElementById('analysisDraft')?.closest('details');
 if(!api||!anchor)return;
 const section=document.createElement('details');
 section.className='card guided-description';
 section.innerHTML='<summary>Montar descritivo técnico — preenchimento guiado</summary>'
  +'<p class="muted">Registre somente fatos que você observou ou executou. Separe hipóteses de resultados confirmados. A prévia é montada neste aparelho, sem enviar informações para a IA.</p>'
  +'<div class="fields" id="guidedFields"></div>'
  +'<label>Prévia do descritivo<textarea id="guidedPreview" rows="9" readonly placeholder="Descreva pelo menos uma etapa acima."></textarea></label>'
  +'<div class="fields"><label>Onde acrescentar<select id="guidedTarget"><option value="analysisDraft">Andamento da análise (rascunho)</option><option value="problem">Condição encontrada</option><option value="impact">Impacto / consequência</option><option value="action">Ação recomendada</option><option value="completionWork">Serviço realizado</option><option value="conclusion">Conclusão</option></select></label></div>'
  +'<div class="actions"><button type="button" id="guidedApply">Acrescentar descritivo ao campo</button><button type="button" class="secondary" id="guidedUndo" hidden>Desfazer inclusão</button><button type="button" class="secondary" id="guidedClear">Limpar guia</button></div>'
  +'<p id="guidedStatus" class="muted" role="status" aria-live="polite"></p>';
 anchor.after(section);

 const fields=section.querySelector('#guidedFields');
 const fieldInputs={};
 const hints={
  condition:'Qual condição foi observada? Informe equipamento, TAG e sintomas, se conhecidos.',
  checks:'Quais testes ou inspeções foram realmente realizados?',
  findings:'Quais resultados foram confirmados? Informe medições e unidades sem alterar os valores.',
  hypothesis:'O que ainda é apenas uma possibilidade, sem confirmação?',
  work:'Qual atividade foi efetivamente executada? Não inclua serviços planejados.',
  next:'O que ainda precisa ser verificado ou executado, e por quem?'
 };
 for(const part of api.PARTS){
  const label=document.createElement('label');
  label.className='wide';
  label.textContent=part.label;
  const field=document.createElement('textarea');
  field.rows=2;
  field.placeholder=hints[part.key];
  field.setAttribute('aria-label',part.label);
  field.dataset.guidePart=part.key;
  label.append(field);
  fields.append(label);
  fieldInputs[part.key]=field;
 }
 const preview=section.querySelector('#guidedPreview');
 const target=section.querySelector('#guidedTarget');
 const status=section.querySelector('#guidedStatus');
 const undoButton=section.querySelector('#guidedUndo');
 let lastApplied=null;
 function updatePreview(){
  const values={};
  for(const part of api.PARTS)values[part.key]=fieldInputs[part.key].value;
  preview.value=api.compose(values);
  status.textContent=preview.value?'Prévia atualizada. Confira os fatos antes de acrescentar.':'';
 }
 function clearGuide(){
  for(const field of Object.values(fieldInputs))field.value='';
  preview.value='';
  lastApplied=null;
  undoButton.hidden=true;
  status.textContent='';
 }
 for(const field of Object.values(fieldInputs))field.addEventListener('input',updatePreview);
 section.querySelector('#guidedApply').addEventListener('click',()=>{
  const text=preview.value.trim();
  if(!text){status.textContent='Preencha pelo menos uma etapa do descritivo.';return}
  const field=document.getElementById(target.value);
  if(!field){status.textContent='O campo de destino não está disponível.';return}
  const previous=field.value;
  if(previous.trimEnd().endsWith(text)){
   status.textContent='Este descritivo já foi acrescentado ao campo selecionado.';
   return;
  }
  const updated=previous.trimEnd()?(previous.trimEnd()+'\n\n'+text):text;
  field.value=updated;
  field.dispatchEvent(new Event('input',{bubbles:true}));
  lastApplied={id:target.value,previous,updated};
  undoButton.hidden=false;
  status.textContent='Descritivo acrescentado sem apagar o conteúdo anterior. Confira e salve o ponto normalmente.'+
    (target.value==='analysisDraft'?' Depois toque em "Acrescentar etapa ao andamento".':'');
 });
 undoButton.addEventListener('click',()=>{
  if(!lastApplied)return;
  const field=document.getElementById(lastApplied.id);
  if(!field||field.value!==lastApplied.updated){
   status.textContent='O texto de destino mudou. Desfazer automaticamente não é seguro.';
   undoButton.hidden=true;lastApplied=null;return;
  }
  field.value=lastApplied.previous;
  field.dispatchEvent(new Event('input',{bubbles:true}));
  lastApplied=null;
  undoButton.hidden=true;
  status.textContent='Inclusão desfeita. O conteúdo anterior foi restaurado.';
 });
 section.querySelector('#guidedClear').addEventListener('click',()=>{
  if(Object.values(fieldInputs).some(field=>field.value.trim())&&!confirm('Limpar apenas os campos do guia? Os relatos já acrescentados não serão apagados.'))return;
  clearGuide();
 });
 // Evita transportar um rascunho do guia ao abrir outra vistoria ou outro ponto.
 const oldReset=reset;
 reset=function(){clearGuide();return oldReset.apply(this,arguments)};
 const oldFill=fill;
 fill=function(){clearGuide();return oldFill.apply(this,arguments)};
})();
