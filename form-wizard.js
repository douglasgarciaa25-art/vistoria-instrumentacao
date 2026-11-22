/* Assistente de campo: uma seção por vez, mantendo campos, fotos e salvamento originais. */
(()=>{
 'use strict';
 const form=document.getElementById('form');
 if(!form||document.getElementById('vistoriaWizard'))return;
 const fields=[...form.children].find(el=>el.classList.contains('fields'));
 const photo=form.querySelector('.photo');
 if(!fields||!photo||!document.getElementById('submit'))return;

 const steps=[
  {title:'Identificação',question:'Qual equipamento será inspecionado?',hint:'Informe a TAG e a localização. OS e detalhes adicionais continuam disponíveis.',more:'OS, equipamento e ferramentas adicionais'},
  {title:'Condição encontrada',question:'O que foi encontrado em campo?',hint:'Registre a condição e descreva o fato observado, sem supor causas.',more:'Prioridade e recursos de revisão técnica'},
  {title:'Diagnóstico e impacto',question:'O que foi testado e qual o resultado?',hint:'Informe as consequências. Testes, histórico, checklist e descritivo guiado são opcionais.',more:'Testes, histórico, checklist e descritivo guiado'},
  {title:'Plano de ação',question:'O que deve ser feito ou foi realizado?',hint:'Indique a ação necessária. Prazos, responsáveis e conclusão podem ser detalhados.',more:'Responsável, prazo e conclusão da pendência'},
  {title:'Fotos e salvar',question:'Deseja registrar evidências?',hint:'Adicione fotos da câmera ou da galeria e salve este ponto.',more:''}
 ];
 const fieldSteps={
  tag:0,pointWorkOrder:0,area:0,equipment:0,
  condition:1,priority:1,status:1,problem:1,
  analysisHistory:2,analysisDraft:2,impact:2,
  action:3,owner:3,deadline:3
 };
 const optionalIds=new Set(['pointWorkOrder','equipment','priority','owner','deadline']);
 const group=new Map();
 let last=0,lastOptional=false;
 for(const child of [...fields.children]){
  const input=child.matches('label')?child.querySelector('input[id],select[id],textarea[id]'):null;
  if(input&&Object.prototype.hasOwnProperty.call(fieldSteps,input.id)){
   last=fieldSteps[input.id];lastOptional=optionalIds.has(input.id);
  }
  if(child.querySelector?.('#analysisDraft')||child.classList.contains('guided-description')){
   last=2;lastOptional=true;
  }
  if(child.classList.contains('technical-review'))lastOptional=true;
  group.set(child,{step:last,optional:lastOptional});
 }
 for(const child of [...form.children]){
  if(child===fields)continue;
  if(child.classList.contains('photo'))group.set(child,{step:4,optional:false});
  else if(child.classList.contains('completion'))group.set(child,{step:3,optional:true});
  else if(child.querySelector?.('#inspectionType'))group.set(child,{step:2,optional:true});
  else if(child.classList.contains('actions')&&child.querySelector('#submit'))group.set(child,{step:4,optional:false});
 }

 const style=document.createElement('style');
 style.textContent=[
  '#form [data-wizard-hidden="true"],#form .wizard-footer button[hidden],#form .wizard-more[hidden]{display:none!important}',
  '#form .wizard-box{margin:14px 0 18px;background:#fff;border:1px solid #e5dfec;border-radius:15px;padding:17px;box-shadow:0 2px 12px #30105d08}',
  '#form .wizard-eyebrow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;color:#6f607c;font-weight:700;letter-spacing:.3px}',
  '#form .wizard-title{font-size:19px;line-height:1.28;color:#321653;margin:11px 0 6px;font-weight:700}',
  '#form .wizard-question{margin:0;font-size:13px;color:#372b43;font-weight:650}',
  '#form .wizard-caption{font-size:12px;color:#696173;line-height:1.55;margin:6px 0 0}',
  '#form .wizard-progress{width:100%;height:8px;accent-color:#351463;margin:9px 0 5px}',
  '#form .wizard-pending{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:12px;color:#59476b}',
  '#form .wizard-pending button{min-height:40px;padding:8px 12px;font-size:12px}',
  '#form .wizard-navigation{margin:14px 0 0;border-top:1px solid #eee9f2;padding-top:10px}',
  '#form .wizard-navigation summary{cursor:pointer;font-size:12px;color:#513c64;font-weight:650}',
  '#form .wizard-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}',
  '#form .wizard-steps button{min-height:39px;font-size:11px;padding:8px 9px;line-height:1.3;background:#f5f1f8;color:#4b3a5a;border:1px solid #e4dcea;text-align:left;justify-content:flex-start}',
  '#form .wizard-steps button[aria-current="step"]{background:#351463;color:#fff;border-color:#351463}',
  '#form .wizard-more{width:100%;margin-top:14px;min-height:42px;justify-content:space-between;text-align:left;background:#f4f0f8;color:#462d60;border:1px solid #e7dff0;font-size:12px}',
  '#form .wizard-more[aria-expanded="true"]{background:#eae1f4}',
  '#form .wizard-footer{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-top:16px;padding-top:15px;border-top:1px solid #e9e5ee}',
  '#form .wizard-footer button{min-width:0;width:100%;min-height:47px}',
  '#form .wizard-footer p{grid-column:1/-1;grid-row:1;font-size:11px;line-height:1.45;color:#747082;margin:0}',
  '#form>.fields{row-gap:15px}',
  '#form .photo .thumbs{margin-top:12px}',
  '@media(min-width:760px){#form .wizard-steps{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '#identification .wizard-meta-toggle{width:100%;text-align:left;justify-content:flex-start;line-height:1.4;font-size:12px;min-height:46px}',
  '#identification #meta{margin-top:15px}',
  '@media(max-width:450px){#form .wizard-box{padding:14px}#form .wizard-title{font-size:18px}#form .wizard-steps button{font-size:11px}#form .wizard-footer{gap:8px}}'
 ].join('\n');
 document.head.append(style);

 const wizard=document.createElement('section');
 wizard.id='vistoriaWizard';wizard.className='wizard-box';
 wizard.setAttribute('aria-label','Assistente de preenchimento em campo');
 wizard.innerHTML='<div class="wizard-eyebrow"><span>ASSISTENTE DE CAMPO</span><span id="wizardCounter">Etapa 1 de 5</span></div>'
  +'<progress class="wizard-progress" max="5" value="1" aria-label="Progresso do preenchimento"></progress>'
  +'<h3 class="wizard-title" id="wizardTitle"></h3>'
  +'<p class="wizard-question" id="wizardQuestion"></p>'
  +'<p class="wizard-caption" id="wizardCaption"></p>'
  +'<div class="wizard-pending"><span id="wizardPendingCount" role="status" aria-live="polite"></span><button type="button" class="secondary" id="wizardGoPending" hidden>Ir para próximo pendente</button></div>'
  +'<details class="wizard-navigation" id="wizardNavigation"><summary>Ver todas as etapas</summary><div class="wizard-steps" role="group" aria-label="Selecionar etapa"></div></details>'
  +'<button type="button" class="secondary wizard-more" id="wizardMore" aria-expanded="false" hidden></button>';
 fields.before(wizard);
 const nav=wizard.querySelector('.wizard-navigation');
 const stepButtons=steps.map((step,index)=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=(index+1)+'. '+step.title;
  button.setAttribute('aria-label','Abrir etapa '+(index+1)+': '+step.title);
  button.addEventListener('click',()=>{setStep(index,true);nav.open=false});
  nav.querySelector('.wizard-steps').append(button);
  return button;
 });
 const more=wizard.querySelector('#wizardMore');
 const footer=document.createElement('div');
 footer.className='wizard-footer';
 footer.innerHTML='<button type="button" class="secondary" id="wizardBack">Voltar</button>'
  +'<p id="wizardHint">As alterações permanecem no rascunho.</p>'
  +'<button type="button" id="wizardNext">Avançar</button>';
 form.append(footer);
 const back=footer.querySelector('#wizardBack');
 const next=footer.querySelector('#wizardNext');
 const expanded=steps.map(()=>false);
 const essentials={0:['tag','area'],1:['problem']};
 function requiredFields(index){
  return index===3&&document.getElementById('status')?.value==='Corrigido'
   ?['completionDate','completionWork']:(essentials[index]||[]);
 }
 function missingFields(){
  return steps.flatMap((_,index)=>requiredFields(index)
   .filter(id=>{const field=document.getElementById(id);return field&&!String(field.value||'').trim()})
   .map(id=>({id,index})));
 }
 function stageReady(index){
  const ids=requiredFields(index);
  return ids?.length?ids.every(id=>String(document.getElementById(id)?.value||'').trim()):null;
 }
 let current=0;
 // Os dados gerais continuam editáveis, mas não ocupam a tela toda durante o campo.
 const reportPanel=document.getElementById('identification');
 const reportFields=document.getElementById('meta');
 const reportExtra=reportPanel?.querySelector(':scope > details.advanced');
 let reportExpanded=false;
 let reportToggle=null;
 if(reportPanel&&reportFields){
  reportToggle=document.createElement('button');
  reportToggle.type='button';
  reportToggle.id='wizardReportToggle';
  reportToggle.className='secondary wizard-meta-toggle';
  reportFields.before(reportToggle);
  reportToggle.addEventListener('click',()=>setReportExpanded(!reportExpanded));
  const oldSteps=document.querySelector('#view-editor .editor-steps');
  if(oldSteps)oldSteps.hidden=true;
  ['title','date','number','workOrder'].forEach(id=>document.getElementById(id)?.addEventListener('input',refreshReportSummary));
  setReportExpanded(false);
 }
 function refreshReportSummary(){
  if(!reportToggle)return;
  const number=document.getElementById('number')?.value.trim();
  const title=document.getElementById('title')?.value.trim()||'Vistoria sem título';
  const label=number||title;
  reportToggle.textContent=(reportExpanded?'− Recolher':'＋ Conferir / editar')+' dados do relatório · '+label.slice(0,65);
 }
 function setReportExpanded(open){
  if(!reportToggle)return;
  reportExpanded=Boolean(open);
  reportFields.hidden=!reportExpanded;
  if(reportExtra)reportExtra.hidden=!reportExpanded;
  reportToggle.setAttribute('aria-expanded',String(reportExpanded));
  refreshReportSummary();
 }
 document.getElementById('newReport')?.addEventListener('click',()=>setReportExpanded(true));
 document.getElementById('clear')?.addEventListener('click',()=>setReportExpanded(true));

 function hasFilled(node){
  return [...node.querySelectorAll('input[id],select[id],textarea[id]')].some(input=>{
   if(input.readOnly&&input.id!=='analysisHistory')return false;
   const value=String(input.value||'').trim();
   return Boolean(value)&&!['A definir','Sem checklist','Não se aplica'].includes(value);
  });
 }
 function revealFilledOptions(){
  for(const [node,config] of group){
   if(config.optional&&hasFilled(node))expanded[config.step]=true;
  }
  if(document.getElementById('status')?.value==='Corrigido')expanded[3]=true;
 }
 function render(){
  for(const [node,config] of group){
   node.dataset.wizardHidden=String(config.step!==current||(config.optional&&!expanded[current]));
  }
  wizard.querySelector('progress').value=current+1;
  wizard.querySelector('#wizardCounter').textContent='Etapa '+(current+1)+' de '+steps.length;
  wizard.querySelector('#wizardTitle').textContent=steps[current].title;
  wizard.querySelector('#wizardQuestion').textContent=steps[current].question;
  wizard.querySelector('#wizardCaption').textContent=steps[current].hint;
  const pending=missingFields();
  const stagePending=pending.filter(item=>item.index===current).length;
  wizard.querySelector('#wizardPendingCount').textContent=pending.length
   ?pending.length+' campo(s) essencial(is) pendente(s)':'Campos essenciais preenchidos';
  wizard.querySelector('#wizardGoPending').hidden=!pending.length;
  wizard.querySelector('#wizardGoPending').textContent=stagePending
   ?'Preencher próximo campo desta etapa':'Ir para próxima etapa pendente';
  stepButtons.forEach((button,i)=>{
   const ready=stageReady(i);
   const count=pending.filter(item=>item.index===i).length;
   button.textContent=(i+1)+'. '+steps[i].title+(count?' · '+count+' pendente(s)':ready===true?' ✓':'');
   button.setAttribute('aria-label','Abrir etapa '+(i+1)+': '+steps[i].title+(count?', '+count+' campos essenciais pendentes':ready===true?', campos essenciais preenchidos':''));
   if(i===current)button.setAttribute('aria-current','step');
   else button.removeAttribute('aria-current');
  });
  const hasOptions=[...group.values()].some(config=>config.step===current&&config.optional);
  more.hidden=!hasOptions;
  more.setAttribute('aria-expanded',String(expanded[current]));
  more.textContent=(expanded[current]?'− Ocultar':'＋ Mostrar')+' opções: '+steps[current].more;
  back.disabled=current===0;
  next.hidden=current===steps.length-1;
  footer.querySelector('#wizardHint').textContent=current===steps.length-1
   ?'Confira as fotos e toque em Adicionar ao relatório ou Salvar alteração.'
   :'Você pode voltar e corrigir qualquer etapa sem perder o que digitou.';
 }
 function setStep(index,scroll=false){
  current=Math.max(0,Math.min(steps.length-1,index));
  render();
  if(scroll)wizard.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function openField(id,index){
  expanded[index]=true;
  setStep(index,true);
  const input=document.getElementById(id);
  const details=input?.closest('details');
  if(details)details.open=true;
  if(input)input.focus({preventScroll:true});
  if(typeof notify==='function')notify('Preencha: '+(input?.closest('label')?.textContent||id).trim().slice(0,90));
 }
 function validate(index){
  const required=index===0?['tag','area']:index===1?['problem']:
   index===3&&document.getElementById('status')?.value==='Corrigido'?['completionDate','completionWork']:[];
  for(const id of required){
   const input=document.getElementById(id);
   if(input&&!String(input.value||'').trim()){openField(id,index);return false}
  }
  return true;
 }
 wizard.querySelector('#wizardGoPending').addEventListener('click',()=>{
  const pending=missingFields();
  if(!pending.length)return;
  const target=pending.find(item=>item.index>=current)||pending[0];
  openField(target.id,target.index);
 });
 back.addEventListener('click',()=>setStep(current-1,true));
 next.addEventListener('click',()=>{if(validate(current))setStep(current+1,true)});
 more.addEventListener('click',()=>{expanded[current]=!expanded[current];render()});
 form.addEventListener('submit',event=>{
  if(current<steps.length-1){
   event.preventDefault();event.stopImmediatePropagation();
   if(validate(current))setStep(current+1,true);
   return;
  }
  for(let step=0;step<steps.length-1;step++){
   if(!validate(step)){event.preventDefault();event.stopImmediatePropagation();return}
  }
 },true);
 form.addEventListener('input',event=>{
  if(event.target.matches('input,textarea,select'))render();
 });
 form.addEventListener('change',event=>{
  if(event.target.matches('input,textarea,select'))render();
 });
 form.addEventListener('invalid',event=>{
  const first=[...form.elements].find(el=>el.willValidate&&el.validity&&!el.validity.valid);
  if(event.target!==first)return;
  const holder=[...group.keys()].find(node=>node.contains(event.target));
  const stage=holder?group.get(holder).step:0;
  expanded[stage]=true;
  setStep(stage,true);
 },true);
 document.getElementById('status')?.addEventListener('change',()=>{
  if(document.getElementById('status').value==='Corrigido')expanded[3]=true;
  render();
 });
 const oldReset=reset;
 reset=function(){const result=oldReset.apply(this,arguments);expanded.fill(false);setStep(0);return result};
 const oldFill=fill;
 fill=function(){const result=oldFill.apply(this,arguments);expanded.fill(false);revealFilledOptions();setStep(0);setReportExpanded(false);return result};
 document.getElementById('savedPointPicker')?.addEventListener('change',()=>{
  revealFilledOptions();setStep(0);
 });
 document.getElementById('entries')?.addEventListener('click',event=>{
  if(event.target.closest('[data-edit],[data-duplicate-item]')){
   queueMicrotask(()=>{
    expanded.fill(false);
    revealFilledOptions();
    setStep(0);
   });
  }
 },true);
 render();
})();
