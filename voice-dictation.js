/* Ditado por voz: reconhecimento opt-in, sem gravar áudio no aplicativo. */
(()=>{
 'use strict';
 const inputs=new Set(['objective','problem','impact','action','completionWork','conclusion','analysisDraft','revisionNote']);
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 let active=null;
 const notice=(message)=>{if(typeof notify==='function')notify(message);};
 const clean=text=>String(text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 const append=(current,spoken)=>{
  const text=clean(spoken);
  if(!text)return String(current||'');
  const base=String(current||'');
  return base+(base&&!/\s$/.test(base)?' ':'')+text;
 };
 function readContext(){
  return {report:typeof activeReportId==='undefined'?null:activeReportId,point:typeof editing==='undefined'?null:editing};
 }
 function matches(session){
  const now=readContext();
  return session.field.isConnected&&session.field.value===session.original&&session.context.report===now.report&&session.context.point===now.point;
 }
 function release(session){
  if(active!==session)return;
  active=null;
  session.button.textContent='🎙️ Ditar por áudio';
  session.button.setAttribute('aria-pressed','false');
  session.button.classList.remove('voice-listening');
 }
 function start(field,button,status){
  if(!Speech){
   field.focus();
   status.textContent='Use o microfone do teclado do Android para ditar neste campo.';
   return;
  }
  if(active?.field===field){
   try{active.recognition.stop();active.status.textContent='Finalizando ditado…';}
   catch{release(active);}
   return;
  }
  if(active){
   const previous=active;
   release(previous);
   previous.status.textContent='Ditado anterior cancelado.';
   try{previous.recognition.abort();}catch{}
  }
  if(!confirm('Autoriza usar o microfone para escrever neste campo? Dependendo do navegador, o áudio pode ser processado pelo serviço de reconhecimento de voz.')){
   status.textContent='Ditado cancelado. Nenhum áudio foi iniciado.';
   return;
  }
  let recognition;
  try{recognition=new Speech();}
  catch{status.textContent='Ditado não disponível neste navegador. Use o microfone do teclado.';return;}
  const session={recognition,field,button,status,context:readContext(),original:field.value,accepted:false,closed:false};
  active=session;
  button.textContent='■ Parar ditado';button.setAttribute('aria-pressed','true');button.classList.add('voice-listening');
  status.textContent='Aguardando o microfone… Fale naturalmente em português.';
  recognition.lang='pt-BR';
  recognition.continuous=false;
  recognition.interimResults=false;
  recognition.maxAlternatives=1;
  recognition.onstart=()=>{if(active===session)status.textContent='Ouvindo… Toque em “Parar ditado” para finalizar.';};
  recognition.onresult=event=>{
   if(active!==session||session.accepted)return;
   const phrases=[];
   for(let i=event.resultIndex||0;i<(event.results?.length||0);i++){
    const result=event.results[i];
    if(result?.isFinal===false)continue;
    if(result?.[0]?.transcript)phrases.push(result[0].transcript);
   }
   const spoken=clean(phrases.join(' '));
   if(!spoken)return;
   if(spoken.length>4000){status.textContent='Ditado muito longo. Repita em partes menores.';return;}
   if(!matches(session)){status.textContent='O relatório ou o texto mudou. Ditado descartado para evitar sobrescrita.';session.accepted=true;return;}
   field.value=append(session.original,spoken);
   field.dispatchEvent(new Event('input',{bubbles:true}));
   if(typeof save==='function')save();
   session.accepted=true;
   status.textContent='Texto inserido. Confira os termos técnicos antes de salvar ou enviar.';
  };
  recognition.onerror=event=>{
   if(active!==session)return;
   const code=String(event?.error||'');
   status.textContent=code==='not-allowed'||code==='service-not-allowed'?'Microfone não autorizado. Permita o acesso nas configurações do navegador.':
    code==='no-speech'?'Nenhuma fala detectada. Tente novamente.':
    code==='network'?'Reconhecimento indisponível pela rede. Use o microfone do teclado.':
    'Não foi possível reconhecer a voz. Use o microfone do teclado ou tente novamente.';
   release(session);
  };
  recognition.onend=()=>{if(active===session){if(!session.accepted&&!status.textContent.includes('Não'))status.textContent='Ditado encerrado. Tente novamente se necessário.';release(session);}};
  try{recognition.start();}
  catch{status.textContent='Não foi possível iniciar o microfone. Use o microfone do teclado.';release(session);}
 }
 function addControls(){
  const fields=document.querySelectorAll('textarea,input[type="text"],input:not([type])');
  for(const field of fields){
   if(field.dataset.voiceReady==='1'||field.readOnly||field.disabled)continue;
   if(!inputs.has(field.id)&&!field.matches('textarea[data-guide-part]'))continue;
   const label=field.closest('label');
   if(!label)continue;
   field.dataset.voiceReady='1';
   const toolbar=document.createElement('div');toolbar.className='voice-controls';
   const button=document.createElement('button');button.type='button';button.className='secondary voice-button';
   button.textContent=Speech?'🎙️ Ditar por áudio':'🎤 Usar microfone do teclado';
   button.setAttribute('aria-label','Escrever por áudio: '+(field.getAttribute('aria-label')||label.firstChild?.textContent?.trim()||field.id||'campo'));
   button.setAttribute('aria-pressed','false');
   const status=document.createElement('span');status.className='voice-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   button.onclick=()=>start(field,button,status);
   toolbar.append(button,status);
   field.after(toolbar);
  }
 }
 addControls();
 const observer=new MutationObserver(()=>addControls());
 observer.observe(document.body,{subtree:true,childList:true});
})();
