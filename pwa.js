(()=>{
 const button=document.getElementById('installApp'),help=document.getElementById('installHelp'),state=document.getElementById('offlineState'),panel=document.getElementById('installPanel');let prompt;
 if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)panel.hidden=true;
 function network(){state.textContent=navigator.onLine?'Nuvem disponível com conexão à internet.':'Sem internet. Continue preenchendo neste aparelho; salve na nuvem quando a conexão voltar.'}
 network();addEventListener('online',network);addEventListener('offline',network);
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;button.textContent='Instalar aplicativo';help.textContent='Adicione Vistorias ao celular para abrir em uma tela própria.'});
 button.addEventListener('click',async()=>{if(!prompt){help.textContent='No Chrome, toque em ⋮ → Instalar aplicativo.';return}const pending=prompt;prompt=null;await pending.prompt();const result=await pending.userChoice;button.textContent=result.outcome==='accepted'?'Instalação solicitada':'Como instalar'});
 addEventListener('appinstalled',()=>{panel.hidden=true;prompt=null});
 // Um único controle de atualização, independente do painel de instalação.
 if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
  const sw=navigator.serviceWorker;
  let action=null,updating=false,shownController=null,shownWorker=null,observed=null;
  const message=text=>{help.textContent=text;if(typeof notify==='function')notify(text);};
  const ready=()=>{
   if(!reg.waiting||updating)return;
   if(!action){
    action=document.createElement('button');action.type='button';action.id='vistoria-update';action.className='secondary';action.style.margin='8px';action.style.fontSize='12px';
    (document.querySelector('header')||document.body).append(action);
    action.addEventListener('click',apply);
   }
   shownController=sw.controller;shownWorker=reg.waiting;
   action.hidden=false;action.disabled=false;action.textContent='Atualizar aplicativo';
   action.setAttribute('aria-label','Salvar vistoria e atualizar aplicativo');
  };
  function waitForActivation(worker,before){
   return new Promise((resolve,reject)=>{
    let timer=null,finished=false;
    const finish=error=>{if(finished)return;finished=true;if(timer!==null)clearTimeout(timer);sw.removeEventListener('controllerchange',check);worker.removeEventListener('statechange',check);if(error)reject(error);else resolve();};
    const check=()=>{if(sw.controller&&(sw.controller===worker||sw.controller!==before))finish();else if(worker.state==='redundant')finish(Error('A nova versão foi substituída. Tente novamente.'));};
    sw.addEventListener('controllerchange',check);worker.addEventListener('statechange',check);
    timer=setTimeout(()=>finish(Error('Atualização não confirmada. Seus dados estão salvos. Tente novamente.')),15000);
    try{worker.postMessage({type:'ACTIVATE_UPDATE'});check();}catch(error){finish(error);}
   });
  }
  async function apply(){
   if(updating)return;
   if(typeof historyReady==='undefined'||!historyReady||typeof persistCurrent!=='function'){message('Aguarde o carregamento das vistorias antes de atualizar.');return;}
   if((typeof busy!=='undefined'&&busy)||(typeof historyBusy!=='undefined'&&historyBusy)||(typeof cloudWorking!=='undefined'&&cloudWorking)){message('Conclua a operação em andamento e tente novamente.');return;}
   const main=document.querySelector('main'),wasInert=main?.inert;
   updating=true;action.disabled=true;action.textContent='Salvando…';if(main)main.inert=true;
   let reloading=false;
   try{
    await persistCurrent();
    action.textContent='Atualizando…';
    if(!reg.waiting&&sw.controller===shownController&&shownWorker?.state!=='activated'&&navigator.onLine!==false)await reg.update();
    const worker=reg.waiting;
    if(worker)await waitForActivation(worker,sw.controller);
    else if(!(sw.controller&&(sw.controller!==shownController||shownWorker?.state==='activated')))throw Error('Nova versão ainda não disponível. Tente novamente.');
    reloading=true;location.reload();
   }catch(error){action.textContent='Tentar atualizar';message(error?.message||'Não foi possível atualizar. Tente novamente.');}
   finally{if(!reloading){updating=false;action.disabled=false;if(main)main.inert=wasInert;}}
  }
  const watch=()=>{const worker=reg.installing;if(worker&&worker!==observed){observed=worker;worker.addEventListener('statechange',ready);}ready();};
  reg.addEventListener('updatefound',watch);watch();
  // Detecta atualizações instaladas enquanto o usuário estava em outro aplicativo.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){watch();if(navigator.onLine!==false)void reg.update().catch(()=>{});}});
 }).catch(()=>{state.textContent='Modo offline indisponível. O aplicativo funciona com internet.'});
})();
