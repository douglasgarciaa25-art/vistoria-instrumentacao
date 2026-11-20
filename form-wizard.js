/* Navegação visual do ponto por etapas. Não altera registros, rascunhos ou sincronização. */
(()=>{
 'use strict';
 const form=document.getElementById('form');
 if(!form||document.getElementById('vistoriaWizard'))return;
 const fields=[...form.children].find(el=>el.classList.contains('fields'));
 const photo=form.querySelector('.photo');
 if(!fields||!photo||!document.getElementById('submit'))return;

 const steps=[
  {title:'Identificação',hint:'TAG, OS, área, equipamento e situação do ponto.'},
  {title:'Condição e análise',hint:'Descreva o problema, os testes e os impactos observados.'},
  {title:'Ações e conclusão',hint:'Informe o que deve ser feito, responsáveis, prazos e serviços concluídos.'},
  {title:'Fotos e salvar',hint:'Acrescente evidências e salve o ponto no relatório.'}
 ];
 const fieldSteps={
  tag:0,pointWorkOrder:0,area:0,equipment:0,condition:0,priority:0,status:0,
  problem:1,analysisHistory:1,analysisDraft:1,impact:1,
  action:2,owner:2,deadline:2
 };
 const group=new Map();
 let last=0;
 for(const child of [...fields.children]){
  const input=child.matches('label')?child.querySelector('input[id],select[id],textarea[id]'):null;
  if(input&&Object.prototype.hasOwnProperty.call(fieldSteps,input.id))last=fieldSteps[input.id];
  group.set(child,last);
 }
 for(const child of [...form.children]){
  if(child===fields)continue;
  if(child.classList.contains('photo'))group.set(child,3);
  else if(child.classList.contains('completion')||child.querySelector?.('#inspectionType'))group.set(child,2);
  else if(child.classList.contains('actions')&&child.querySelector('#submit'))group.set(child,3);
 }
 const css=document.createElement('style');
 css.textContent=[
  '#form [data-wizard-hidden="true"],#form .wizard-footer button[hidden]{display:none!important}',
  '#form .wizard-box{border:1px solid #d8cfe2;background:#fbf9fd;border-radius:12px;padding:14px;margin:16px 0 20px}',
  '#form .wizard-steps{display:flex;gap:7px;overflow-x:auto;scrollbar-width:thin;padding:2px 0 10px}',
  '#form .wizard-steps button{flex:1 0 104px;min-width:0;background:#ede8f3;color:#3c2a52;border:1px solid #d9cce5;padding:9px 7px;border-radius:9px;font-size:12px;line-height:1.25;white-space:normal;text-align:center}',
  '#form .wizard-steps button[aria-current="step"]{background:#30105d;color:#fff;border-color:#30105d}',
  '#form .wizard-progress{width:100%;height:7px;accent-color:#30105d;margin:5px 0}',
  '#form .wizard-caption{font-size:13px;color:#554562;margin:8px 0 0}',
  '#form .wizard-footer{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:16px;padding:12px 0 0;border-top:1px solid #ddd5e6}',
  '#form .wizard-footer p{margin:0;font-size:12px;flex:1 1 140px;color:#625a69}',
  '#form .wizard-footer button{min-width:104px}',
  '@media(max-width:450px){#form .wizard-box{padding:10px}#form .wizard-steps button{flex-basis:92px;font-size:11px}#form .wizard-footer button{flex:1}}'
 ].join('\n');
 document.head.append(css);

 const wizard=document.createElement('section');
 wizard.id='vistoriaWizard';wizard.className='wizard-box';
 wizard.setAttribute('aria-label','Etapas do preenchimento');
 wizard.innerHTML='<div class="wizard-steps" role="group" aria-label="Ir para etapa"></div>'
  +'<progress class="wizard-progress" max="4" value="1" aria-label="Progresso do preenchimento"></progress>'
  +'<p class="wizard-caption" role="status" aria-live="polite"></p>';
 const stepBar=wizard.querySelector('.wizard-steps');
 const stepButtons=steps.map((step,i)=>{
  const button=document.createElement('button');button.type='button';
  button.textContent=(i+1)+'. '+step.title;
  button.setAttribute('aria-label','Ir para etapa '+(i+1)+': '+step.title);
  button.addEventListener('click',()=>setStep(i));
  stepBar.append(button);
  return button;
 });
 fields.before(wizard);
 const footer=document.createElement('div');footer.className='wizard-footer';
 footer.innerHTML='<button type="button" class="secondary" id="wizardBack">Voltar</button>'
  +'<p id="wizardHint">Rascunho salvo automaticamente no aparelho.</p>'
  +'<button type="button" id="wizardNext">Próximo</button>';
 form.append(footer);
 const back=footer.querySelector('#wizardBack');
 const next=footer.querySelector('#wizardNext');
 let current=0;

 function setStep(n,scroll=false){
  current=Math.min(steps.length-1,Math.max(0,n));
  for(const [node,step] of group)node.dataset.wizardHidden=String(step!==current);
  wizard.querySelector('progress').value=current+1;
  wizard.querySelector('.wizard-caption').textContent='Etapa '+(current+1)+' de '+steps.length+' — '+steps[current].hint;
  stepButtons.forEach((button,i)=>{
   if(i===current)button.setAttribute('aria-current','step');
   else button.removeAttribute('aria-current');
  });
  back.disabled=current===0;
  next.hidden=current===steps.length-1;
  footer.querySelector('#wizardHint').textContent=current===steps.length-1
   ?'Confira as fotos e toque em Adicionar ao relatório ou Salvar alteração.'
   :'As informações são mantidas ao avançar ou voltar.';
  if(scroll)wizard.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function focusField(id,step){
  setStep(step,true);
  const field=document.getElementById(id);
  if(field?.closest('details'))field.closest('details').open=true;
  field?.focus({preventScroll:true});
  if(typeof notify==='function')notify('Preencha este campo para continuar: '+(field?.closest('label')?.textContent||id).trim().slice(0,100));
 }
 function validate(step){
  const ids=step===0?['tag','area']:step===1?['problem']:
    step===2&&document.getElementById('status')?.value==='Corrigido'?['completionDate','completionWork']:[];
  for(const id of ids){
   const field=document.getElementById(id);
   if(field&&!String(field.value||'').trim()){focusField(id,step);return false}
  }
  return true;
 }
 back.addEventListener('click',()=>setStep(current-1,true));
 next.addEventListener('click',()=>{if(validate(current))setStep(current+1,true)});
 // O Enter não pode salvar um ponto enquanto os próximos passos ainda estão escondidos.
 form.addEventListener('submit',event=>{
  if(current<steps.length-1){
   event.preventDefault();event.stopImmediatePropagation();
   if(validate(current))setStep(current+1,true);
   return;
  }
  for(const step of [0,1,2]){
   if(!validate(step)){event.preventDefault();event.stopImmediatePropagation();return}
  }
 },true);
 // Validação nativa pode encontrar um campo requerido em uma etapa ainda invisível.
 form.addEventListener('invalid',event=>{
  const first=[...form.elements].find(el=>el.willValidate&&el.validity&&!el.validity.valid);
  if(event.target!==first)return;
  const holder=[...group.keys()].find(node=>node.contains(event.target));
  const stage=holder?group.get(holder):0;
  setStep(stage,true);
 },true);

 const oldReset=reset;
 reset=function(){const result=oldReset.apply(this,arguments);setStep(0);return result};
 const oldFill=fill;
 fill=function(){const result=oldFill.apply(this,arguments);setStep(0);return result};
 const pointSelect=document.getElementById('savedPointPicker');
 pointSelect?.addEventListener('change',()=>setStep(0));
 document.getElementById('entries')?.addEventListener('click',event=>{
  if(event.target.closest('[data-edit],[data-duplicate-item]'))setStep(0);
 },true);
 setStep(0);
})();