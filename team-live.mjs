// Canal de notificações autenticado. A sincronização normal continua como
// alternativa de segurança e sempre valida a revisão/identidade no servidor.
export function createTeamLive({token,visible,online,onChange,fetcher=globalThis.fetch,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
 let controller=null,retryAt=0,failures=0,ready=false,timeout=null;
 const stop=()=>{ready=false;retryAt=0;failures=0;const c=controller;controller=null;if(timeout!==null){clearTimer(timeout);timeout=null}c?.abort()};
 const isReady=()=>ready&&Boolean(controller)&&visible()&&online()&&Boolean(token());
 async function start(){
  const auth=token();
  if(controller||!auth||!visible()||!online()||now()<retryAt)return;
  const c=new AbortController();controller=c;let established=false;
  timeout=setTimer(()=>c.abort(),45000);
  try{
   const response=await fetcher('/api/team-events',{method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth,Accept:'application/x-ndjson'},signal:c.signal});
   if(!response.ok||!response.body||!String(response.headers.get('content-type')||'').includes('application/x-ndjson'))throw Error('Canal indisponível');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   try{
    for(;;){
     const chunk=await reader.read();
     if(c.signal.aborted||controller!==c||token()!==auth||!visible()||!online())break;
     if(chunk.done)break;
     buffer+=decoder.decode(chunk.value,{stream:true});
     if(buffer.length>8192)throw Error('Evento inválido');
     let pos;
     while((pos=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);if(!line)continue;
      let packet;try{packet=JSON.parse(line)}catch{continue}
      if(packet?.type==='ready'&&!established){ready=true;established=true;failures=0;onChange();}
      else if(packet?.type==='change'&&established)onChange();
     }
    }
   }finally{try{await reader.cancel()}catch{}}
  }catch{/* consulta periódica permanece disponível */}
  finally{
   if(controller===c){controller=null;ready=false;if(timeout!==null){clearTimer(timeout);timeout=null}failures=established?0:Math.min(failures+1,5);retryAt=now()+(established?1000:Math.min(60000,2000*2**failures));}
  }
 }
 return {start,stop,isReady};
}
