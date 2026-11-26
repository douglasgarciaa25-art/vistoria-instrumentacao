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
  {title:'Diagnóstico e impacto',question:'O que foi testado e qual o resultado?',hint:'Registre apenas o que foi observado. Esta etapa é opcional.',more:'Histórico, checklist, descritivo guiado e revisão técnica'},
  {title:'Plano de ação',question:'O que deve ser feito ou foi realizado?',hint:'Indique a ação necessária. Prazos, responsáveis e conclusão podem ser detalhados.',more:'Responsável, prazo e conclusão da pendência'},
  {title:'Fotos e salvar',question:'Deseja registrar evidências?',hint:'Tire uma foto ou use Buscar fotos para selecionar imagens da Galeria, Google Fotos ou Arquivos, conforme o aparelho. Confira as miniaturas e salve este ponto.',more:''}
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
  else if(child.classList.contains('completion'))group.set(child,{step:3,optional:true,completion:true});
  else if(child.querySelector?.('#inspectionType'))group.set(child,{step:2,optional:true});
  else if(child.classList.contains('actions')&&child.querySelector('#submit'))group.set(child,{step:4,optional:false});
 }

 // Etapa 3: deixa os dois campos de campo sempre acessíveis, sem abrir menus.
 const analysisDraft=document.getElementById('analysisDraft');
 const analysisHistory=document.getElementById('analysisHistory');
 const analysisSection=analysisDraft?.closest('details');
 if(analysisSection&&group.has(analysisSection)){
  group.set(analysisSection,{step:2,optional:false});
  analysisSection.classList.add('wizard-analysis');
  analysisSection.open=true;
  const draftLabel=analysisDraft.closest('label');
  const historyLabel=analysisHistory?.closest('label');
  const appendButton=document.getElementById('appendAnalysis');
  const extras=document.createElement('details');
  extras.className='wizard-analysis-tools';
  const summary=document.createElement('summary');summary.textContent='Histórico e revisão técnica';extras.append(summary);
  // Os nós originais são movidos, preservando IDs, eventos, ditado e revisão.
  for(const child of [...analysisSection.children]){
   if(child===draftLabel||child===appendButton||child.tagName==='SUMMARY')continue;
   if(child===historyLabel||child.matches('.technical-review,.technical-review-preview,.technical-review-note')||child.tagName==='BUTTON'||child.classList.contains('actions'))extras.append(child);
   else if(child.matches('p.muted'))child.hidden=true;
  }
  if(draftLabel?.firstChild?.nodeType===3)draftLabel.firstChild.textContent='Testes realizados e resultado (opcional)';
  analysisDraft.placeholder='Ex.: Simulado sinal de 4–20 mA; entrada analógica respondeu corretamente.';
  analysisDraft.rows=3;
  if(appendButton){appendButton.textContent='Registrar andamento agora';appendButton.classList.add('wizard-analysis-append');}
  analysisSection.append(extras);
  analysisSection.addEventListener('toggle',()=>{if(!analysisSection.open)analysisSection.open=true});
 }
 const impactField=document.getElementById('impact');
 if(impactField){const label=impactField.closest('label');if(label?.firstChild?.nodeType===3)label.firstChild.textContent='Impacto na operação (opcional)';impactField.placeholder='Ex.: Perda de indicação de nível no supervisório.';impactField.rows=3;}

 const style=document.createElement('style');
 style.textContent=[
  '#identification #meta[hidden],#identification > details[hidden],#view-editor .editor-steps[hidden],#form .wizard-pending[hidden],#form .wizard-pending button[hidden]{display:none!important}',
  '#form [data-wizard-hidden="true"],#form .wizard-footer button[hidden],#form .wizard-more[hidden]{display:none!important}',
  '#form .wizard-box{margin:8px 0 14px;background:transparent;border:0;border-radius:0;padding:0;box-shadow:none}',
  '#form .wizard-eyebrow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;color:#6f607c;font-weight:700;letter-spacing:.3px}',
  '#form .wizard-title{font-size:19px;line-height:1.28;color:#321653;margin:7px 0 4px;font-weight:700}',
  '#form .wizard-question{margin:0;font-size:13px;color:#372b43;font-weight:650}',
  '#form .wizard-caption{font-size:12px;color:#696173;line-height:1.55;margin:6px 0 0}',
  '#form .wizard-progress{width:100%;height:5px;accent-color:#351463;margin:5px 0 2px}',
  '#form .wizard-pending{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:12px;color:#59476b}',
  '#form .wizard-pending button{min-height:40px;padding:8px 12px;font-size:12px}',
  '#form .wizard-navigation{margin:8px 0 0;border-top:0;padding-top:0}',
  '#form .wizard-navigation summary{cursor:pointer;font-size:12px;color:#513c64;font-weight:650}',
  '#form .wizard-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}',
  '#form .wizard-steps button{min-height:39px;font-size:11px;padding:8px 9px;line-height:1.3;background:#f5f1f8;color:#4b3a5a;border:1px solid #e4dcea;text-align:left;justify-content:flex-start}',
  '#form .wizard-steps button[aria-current="step"]{background:#351463;color:#fff;border-color:#351463}',
  '#form .wizard-more{width:100%;margin-top:14px;min-height:42px;justify-content:space-between;text-align:left;background:#f4f0f8;color:#462d60;border:1px solid #e7dff0;font-size:12px}',
  '#form .wizard-more[aria-expanded="true"]{background:#eae1f4}',
  '#form .wizard-footer{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-top:16px;padding-top:15px;border-top:1px solid #e9e5ee}',
  '#form .wizard-footer button{min-width:0;width:100%;min-height:47px}',
  '#form .wizard-footer p{grid-column:1/-1;grid-row:1;font-size:11px;line-height:1.45;color:#747082;margin:0}',
  '#form>.fields{row-gap:12px}',
  '#form > .step[hidden],#form > p.muted[hidden]{display:none!important}',
  '#form > .wizard-more{margin:10px 0 0;min-height:40px}',
  '#form .wizard-pending{margin-top:5px}',
  '#form .wizard-caption{margin-top:3px}',
  '#form .wizard-footer{margin-top:12px;padding-top:10px}',
  '#form .wizard-footer button:disabled{opacity:.45}',
  '#form .wizard-mode{display:flex;gap:6px;margin:0 0 12px;padding:3px;background:#f3eff7;border-radius:9px}',
  '#form .wizard-mode button{flex:1;min-width:0;min-height:44px;font-size:13px;background:transparent;color:#513c64;border:0}',
  '#form .wizard-mode button[aria-pressed="true"]{background:#351463;color:white}',
  '#form .wizard-mode-help{margin:0 0 10px;font-size:12px;color:#62586e}',
  '#form[data-wizard-mode="quick"] .wizard-eyebrow,#form[data-wizard-mode="quick"] .wizard-progress,#form[data-wizard-mode="quick"] .wizard-navigation,#form[data-wizard-mode="quick"] .wizard-footer,#form[data-wizard-mode="quick"] .wizard-title,#form[data-wizard-mode="quick"] .wizard-caption,#form .wizard-mode-help[hidden]{display:none!important}',
  '#form[data-wizard-mode="quick"] .wizard-box{margin:0 0 10px}',
  '#form[data-wizard-mode="quick"] .photo{margin-top:10px}',
  '#form[data-wizard-mode="quick"] .photo > p.muted{display:none}',
  '#form[data-wizard-mode="quick"] #submit{min-height:50px;flex:1}',
  '#form .wizard-area-use{min-height:40px;align-self:end}',
  '#form .wizard-area-use[hidden],#form #wizardQuickDiagnostics[hidden],#form .wizard-recent-areas[hidden],#form .wizard-status-shortcuts[hidden]{display:none!important}',
  '#form .wizard-recent-areas,#form .wizard-status-shortcuts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin:0 0 4px}',
  '#form .wizard-recent-areas button,#form .wizard-status-shortcuts button{min-height:44px;padding:8px 12px;font-size:13px;flex:1 1 auto}',
  '#form .wizard-status-shortcuts button[aria-pressed="true"]{background:#351463;color:#fff;border-color:#351463}',
  '#form[data-wizard-mode="quick"] .wizard-status-native select{width:100%}',
  '#form[data-wizard-mode="quick"] .wizard-status-native{margin-bottom:0}',
  '@media(max-width:600px){#form[data-wizard-mode="quick"] input:not([type="file"]),#form[data-wizard-mode="quick"] select,#form[data-wizard-mode="quick"] textarea{font-size:16px;min-height:44px}#form[data-wizard-mode="quick"] .photo .actions>*{flex:1 1 130px;min-height:48px}}',
  '#form .wizard-analysis{grid-column:1/-1;border:0;padding:0;margin:0;background:transparent}',
  '#form .wizard-analysis > summary,#form .wizard-analysis > p[hidden]{display:none!important}',
  '#form .wizard-analysis-tools{margin:8px 0 0;padding:8px 10px;border:1px solid #e7dff0;border-radius:8px}',
  '#form .wizard-analysis-tools > summary{font-size:13px;cursor:pointer}',
  '#form .wizard-analysis-append{min-height:42px;width:100%;margin-top:8px}',
  '#form .wizard-analysis textarea,#form #impact{min-height:90px}',
  '#form .wizard-quick{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}',
  '#form .wizard-quick[hidden],#form .wizard-question[hidden],#form .wizard-caption[hidden]{display:none!important}',
  '#form .wizard-quick button{min-height:44px;font-size:13px}',
  '#form .wizard-footer button[hidden]{display:none!important}',
  '@media(max-width:600px){#form>.fields{grid-template-columns:minmax(0,1fr)}#form .wizard-title{font-size:18px}#form .wizard-footer button{min-height:48px}}',
  '#form .photo .thumbs{margin-top:12px}',
  '@media(min-width:760px){#form .wizard-steps{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '#identification .wizard-meta-toggle{width:100%;text-align:left;justify-content:flex-start;line-height:1.4;font-size:12px;min-height:46px}',
  '#identification #meta{margin-top:15px}',
  '@media(max-width:450px){#form .wizard-box{padding:0}#form .wizard-title{font-size:18px}#form .wizard-steps button{font-size:11px}#form .wizard-footer{gap:8px}}'
 ].join('\n');
 document.head.append(style);

 const wizard=document.createElement('section');
 wizard.id='vistoriaWizard';wizard.className='wizard-box';
 wizard.setAttribute('aria-label','Assistente de preenchimento em campo');
 wizard.innerHTML='<div class="wizard-eyebrow"><span>PREENCHIMENTO DO PONTO</span><span id="wizardCounter" role="status" aria-live="polite" aria-atomic="true">Etapa 1 de 5</span></div>'
  +'<progress class="wizard-progress" max="5" value="1" aria-label="Progresso do preenchimento"></progress>'
  +'<h3 class="wizard-title" id="wizardTitle" tabindex="-1"></h3>'
  +'<p class="wizard-question" id="wizardQuestion"></p>'
  +'<p class="wizard-caption" id="wizardCaption"></p>'
  +'<div class="wizard-pending"><span id="wizardPendingCount" role="status" aria-live="polite"></span><button type="button" class="secondary" id="wizardGoPending" hidden>Ir para próximo pendente</button></div>'
  +'<details class="wizard-navigation" id="wizardNavigation"><summary>Ir para outra etapa</summary><div class="wizard-steps" role="group" aria-label="Selecionar etapa"></div></details>'
  +'<button type="button" class="secondary wizard-more" id="wizardMore" aria-expanded="false" hidden></button>';
 fields.before(wizard);
 const modeBar=document.createElement('div');modeBar.className='wizard-mode';modeBar.setAttribute('role','group');modeBar.setAttribute('aria-label','Modo de preenchimento');
 modeBar.innerHTML='<button type="button" id="wizardModeQuick" aria-pressed="true">Rápido</button><button type="button" id="wizardModeGuide" aria-pressed="false">Por etapas</button>';
 wizard.before(modeBar);
 const modeHelp=document.createElement('p');modeHelp.className='wizard-mode-help';modeHelp.textContent='TAG, local, condição e situação. Adicione fotos e salve; os demais campos são opcionais.';modeBar.after(modeHelp);
 const modeQuick=modeBar.querySelector('#wizardModeQuick');const modeGuide=modeBar.querySelector('#wizardModeGuide');
 const quickDiagnostics=document.createElement('button');quickDiagnostics.type='button';quickDiagnostics.className='secondary';quickDiagnostics.textContent='＋ Diagnóstico e ferramentas técnicas';quickDiagnostics.id='wizardQuickDiagnostics';quickDiagnostics.style.minHeight='44px';fields.after(quickDiagnostics);
 // Reaproveita a área geral somente quando o técnico pedir, sem sobrescrever o campo.
 const areaInput=document.getElementById('area');const reportAreaInput=document.getElementById('reportArea');
 const useArea=document.createElement('button');useArea.type='button';useArea.className='secondary wizard-area-use';useArea.textContent='Usar área da vistoria';
 if(areaInput){areaInput.closest('label')?.after(useArea);group.set(useArea,{step:0,optional:false});}
 useArea.addEventListener('click',()=>{if(!areaInput||areaInput.value.trim()||!reportAreaInput?.value.trim())return;areaInput.value=reportAreaInput.value.trim();areaInput.dispatchEvent(new Event('input',{bubbles:true}));});
 // Sugestões apenas da vistoria aberta; não transporta dados de outro relatório.
 const recentAreas=document.createElement('div');recentAreas.className='wizard-recent-areas';recentAreas.setAttribute('aria-label','Áreas recentes desta vistoria');useArea.after(recentAreas);
 const statusField=document.getElementById('status');
 const statusShortcuts=document.createElement('div');statusShortcuts.className='wizard-status-shortcuts';statusShortcuts.setAttribute('role','group');statusShortcuts.setAttribute('aria-label','Selecionar situação do ponto');
 const statusButtons=[];
 if(statusField){const label=statusField.closest('label');label?.classList.add('wizard-status-native');label?.after(statusShortcuts);
  for(const option of statusField.options){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=option.textContent;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{if(statusField.value===option.value)return;statusField.value=option.value;statusField.dispatchEvent(new Event('input',{bubbles:true}));statusField.dispatchEvent(new Event('change',{bubbles:true}));});statusShortcuts.append(button);statusButtons.push({button,value:option.value});}
 }
 function recentAreaValues(rows,currentArea,reportArea){const exclude=String(reportArea||'').trim().toLocaleLowerCase('pt-BR');const seen=new Set();return [...rows].reverse().map(row=>String(row.area||'').trim()).filter(value=>{const key=value.toLocaleLowerCase('pt-BR');if(!key||key===exclude||seen.has(key))return false;seen.add(key);return true}).slice(0,3);}
 let areaSignature='';
 function renderRecentAreas(){const values=quickMode&&!areaInput?.value.trim()?recentAreaValues(records,areaInput?.value,reportAreaInput?.value):[];const signature=JSON.stringify(values);recentAreas.hidden=!values.length;if(signature===areaSignature)return;areaSignature=signature;recentAreas.replaceChildren();for(const value of values){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=value;button.addEventListener('click',()=>{if(areaInput.value.trim())return;areaInput.value=value;areaInput.dispatchEvent(new Event('input',{bubbles:true}));});recentAreas.append(button);}}
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
 // Navegação acessível no seletor de etapas, sem mudar o formulário ou salvar dados.
 nav.querySelector('.wizard-steps').addEventListener('keydown',event=>{
  const index=stepButtons.indexOf(document.activeElement);
  if(index<0)return;
  let target=index;
  if(event.key==='ArrowRight'||event.key==='ArrowDown')target=(index+1)%stepButtons.length;
  else if(event.key==='ArrowLeft'||event.key==='ArrowUp')target=(index-1+stepButtons.length)%stepButtons.length;
  else if(event.key==='Home')target=0;
  else if(event.key==='End')target=stepButtons.length-1;
  else return;
  event.preventDefault();
  stepButtons[target].focus();
 });
 const more=wizard.querySelector('#wizardMore');
 // A ação de opções fica junto aos campos, sem ocupar o cabeçalho.
 const footer=document.createElement('div');
 footer.className='wizard-footer';
 footer.innerHTML='<button type="button" class="secondary" id="wizardBack">Voltar</button>'
  +'<p id="wizardHint">As alterações permanecem no rascunho.</p>'
  +'<button type="button" id="wizardNext">Avançar</button>'
  +'<div class="wizard-quick" id="wizardQuick"><button type="button" class="secondary" id="wizardPhotos">Fotos</button><button type="button" id="wizardSavePoint">Salvar ponto</button></div>';
 form.append(footer);
 // Mantém as opções imediatamente antes dos campos que elas revelam.
 fields.after(more);
 const intro=form.querySelector(':scope > p.muted');
 if(intro)intro.hidden=true;
 const sectionLabel=form.querySelector(':scope > .step');
 if(sectionLabel)sectionLabel.hidden=true;
 const back=footer.querySelector('#wizardBack');
 const next=footer.querySelector('#wizardNext');
 const quick=footer.querySelector('#wizardQuick');
 const quickSave=footer.querySelector('#wizardSavePoint');
 const quickPhotos=footer.querySelector('#wizardPhotos');
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
 let quickMode=true;
 let quickExpanded=false;
 let quickDiagnosis=false;
 function isQuickVisible(config,corrected,details){
  if(config.step===4)return true;
  if(config.step===2)return details;
  if(config.step===3&&config.optional)return details||(corrected&&config.completion===true);
  return !config.optional||details;
 }
 function setMode(quick,step=0){quickMode=Boolean(quick);if(!quickMode)setStep(step,true);else{current=0;render();}}
 modeQuick.addEventListener('click',()=>setMode(true));
 modeGuide.addEventListener('click',()=>setMode(false,current));
 quickDiagnostics.addEventListener('click',()=>{if(quickExpanded){quickExpanded=false;quickDiagnosis=false;}else quickDiagnosis=!quickDiagnosis;render();if(quickDiagnosis)analysisDraft?.scrollIntoView({block:'center',behavior:'auto'});});
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
  reportToggle.setAttribute('aria-controls','meta');
  reportFields.before(reportToggle);
  reportToggle.addEventListener('click',()=>setReportExpanded(!reportExpanded));
  const oldSteps=document.querySelector('#view-editor .editor-steps');
  if(oldSteps)oldSteps.hidden=true;
  ['title','date','number','workOrder','reportArea'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{refreshReportSummary();if(id==='reportArea')render();}));
  setReportExpanded(false);
 }
 function refreshReportSummary(){
  if(!reportToggle)return;
  const number=document.getElementById('number')?.value.trim();
  const title=document.getElementById('title')?.value.trim()||'Vistoria sem título';
  const os=document.getElementById('workOrder')?.value.trim();
  const label=(number||title)+(os?' · OS '+os:'');
  reportToggle.textContent=(reportExpanded?'− Ocultar dados do relatório':'＋ Dados do relatório')+' · '+label.slice(0,65);
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
   if(config.step!==2&&config.optional&&hasFilled(node))expanded[config.step]=true;
  }
  if(document.getElementById('status')?.value==='Corrigido')expanded[3]=true;
 }
 function render(){
  const corrected=document.getElementById('status')?.value==='Corrigido';
  form.dataset.wizardMode=quickMode?'quick':'guided';
  modeQuick.setAttribute('aria-pressed',String(quickMode));modeGuide.setAttribute('aria-pressed',String(!quickMode));modeHelp.hidden=!quickMode;quickDiagnostics.hidden=!quickMode;
  useArea.hidden=!reportAreaInput?.value.trim()||Boolean(areaInput?.value.trim());
  renderRecentAreas();
  statusShortcuts.hidden=!quickMode||!statusField;
  for(const {button,value} of statusButtons)button.setAttribute('aria-pressed',String(statusField.value===value));
  quickDiagnostics.textContent=(quickDiagnosis||quickExpanded?'− Ocultar':'＋ Adicionar')+' diagnóstico';
  quickDiagnostics.setAttribute('aria-expanded',String(quickDiagnosis||quickExpanded));
  for(const [node,config] of group){
   node.dataset.wizardHidden=String(config.step!==current||(config.optional&&!expanded[current]));
   if(quickMode)node.dataset.wizardHidden=String(!(isQuickVisible(config,corrected,quickExpanded)||(quickDiagnosis&&config.step===2&&!config.optional)));
  }
  if(corrected&&quickMode){const completion=form.querySelector('.completion');if(completion)completion.open=true;}
  const submitButton=document.getElementById('submit');
  if(submitButton&&editing===null)submitButton.textContent=quickMode?'Salvar ponto':'Adicionar ao relatório';
  wizard.querySelector('progress').value=current+1;
  wizard.querySelector('progress').setAttribute('aria-valuetext','Etapa '+(current+1)+' de '+steps.length+': '+steps[current].title);
  wizard.querySelector('#wizardCounter').textContent='Etapa '+(current+1)+' de '+steps.length;
  wizard.querySelector('#wizardTitle').textContent=steps[current].title;
  wizard.querySelector('#wizardQuestion').textContent=steps[current].question;
  wizard.querySelector('#wizardCaption').textContent=steps[current].hint;
  wizard.querySelector('#wizardQuestion').hidden=true;
  wizard.querySelector('#wizardCaption').hidden=current!==steps.length-1;
  const pending=missingFields();
  const stagePending=pending.filter(item=>item.index===current).length;
  // Evita mensagens repetidas: o atalho aparece apenas quando há pendências.
  wizard.querySelector('.wizard-pending').hidden=!pending.length;
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
  more.hidden=!quickMode&&!hasOptions;
  more.setAttribute('aria-expanded',String(expanded[current]));
  if(quickMode)more.setAttribute('aria-expanded',String(quickExpanded));
  more.textContent=((quickMode?quickExpanded:expanded[current])?'− Ocultar':'＋ Mostrar')+(!quickMode&&current===2?' ferramentas adicionais':' campos adicionais');
  more.title=steps[current].more;
  back.disabled=current===0;
  quick.hidden=current===steps.length-1;
  quickSave.textContent=document.getElementById('submit')?.textContent==='Salvar alteração'?'Salvar alteração':'Salvar ponto';
  next.textContent=current===2?'Ir para ação':current===steps.length-2?'Ir para fotos':'Avançar';
  next.hidden=current===steps.length-1;
  footer.querySelector('#wizardHint').textContent=current===steps.length-1
   ?'Confira as fotos e toque em Adicionar ao relatório ou Salvar alteração.'
   :'Rascunho mantido ao avançar ou voltar.';
 }
 function setStep(index,scroll=false){
  current=Math.max(0,Math.min(steps.length-1,index));
  render();
  if(scroll){
   wizard.querySelector('#wizardTitle').focus({preventScroll:true});
   wizard.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
 }
 function openField(id,index){
  if(quickMode){quickExpanded=true;render();}else{expanded[index]=true;setStep(index,true);}
  const input=document.getElementById(id);
  const details=input?.closest('details');
  if(details)details.open=true;
  if(input)input.focus({preventScroll:true});
  if(quickMode&&input)input.scrollIntoView({block:'center',behavior:'auto'});
  if(typeof notify==='function')notify('Preencha: '+(input?.closest('label')?.textContent||id).trim().slice(0,90));
 }
 function validate(index){
  const required=requiredFields(index);
  for(const id of required){
   const input=document.getElementById(id);
   if(input&&!String(input.value||'').trim()){
    input.setAttribute('aria-invalid','true');
    openField(id,index);
    return false;
   }
  }
  return true;
 }
 wizard.querySelector('#wizardGoPending').addEventListener('click',()=>{
  const pending=missingFields();
  if(!pending.length)return;
  const target=pending.find(item=>item.index>=current)||pending[0];
  openField(target.id,target.index);
 });
 // O atalho usa a mesma validação e o mesmo submit do fluxo original.
 function savePointDirect(){
  const submit=document.getElementById('submit');
  if(!submit||submit.disabled)return;
  for(let index=0;index<steps.length-1;index++)if(!validate(index))return;
  setStep(steps.length-1);
  form.requestSubmit(submit);
 }
 quickSave.addEventListener('click',savePointDirect);
 quickPhotos.addEventListener('click',()=>setStep(steps.length-1,true));
 back.addEventListener('click',()=>setStep(current-1,true));
 next.addEventListener('click',()=>{if(validate(current))setStep(current+1,true)});
 more.addEventListener('click',()=>{if(quickMode)quickExpanded=!quickExpanded;else expanded[current]=!expanded[current];render()});
 // O PDF usa analysisHistory: registra o texto digitado ao salvar, sem alterar a situação.
 function recordAnalysisOnSave(){
  if(!analysisDraft||!analysisHistory)return false;
  const value=analysisDraft.value.trim();
  if(!value)return false;
  const previous=analysisHistory.value.trim();
  const stamp=new Date().toLocaleString('pt-BR');
  analysisHistory.value=(previous?previous+'\n\n':'')+'ANDAMENTO — '+stamp+'\n'+value;
  analysisDraft.value='';
  return true;
 }
 form.addEventListener('submit',event=>{
  if(!quickMode&&current<steps.length-1){
   event.preventDefault();event.stopImmediatePropagation();
   if(validate(current))setStep(current+1,true);
   return;
  }
  for(let step=0;step<steps.length-1;step++){
   if(!validate(step)){event.preventDefault();event.stopImmediatePropagation();return}
  }
  if(!busy)recordAnalysisOnSave();
 },true);
 form.addEventListener('input',event=>{
  if(event.target.matches('input,textarea,select')){
   if(String(event.target.value||'').trim())event.target.removeAttribute('aria-invalid');
   render();
  }
 });
 form.addEventListener('change',event=>{
  if(event.target.matches('input,textarea,select')){
   if(String(event.target.value||'').trim())event.target.removeAttribute('aria-invalid');
   render();
  }
 });
 form.addEventListener('invalid',event=>{
  if(reportFields?.contains(event.target)||reportExtra?.contains(event.target)){
   setReportExpanded(true);
   return;
  }
  const first=[...form.elements].find(el=>el.willValidate&&el.validity&&!el.validity.valid);
  if(event.target!==first)return;
  const holder=[...group.keys()].find(node=>node.contains(event.target));
  const stage=holder?group.get(holder).step:0;
  if(quickMode){quickExpanded=true;render();event.target.closest('details')?.setAttribute('open','');event.target.scrollIntoView({block:'center',behavior:'auto'});}else{expanded[stage]=true;setStep(stage,true);}
 },true);
 document.getElementById('status')?.addEventListener('change',()=>{
  if(document.getElementById('status').value==='Corrigido')expanded[3]=true;
  render();
 });
 const oldReset=reset;
 reset=function(){const result=oldReset.apply(this,arguments);quickExpanded=false;quickDiagnosis=false;expanded.fill(false);form.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));setStep(0);return result};
 const oldFill=fill;
 fill=function(){const result=oldFill.apply(this,arguments);form.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));quickExpanded=false;quickDiagnosis=false;expanded.fill(false);revealFilledOptions();setStep(0);setReportExpanded(false);return result};
 document.addEventListener('vistoria-point-editor-opened',()=>{quickExpanded=false;quickDiagnosis=false;expanded.fill(false);revealFilledOptions();setStep(0)});
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
