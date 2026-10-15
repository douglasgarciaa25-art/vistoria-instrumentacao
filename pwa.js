(()=>{
 const button=document.getElementById('installApp'),help=document.getElementById('installHelp'),state=document.getElementById('offlineState'),panel=document.getElementById('installPanel');let prompt;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 if(standalone())panel.hidden=true;
 function network(){state.textContent=navigator.onLine?'Nuvem disponível com conexão à internet.':'Sem internet. Continue preenchendo neste aparelho; salve na nuvem quando a conexão voltar.'}
 network();addEventListener('online',network);addEventListener('offline',network);
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;button.textContent='Instalar aplicativo';help.textContent='Adicione Vistorias ao celular para abrir em uma tela própria.'});
 button.addEventListener('click',async()=>{if(!prompt){help.textContent='Abra este endereço no Chrome completo. Toque em ⋮ → Instalar e criar atalho → Instalar. Se acabou de atualizar, feche a página e abra novamente.';return}const pending=prompt;prompt=null;await pending.prompt();const result=await pending.userChoice;button.textContent=result.outcome==='accepted'?'Instalação solicitada':'Como instalar'});
 addEventListener('appinstalled',()=>{panel.hidden=true;prompt=null});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{const ready=()=>{if(reg.waiting)help.textContent='Atualização pronta. Feche todas as janelas do aplicativo e abra novamente.'};ready();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')ready()})})}).catch(()=>{state.textContent='Uso offline indisponível neste navegador. O aplicativo continua disponível com internet.'});
})();
