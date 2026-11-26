(()=>{
 const button=document.getElementById('installApp'),help=document.getElementById('installHelp'),state=document.getElementById('offlineState'),panel=document.getElementById('installPanel');let prompt;
 if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)panel.hidden=true;
 function network(){state.textContent=navigator.onLine?'Nuvem disponível com conexão à internet.':'Sem internet. Continue preenchendo neste aparelho; salve na nuvem quando a conexão voltar.'}
 network();addEventListener('online',network);addEventListener('offline',network);
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;button.textContent='Instalar aplicativo';help.textContent='Adicione Vistorias ao celular para abrir em uma tela própria.'});
 button.addEventListener('click',async()=>{if(!prompt){help.textContent='No Chrome, toque em ⋮ → Instalar aplicativo.';return}const pending=prompt;prompt=null;await pending.prompt();const result=await pending.userChoice;button.textContent=result.outcome==='accepted'?'Instalação solicitada':'Como instalar'});
 addEventListener('appinstalled',()=>{panel.hidden=true;prompt=null});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
  const ready=()=>{
   if(!reg.waiting||document.getElementById('vistoria-update'))return;
   help.textContent='Nova versão disponível para instalar.';
   const action=document.createElement('button');action.type='button';action.id='vistoria-update';action.className='secondary';action.textContent='Atualizar aplicativo';action.style.margin='8px';action.style.fontSize='12px';
   (document.querySelector('header')||document.body).append(action);
   action.addEventListener('click',()=>{
    const shared=document.getElementById('applyUpdate');
    if(shared){shared.click();return;}
    help.textContent='Abra a aba Vistoria para salvar antes de atualizar.';
   });
  };
  ready();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')ready()})});
 }).catch(()=>{state.textContent='Modo offline indisponível. O aplicativo funciona com internet.'});
})();
