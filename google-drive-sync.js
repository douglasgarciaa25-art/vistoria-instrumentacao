/* Vistoria Técnica — Google Drive Sync (2026-11-10)
   Add this script AFTER the app's original scripts, particularly history.js,
   shared-cloud.js and layout.js. Client-only: an OAuth token is held in memory.
   No client secrets, refresh tokens, or report data are sent to our servers.
*/
(() => {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const ROOT_FOLDER = 'Vistoria Técnica';
  const PREFIX = 'vistoria_';
  const STORE = 'vistoria-google-drive';
  const CLIENT_KEY = STORE + ':clientId';
  const CONNECTED_KEY = STORE + ':connectionWanted';
  const PERSISTENCE_ATTEMPT_KEY = STORE + ':persistenceAttempt';
  const FOLDER_KEY = STORE + ':folderId';
  const SYNC_KEY = STORE + ':syncMap';
  let accessToken = '', expiresAt = 0, googleAccount = '', running = false;
  let folderId = '', photosId = '', pdfsId = '', scheduled = null, authClient = null;
  let connecting = false;
  let enabled = false, lastStatus = '', hadErrors = false;
  let sessionCheck = null;
  const PHOTOS_KEY=STORE+':photoSynced';
  let photoSynced={}, syncScope=''; // Estado de envio vinculado à pasta/conta do Drive.
  let syncMap = {}, remoteItems = [];
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const display = (message, isError = false) => {
    lastStatus = message;
    const target = $('gdrive-status');
    if (target) { target.textContent = message; target.style.color = isError ? '#a23c28' : ''; }
    document.dispatchEvent(new CustomEvent('vistoria-google-status'));
  };
  const logError = e => { console.warn('[Vistoria / Google Drive]', e); display(`Falha no Google Drive: ${e.message}`, true); hadErrors = true; };
  const sessionMessage = message => { const target = $('gdrive-session-status'); if(target) target.textContent = message; };
  const validToken = () => Boolean(accessToken && Date.now() < expiresAt - 120000);
  function loadScope(id) {
    if (syncScope===id) return;
    syncScope=id;
    try { syncMap=JSON.parse(localStorage.getItem(SYNC_KEY+':'+id)||'{}'); }
    catch (_) { syncMap={}; }
    try { photoSynced=JSON.parse(localStorage.getItem(PHOTOS_KEY+':'+id)||'{}'); }
    catch (_) { photoSynced={}; }
  }
  function saveMap() { if(syncScope)localStorage.setItem(SYNC_KEY+':'+syncScope,JSON.stringify(syncMap)); }
  function savePhotoMap() { if(syncScope)localStorage.setItem(PHOTOS_KEY+':'+syncScope,JSON.stringify(photoSynced)); }
  function ensureDb() {
    if (typeof db === 'undefined' || !db || !historyReady) throw Error('Aguarde o carregamento das vistorias locais.');
  }
  function idbReq(request) { return new Promise((resolve, reject) => { request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); }); }
  function txDone(tx) { return new Promise((resolve, reject) => { tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); }); }
  async function reports() { ensureDb(); return idbReq(db.transaction('reports').objectStore('reports').getAll()); }
  async function putReport(row) {
    ensureDb();
    const tx = db.transaction('reports', 'readwrite');
    tx.objectStore('reports').put(row);
    await txDone(tx);
    if (typeof refreshHistory === 'function') await refreshHistory();
  }
  async function digest(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  }
  function assertReady() {
    if (!navigator.onLine) throw Error('Sem internet: os registros continuam salvos no aparelho.');
    if (!validToken()) {
      enabled = false;
      throw Error('Autorização Google expirada. Toque em "Conectar Google Drive" novamente.');
    }
  }
  async function request(url, opts = {}) {
    assertReady();
    const headers = new Headers(opts.headers || {});
    headers.set('Authorization', 'Bearer ' + accessToken);
    const response = await fetch(url, {...opts, headers, cache:'no-store'});
    if (response.status === 401) {
      accessToken=''; enabled=false;
      throw Error('Sessão Google expirou. Conecte novamente para continuar sincronizando.');
    }
    if (!response.ok) {
      const msg = await response.text();
      let detail = msg;
      try { detail = JSON.parse(msg)?.error?.message || msg; } catch (_) {}
      throw Error(`Drive ${response.status}: ${String(detail).slice(0,240)}`);
    }
    return response;
  }
  async function api(url, options) { return (await request(url, options)).json(); }
  async function listFolder(parent) {
    const found=[];
    let page = '';
    do {
      const q = `'${parent.replace(/'/g,"\\'")}' in parents and trashed = false`;
      const url = new URL(API);
      url.searchParams.set('q',q);
      url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,modifiedTime,appProperties,parents)');
      url.searchParams.set('pageSize','1000');
      if (page) url.searchParams.set('pageToken',page);
      const response = await api(url.href);
      found.push(...(response.files||[])); page=response.nextPageToken||'';
    } while (page);
    return found;
  }
  async function createFolder(name, parent='root') {
    return api(API+'?fields=id,name,mimeType', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})});
  }
  async function ensureFolder() {
    if (folderId) return folderId;
    let id = localStorage.getItem(FOLDER_KEY)||'';
    if (id) {
      try {
        const r=await api(`${API}/${encodeURIComponent(id)}?fields=id,name,trashed,parents`);
        if (!r.trashed && r.name===ROOT_FOLDER) folderId=id;
      } catch (_) { id=''; }
    }
    if (!folderId) {
      const existing=(await listFolder('root')).filter(f=>f.mimeType==='application/vnd.google-apps.folder'&&f.name===ROOT_FOLDER);
      folderId=existing[0]?.id || (await createFolder(ROOT_FOLDER,'root')).id;
    }
    localStorage.setItem(FOLDER_KEY, folderId);
    return folderId;
  }
  async function ensureSubfolder(kind) {
    if (kind==='Fotos' && photosId) return photosId;
    if (kind==='PDFs' && pdfsId) return pdfsId;
    const found=await listFolder(await ensureFolder());
    const id=found.find(f=>f.name===kind&&f.mimeType==='application/vnd.google-apps.folder')?.id || (await createFolder(kind,folderId)).id;
    if(kind==='Fotos') photosId=id; else pdfsId=id;
    return id;
  }
  async function resumableUpload(id, content, mimeType, metadata) {
    const blob=content instanceof Blob?content:new Blob([content],{type:mimeType});
    const base=id?`${UPLOAD}/${encodeURIComponent(id)}`:UPLOAD;
    const start=await request(`${base}?uploadType=resumable&fields=id,name,modifiedTime,appProperties`,{
      method:id?'PATCH':'POST',
      headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':mimeType,'X-Upload-Content-Length':String(blob.size)},
      body:JSON.stringify(metadata)
    });
    const location=start.headers.get('Location');
    if(!location)throw Error('Drive não retornou a URL para envio de arquivo grande.');
    // Google requires 256-KiB multiples for non-final chunks.
    const chunkSize=4*1024*1024;
    let offset=0;
    while(offset<blob.size){
      assertReady();
      const end=Math.min(offset+chunkSize,blob.size)-1;
      const response=await fetch(location,{
        method:'PUT',
        headers:{'Authorization':'Bearer '+accessToken,'Content-Type':mimeType,'Content-Range':`bytes ${offset}-${end}/${blob.size}`},
        body:blob.slice(offset,end+1)
      });
      if(response.status===308){
        const ack=response.headers.get('Range');
        offset=ack?Number(ack.split('-').pop())+1:end+1;
      }else if(response.ok){return response.json();}
      else throw Error('Envio grande interrompido (HTTP '+response.status+'). Reabra e sincronize para tentar novamente.');
    }
    throw Error('Google Drive não confirmou o envio do arquivo.');
  }
  async function createData(name, content, mimeType, parent, appProperties={}) {
    const boundary='vistoria_'+crypto.randomUUID().replace(/-/g,'');
    const metadata={name,mimeType,parents:[parent],appProperties};
    const size=content instanceof Blob?content.size:new Blob([content]).size;
    if(size>5*1024*1024)return resumableUpload(null,content,mimeType,metadata);
    const body=new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--\r\n`
    ],{type:`multipart/related; boundary=${boundary}`});
    const u=new URL(UPLOAD);u.searchParams.set('uploadType','multipart');u.searchParams.set('fields','id,name,modifiedTime,appProperties');
    return api(u.href,{method:'POST',body,headers:{'Content-Type':`multipart/related; boundary=${boundary}`}});
  }
  async function updateData(remoteId, content, hash) {
    if(new Blob([content]).size>5*1024*1024)return resumableUpload(remoteId,content,'application/json',{appProperties:{hash}});
    const url=`${UPLOAD}/${encodeURIComponent(remoteId)}?uploadType=media&fields=id,modifiedTime`;
    await api(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:content});
    return api(`${API}/${encodeURIComponent(remoteId)}?fields=id,modifiedTime,appProperties`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{hash}})});
  }
  async function downloadJson(id, expectedReportId) {
    const r=await request(`${API}/${encodeURIComponent(id)}?alt=media`);
    const doc=await r.json();
    if(doc.app!=='vistoria-tecnica'||doc.version!==1||!doc.document||!Array.isArray(doc.document.records)||!doc.document.meta) {
      throw Error('Arquivo remoto incompatível com a Vistoria Técnica.');
    }
    if(expectedReportId && doc.reportId!==expectedReportId)throw Error('Identificador da vistoria no Drive não confere com o arquivo.');
    return doc;
  }
  async function uploadPhotos(row) {
    const photoHashes=await digest((row.document.records||[]).flatMap(r=>(r.photos||[]).map(p=>p.src)));
    if(photoSynced[row.id]===photoHashes)return;
    const entries=[];
    (row.document.records||[]).forEach((r, i) => (r.photos||[]).forEach((photo,j)=>entries.push({photo,i,j,tag:String(r.tag||'ponto').slice(0,24)})));
    if (!entries.length) {photoSynced[row.id]=photoHashes;savePhotoMap();return;}
    const parent=await ensureSubfolder('Fotos');
    const existing=new Set((await listFolder(parent)).map(f=>f.name));
    for (const item of entries) {
      if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/.test(item.photo.src||'')) continue;
      const hash=await digest(item.photo.src);
      const type=item.photo.src.split(';',1)[0].split(':')[1];
      const extension=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
      const name=`foto_${row.id}_${item.i+1}_${item.j+1}_${hash.slice(0,12)}.${extension}`;
      if(existing.has(name)) continue;
      const raw=atob(item.photo.src.split(',')[1]);
      const buffer=new Uint8Array(raw.length);
      for(let n=0;n<raw.length;n++)buffer[n]=raw.charCodeAt(n);
      await createData(name,new Blob([buffer],{type}),type,parent,{reportId:String(row.id),hash});
      existing.add(name);
    }
    photoSynced[row.id]=photoHashes;savePhotoMap();
  }
  async function savePdf(blob,name) {
    if (!enabled || !validToken() || !navigator.onLine) return;
    try {
      const parent=await ensureSubfolder('PDFs');
      const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
      const safe=String(name||'Relatorio.pdf').replace(/[\\/:*?"<>|]/g,'-').slice(0,120);
      await createData(`${timestamp}_${safe}`,blob,'application/pdf',parent);
      display('PDF baixado e copiado para a pasta PDFs no Google Drive.');
    } catch(e) { logError(e); }
  }
  function validate(row) { return typeof row?.id==='string' && !!row.document?.meta && Array.isArray(row.document.records) && (typeof valid!=='function'||valid(row.document)) && (typeof checkPending!=='function'||checkPending(row.document)); }
  async function sync(receiveOnly=false) {
    if (!enabled || running) return;
    if (!navigator.onLine) { display('Offline: vistorias preservadas no aparelho.'); return; }
    if (!validToken()) { enabled=false; $('gdrive-connect').textContent='Reconectar Google Drive'; display('Autorização expirada. Toque em Reconectar; seus registros continuam salvos.',true); return; }
    if (typeof historyReady==='undefined'||!historyReady) return;
    if ((historyBusy || busy)&&receiveOnly!==true) { display('Aguardando conclusão do preenchimento antes de sincronizar.'); return; }
    running=true;
    let sent=0,received=0,conflicts=0;
    try {
      await ensureFolder();
      // Nunca reutilizar hashes de outro Drive. Evita sobrescrever arquivos de outra conta.
      loadScope(folderId);
      // Do not upload the draft until the main app commits it to IndexedDB.
      if (typeof persistCurrent==='function' && !historyBusy && !busy) await persistCurrent();
      let local=await reports();
      const removedIds=new Set([
        ...(await idbReq(db.transaction('trash').objectStore('trash').getAllKeys())),
        ...(await idbReq(db.transaction('draft').objectStore('draft').getAllKeys()))
          .filter(key=>typeof key==='string'&&key.startsWith('deleted-report:'))
          .map(key=>key.slice('deleted-report:'.length))
      ]);
      const items=await listFolder(folderId);
      remoteItems=items.filter(f=>f.name.startsWith(PREFIX)&&f.name.endsWith('.json')&&f.mimeType==='application/json');
      const remotes=new Map(remoteItems.filter(f=>f.appProperties?.reportId).map(f=>[f.appProperties.reportId,f]));
      for (const remote of remoteItems) {
        if (!remote.appProperties?.reportId) continue;
        const id=remote.appProperties.reportId;
        // Exclusão local não pode ser desfeita silenciosamente pelo backup no Drive.
        if(removedIds.has(id))continue;
        const current=local.find(r=>r.id===id);
        if (current) continue;
        const packet=await downloadJson(remote.id,id);
        if (!validate({id,document:packet.document})) continue;
        await putReport({id,updated:packet.savedAt||new Date().toISOString(),document:packet.document});
        syncMap[id]=remote.appProperties.hash||await digest(packet.document);saveMap();received++;
      }
      if(receiveOnly===true){display('Busca de originais no Drive concluída.');return;}
      local=await reports();
      for (const row of local) {
        if (!validate(row)||isTeamReport(row.id)) continue;
        const docHash=await digest(row.document);
        const remote=remotes.get(String(row.id));
        if (!remote) {
          display('Enviando vistoria '+(row.document.meta.number||row.id)+'…');
          const content=JSON.stringify({app:'vistoria-tecnica',version:1,reportId:row.id,savedAt:row.updated,document:row.document});
          await createData(`${PREFIX}${row.id}.json`,content,'application/json',folderId,{reportId:String(row.id),hash:docHash});
          syncMap[row.id]=docHash;saveMap();sent++;
          await uploadPhotos(row);
          continue;
        }
        const remoteHash=remote.appProperties?.hash;
        if (remoteHash===docHash) { syncMap[row.id]=docHash;saveMap(); await uploadPhotos(row); continue; }
        const last=syncMap[row.id];
        if (last && last===remoteHash) {
          // Compare metadata again immediately before an update to reduce stale writes.
          const check=await api(`${API}/${encodeURIComponent(remote.id)}?fields=id,appProperties`);
          if (check.appProperties?.hash!==remoteHash) { conflicts++; continue; }
          const content=JSON.stringify({app:'vistoria-tecnica',version:1,reportId:row.id,savedAt:row.updated,document:row.document});
          await updateData(remote.id,content,docHash);
          syncMap[row.id]=docHash;saveMap();sent++;
          await uploadPhotos(row);
        } else if (last && last===docHash) {
          // Mudança veio de outro aparelho; não reenviar o rascunho antigo por cima dela.
          const active=row.id===activeReportId;
          if(active&&!await activeMatchesSaved(row.id,docHash)){conflicts++;continue;}
          const scope=folderId,packet=await downloadJson(remote.id,row.id);
          if (!validate({id:row.id,document:packet.document})) continue;
          if(scope!==folderId||scope!==syncScope||!validToken()){conflicts++;continue;}
          const latest=await idbReq(db.transaction('reports').objectStore('reports').get(row.id));
          if(!latest||await digest(latest.document)!==docHash){conflicts++;continue;}
          if(active&&!await activeMatchesSaved(row.id,docHash)){conflicts++;continue;}
          const updated=packet.savedAt||new Date().toISOString();
          if(active){
            const tx=db.transaction(['reports','draft'],'readwrite');
            tx.objectStore('reports').put({id:row.id,updated,document:packet.document});
            tx.objectStore('draft').put({...structuredClone(packet.document),reportId:row.id},'current');
            await txDone(tx);
            reset();fill(structuredClone(packet.document));
            if(typeof refreshHistory==='function')await refreshHistory();
          }else{
            await putReport({id:row.id,updated,document:packet.document});
          }
          syncMap[row.id]=remoteHash;saveMap();received++;
        } else {
          // Duas edições divergentes: preservar ambas sem avançar a base para a remota.
          // O marcador bloqueia reenvio automático e cópias repetidas do mesmo conflito.
          const marker='conflito:'+remoteHash+':'+docHash;
          if(syncMap[row.id]===marker){conflicts++;continue;}
          const scope=folderId,packet=await downloadJson(remote.id,row.id);
          if(!validate({id:row.id,document:packet.document}))continue;
          if(scope!==folderId||scope!==syncScope||!validToken()){conflicts++;continue;}
          const current=await idbReq(db.transaction('reports').objectStore('reports').get(row.id));
          if(!current||await digest(current.document)!==docHash){conflicts++;continue;}
          const cloneId=crypto.randomUUID(),copy=structuredClone(packet.document);
          copy.meta={...copy.meta,title:(copy.meta.title||'Vistoria')+' (versão remota preservada)'};
          await putReport({id:cloneId,updated:new Date().toISOString(),document:copy});
          syncMap[row.id]=marker;saveMap();conflicts++;
        }
      }
      const now=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      display(`${conflicts?'Drive parcialmente sincronizado':'Drive sincronizado'} às ${now}. Enviadas: ${sent}; recebidas: ${received}; divergências preservadas: ${conflicts}.`);
      hadErrors=conflicts>0;
    } catch(e) { logError(e); }
    finally { running=false; }
  }
  function schedule(delay=3500) {
    if (!enabled) return;
    clearTimeout(scheduled); scheduled=setTimeout(sync,delay);
  }
  function loadGoogleScript() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=document.getElementById('vistoria-gis');
      if(existing) {existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(Error('Erro ao carregar login Google.')),{once:true});return;}
      const script=document.createElement('script');script.id='vistoria-gis';
      script.src='https://accounts.google.com/gsi/client';script.async=true;
      script.onload=resolve;script.onerror=()=>reject(Error('Não foi possível carregar a biblioteca Google.'));
      document.head.append(script);
    });
  }
  async function startConnection() {
    if (running || connecting) return;
    if (validToken()) { enabled=true; await sync(); await syncTeam(); return; }
    const clientId=$('gdrive-client-id')?.value.trim();
    if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId||'')) {
      display('Informe um ID do cliente OAuth do Google válido.',true);return;
    }
    localStorage.setItem(CLIENT_KEY,clientId);
    try {
      if(!window.google?.accounts?.oauth2){
        display('Preparando acesso ao Google. Toque em Conectar novamente.');
        loadGoogleScript().then(()=>display('Login Google pronto. Toque em Conectar Google Drive.')).catch(logError);
        return;
      }
      connecting=true;
      authClient=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,callback:async token=>{
        connecting=false;
        if (!token?.access_token) { display('Autorização não concedida.',true); return; }
        accessToken=token.access_token;
        expiresAt=Date.now()+(Number(token.expires_in||3600)*1000);
        localStorage.setItem(CONNECTED_KEY,'1');
        enabled=true;folderId='';photosId='';pdfsId='';
        syncScope='';syncMap={};photoSynced={};
        $('gdrive-disconnect').hidden=false;
        $('gdrive-connect').textContent='Google Drive conectado';
        display('Conectado ao Google Drive. Preparando pasta na raiz…');
        sessionMessage('Drive conectado nesta sessão. Para continuar conectado depois de fechar o aplicativo, toque em “Manter conta conectada” e autorize o acesso offline uma vez.');
        // Solicite autorização offline uma vez por aba, somente para membros aprovados.
        if(await tryAutomaticPersistence())return;
        await sync();
        await showTeam();
        await syncTeam();
      },error_callback:()=>{connecting=false;display('A janela do Google foi fechada ou bloqueada. Toque em Reconectar para tentar novamente.',true)}});
      authClient.requestAccessToken({prompt:localStorage.getItem(CONNECTED_KEY)==='1'?'':'consent'});
    }catch(e){connecting=false;logError(e)}
  }
  async function restoreSession(){
    if(validToken()||localStorage.getItem(CONNECTED_KEY)!=='1'||connecting||!navigator.onLine)return;
    if(sessionCheck)return sessionCheck;
    sessionMessage('Verificando a autorização de conexão automática…');
    sessionCheck=(async()=>{
      try{
        const response=await fetch('/api/personal-session',{method:'POST',cache:'no-store',credentials:'same-origin'});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.access_token){
          enabled=false;
          const detail=response.status===403
            ? 'Sua conta precisa estar aprovada para a conexão automática.'
            : response.status===401
              ? 'A conexão automática ainda não está autorizada ou expirou.'
              : 'Não foi possível renovar a conexão agora.';
          sessionMessage(detail+' Reconecte o Google Drive e toque em “Manter conta conectada”.'+(result.error?' ('+result.error+')':''));
          display('Drive desconectado. Vistorias locais preservadas.',true);
          return false;
        }
        if(localStorage.getItem(CONNECTED_KEY)!=='1')return false;
        accessToken=result.access_token;
        expiresAt=Date.now()+Number(result.expires_in||3600)*1000;
        enabled=true;
        try{sessionStorage.removeItem(PERSISTENCE_ATTEMPT_KEY);}catch{}
        $('gdrive-connect').textContent='Google Drive conectado';
        $('gdrive-disconnect').hidden=false;
        sessionMessage('Conexão automática ativa: a autorização é renovada enquanto a sessão persistente for válida (até 30 dias).');
        display('Conta Google reconectada automaticamente: '+(result.email||'conta autorizada'));
        await sync();
        await showTeam();
        await syncTeam();
        return true;
      }catch(e){
        sessionMessage('Não foi possível verificar a sessão agora. O aplicativo tentará novamente quando houver conexão.');
        display('Falha na renovação automática. Vistorias locais preservadas.',true);
        return false;
      }finally{sessionCheck=null;}
    })();
    return sessionCheck;
  }
  async function tryAutomaticPersistence(){
    try{
      if(sessionStorage.getItem(PERSISTENCE_ATTEMPT_KEY))return false;
      const {member}=await teamRequest('POST',{action:'request'});
      if(member?.status!=='approved')return false;
      sessionStorage.setItem(PERSISTENCE_ATTEMPT_KEY,'1');
      return await enablePersistent();
    }catch{return false;}
  }
  async function enablePersistent(){
    try{
      assertReady();
      sessionMessage('Abrindo autorização do Google para manter a conta conectada entre acessos…');
      const r=await fetch('/api/team-drive-authorize?personal=1',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{Authorization:'Bearer '+accessToken}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.url)throw Error(d.error||'Autorização indisponível');
      location.assign(d.url);
      return true;
    }catch(e){display(e.message,true);sessionMessage('Falha ao ativar conexão automática: '+e.message);return false;}
  }
  function disconnect() {
    const token=accessToken;
    const disconnectingSubject=queueMember?.google_subject;
    queueMember=null;++queueGeneration;$('gdrive-queue')?.replaceChildren();
    localStorage.removeItem(CONNECTED_KEY);
    try{sessionStorage.removeItem(PERSISTENCE_ATTEMPT_KEY);}catch{}
    if(disconnectingSubject)void window.VistoriaBackground?.clearFor(disconnectingSubject).catch(()=>{});
    void fetch('/api/personal-session',{method:'DELETE',cache:'no-store',credentials:'same-origin'}).catch(()=>{});
    accessToken='';expiresAt=0;enabled=false;clearTimeout(scheduled);
    $('gdrive-disconnect').hidden=true;
    $('gdrive-connect').textContent='Conectar Google';
    googleAccount='';folderId='';photosId='';pdfsId='';syncScope='';syncMap={};photoSynced={};remoteItems=[];
    ++teamViewGeneration;$('gdrive-team-users')?.replaceChildren();if($('gdrive-team-status'))$('gdrive-team-status').textContent='Conta desconectada';
    if(token&&window.google?.accounts?.oauth2)window.google.accounts.oauth2.revoke(token,()=>{});
    display('Desconectado. Arquivos já enviados continuam no Google Drive.');
    sessionMessage('Conexão automática desativada neste aparelho.');
  }
  async function teamRequest(method='GET',body=null,list=false){
    assertReady();
    const response=await fetch('/api/team'+(list?'?list=1':''),{method,cache:'no-store',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({error:'Servidor da equipe indisponível (HTTP '+response.status+').'}));
    if(!response.ok||!data||typeof data!=='object'||data.error)throw Error(data.error||'Falha no cadastro.');
    return data;
  }
  async function reportRequest(method='GET',id='',body=null,history=false,trash=false,version=null,part=null,downloadRevision=null,stateOnly=false){
    assertReady();
    if(method==='POST'&&body?.document){const bytes=new TextEncoder().encode(JSON.stringify(body.document));if(bytes.length>3000000){if(bytes.length>12000000)throw Error('Relatório acima de 12 MB. Reduza as fotos.');const {member}=await teamRequest();if(member?.status!=='approved')throw Error('Acesso não aprovado');const hash=await digest(body.document);const queueKey='vistoria-upload:'+member.google_subject+':'+id;let pending;try{pending=JSON.parse(localStorage.getItem(queueKey)||'null');}catch{}if(!pending||pending.hash!==hash||pending.revision!==body.revision||Date.now()-pending.created>86400000){pending={upload_id:crypto.randomUUID(),hash,revision:body.revision,created:Date.now()};localStorage.setItem(queueKey,JSON.stringify(pending));}const upload_id=pending.upload_id;const size=750000;const total=Math.ceil(bytes.length/size);const staged=await reportRequest('POST',id,{action:'upload-status',upload_id,revision:body.revision});const received=new Set(staged.parts||[]);for(let part=0;part<total;part++){if(received.has(part))continue;const chunk=bytes.subarray(part*size,(part+1)*size);let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));await reportRequest('POST',id,{action:'upload-part',upload_id,part,payload:btoa(binary),revision:body.revision});const status=$('gdrive-team-status');if(status)status.textContent='Enviando relatório: '+(part+1)+'/'+total;}const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const result=await reportRequest('POST',id,{action:'upload-finish',upload_id,total,revision:body.revision,sha256});localStorage.removeItem(queueKey);return result;}}
    const r=await fetch('/api/team-reports'+(id?'?id='+encodeURIComponent(id)+(history?'&history=1':version!==null?'&version='+encodeURIComponent(version):'')+(part!==null?'&part='+part+'&revision='+encodeURIComponent(downloadRevision):'')+(stateOnly?'&state=1':''):(trash?'?trash=1':'')),{method,cache:'no-store',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json().catch(()=>({error:'Servidor da equipe indisponível (HTTP '+r.status+').'}));if(!r.ok||d.error)throw Object.assign(Error(d.error||'Falha na vistoria compartilhada'),{status:r.status});if(d.segmented){if(!Number.isInteger(d.total)||d.total<1||d.total>16)throw Error('Quantidade de partes inválida');const chunks=[];let length=0;for(let i=0;i<d.total;i++){const p=await reportRequest('GET',id,null,false,false,version,i,d.revision);if(p.part!==i||p.total!==d.total||p.revision!==d.revision)throw Error('Download inconsistente');const chunk=Uint8Array.from(atob(p.payload),c=>c.charCodeAt(0));chunks.push(chunk);length+=chunk.length;}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return {...d,document:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}return d;
  }
  let teamRunning=false;
  const TEAM_IDS='vistoria-team-known-ids';
  const LOCAL_COPY_IDS='vistoria-team-local-copy-ids';
  function rememberTeamIds(remote){const ids=new Set(JSON.parse(localStorage.getItem(TEAM_IDS)||'[]')),copies=new Set(JSON.parse(localStorage.getItem(LOCAL_COPY_IDS)||'[]'));for(const item of remote){ids.add(item.report_id);copies.delete(item.report_id);}localStorage.setItem(TEAM_IDS,JSON.stringify([...ids]));localStorage.setItem(LOCAL_COPY_IDS,JSON.stringify([...copies]));}
  function isTeamReport(id){return JSON.parse(localStorage.getItem(TEAM_IDS)||'[]').includes(id);}
  function isLocalCopy(id){return JSON.parse(localStorage.getItem(LOCAL_COPY_IDS)||'[]').includes(id);}
  function rememberLocalCopy(id){const copies=new Set(JSON.parse(localStorage.getItem(LOCAL_COPY_IDS)||'[]'));copies.add(id);localStorage.setItem(LOCAL_COPY_IDS,JSON.stringify([...copies]));const ids=new Set(JSON.parse(localStorage.getItem(TEAM_IDS)||'[]'));ids.add(id);localStorage.setItem(TEAM_IDS,JSON.stringify([...ids]));}
  function isSharedTrashReport(id){return isTeamReport(id)&&!isLocalCopy(id);}
  let queueRunning=false,queueMember=null,queueGeneration=0;
  async function showPendingQueue(member){
    const host=$('gdrive-queue');if(!host||queueRunning||!member)return;
    const generation=queueGeneration;
    queueRunning=true;
    try{
      const baseline=JSON.parse(localStorage.getItem('vistoria-team-baseline:'+member.google_subject)||'{}');
      const local=await reports();const pending=[];
      for(const item of local){
        const prev=baseline[item.id];
        if(prev&&await digest(item.document)!==prev.hash)pending.push(item);
        else if(!prev&&!isTeamReport(item.id)&&localStorage.getItem('vistoria-team-auto:'+member.google_subject)==='1'&&validate(item)&&item.document.records?.length)pending.push(item);
      }
      if(generation!==queueGeneration)return;
      host.replaceChildren();
      const title=document.createElement('p');title.textContent=pending.length+' vistoria(s) com alterações locais a verificar na sincronização.';host.append(title);
      for(const item of pending){const row=document.createElement('p');row.textContent=(item.document.meta?.title||item.document.meta?.number||item.id)+' — '+(navigator.onLine?'Aguardando verificação':'Sem internet');host.append(row);}
    }catch{if(generation===queueGeneration)host.textContent='Não foi possível consultar as alterações locais.';}finally{queueRunning=false;if(generation!==queueGeneration&&queueMember)void showPendingQueue(queueMember);}
  }
  // Não sobrescrever nem publicar dados digitados que ainda não foram salvos.
  async function activeMatchesSaved(id,savedHash) {
    if(typeof activeReportId==='undefined'||activeReportId!==id)return true;
    if(saveTimer||historyBusy||busy||!historyReady)return false;
    return await digest(data())===savedHash;
  }
  // Renovação atômica: uma única linha por ID; o rascunho atual acompanha a revisão.
  // Sem base comprovada, guarda o original na área de conflitos, não em outra vistoria.
  async function replaceTeamLocal(item,original,document,member,archive=null){
    const id=item.report_id,account=member.google_subject,token=accessToken;
    const expected=original?JSON.stringify(original.document):null;
    const activeAtStart=activeReportId===id;
    if(typeof persistQueue!=='undefined')await persistQueue.catch(()=>{});
    if(activeAtStart&&!await activeMatchesSaved(id,original?await digest(original.document):null))return false;
    const sessionOK=()=>queueMember?.google_subject===account&&validToken()&&accessToken===token;
    const editorOK=()=>activeReportId!==id||(!saveTimer&&!historyBusy&&!busy&&historyReady&&expected!==null&&JSON.stringify(data())===expected);
    if(!sessionOK()||!editorOK())return false;
    const tx=db.transaction(['reports','draft','trash'],'readwrite'),done=txDone(tx),store=tx.objectStore('reports'),draft=tx.objectStore('draft'),trash=tx.objectStore('trash');
    let changed=false;
    const request=store.get(id);
    request.onsuccess=()=>{
      const latest=request.result;
      if((latest?JSON.stringify(latest.document):null)!==expected||!sessionOK()||!editorOK())return;
      const current=draft.get('current');
      current.onsuccess=()=>{
        if(!sessionOK()||!editorOK())return;
        // Não substituir o rascunho de outra vistoria aberto em outra aba.
        if(activeReportId===id&&current.result?.reportId&&current.result.reportId!==id)return;
        const marker=draft.get('deleted-report:'+id);
        marker.onsuccess=()=>{
          // A legacy local deletion is never undone by a routine cloud download.
          if(marker.result&&!canRestoreTeamTrash(marker.result,item,account))return;
          if(!sessionOK()||!editorOK())return;
          const deleted=trash.get(id);
          deleted.onsuccess=()=>{
            if(!sessionOK()||!editorOK())return;
            if(archive)draft.put(archive,'team-conflict:'+account+':'+id+':'+crypto.randomUUID());
            if(deleted.result)draft.put(deleted.result,'team-trash-archive:'+account+':'+id+':'+crypto.randomUUID());
            trash.delete(id);draft.delete('deleted-report:'+id);
            store.put({id,updated:item.updated_at||new Date().toISOString(),document});
            if(current.result?.reportId===id||activeReportId===id)draft.put({...structuredClone(document),reportId:id},'current');
            changed=true;
          };
        };
      };
    };
    await done;
    if(!changed)return false;
    // Se o usuário digitou durante o commit, a edição ativa prevalece e será conciliada no próximo ciclo.
    if(activeReportId===id&&sessionOK()&&editorOK()){
      reset();fill(structuredClone(document));
      const saved=$('saveState');if(saved)saved.textContent='Vistoria atualizada automaticamente da nuvem.';
    }
    return true;
  }
  function canRestoreTeamTrash(marker,item,account){
    return !!marker&&marker.account===account&&Number.isSafeInteger(marker.revision)&&Number(item.revision)>marker.revision;
  }
  async function markTeamTrash(id,account,revision){
    const tx=db.transaction(['reports','trash','draft'],'readwrite'),done=txDone(tx);
    const store=tx.objectStore('reports'),trash=tx.objectStore('trash'),draft=tx.objectStore('draft');
    const current=store.get(id);
    current.onsuccess=()=>{
      // Existing live records are moved atomically by applyTeamTrash.
      if(current.result)return;
      draft.put({account,revision:Number(revision)},'deleted-report:'+id);
      const old=trash.get(id);
      old.onsuccess=()=>{if(old.result)trash.put({...old.result,teamTrash:true,teamRevision:Number(revision)});};
    };
    await done;
  }
  // Never infer deletion from a missing listing: require an authenticated tombstone.
  async function applyTeamTrash(item,row,member){
    const id=item.report_id,account=member.google_subject,token=accessToken;
    if(!item.deleted_at||!row||!historyReady)return false;
    if(typeof persistQueue!=='undefined')await persistQueue.catch(()=>{});
    const expected=JSON.stringify(row.document);
    const sessionOK=()=>queueMember?.google_subject===account&&validToken()&&accessToken===token;
    const editorOK=()=>activeReportId!==id||(!saveTimer&&!historyBusy&&!busy&&JSON.stringify(data())===expected);
    if(!sessionOK()||!editorOK())return false;
    const tx=db.transaction(['reports','trash','draft'],'readwrite'),done=txDone(tx);
    const store=tx.objectStore('reports'),trash=tx.objectStore('trash'),draft=tx.objectStore('draft');
    let changed=false,closed=false;
    const req=store.get(id);
    req.onsuccess=()=>{
      const latest=req.result;if(!latest||JSON.stringify(latest.document)!==expected||!sessionOK()||!editorOK())return;
      const current=draft.get('current');
      current.onsuccess=()=>{
        if(!sessionOK()||!editorOK())return;
        if(current.result?.reportId===id&&JSON.stringify(current.result.records)!==JSON.stringify(latest.document.records))return;
        trash.put({...latest,deletedAt:item.deleted_at,teamTrash:true,teamRevision:item.revision});
        draft.put({account,revision:Number(item.revision)},'deleted-report:'+id);
        store.delete(id);
        if(current.result?.reportId===id)draft.delete('current');
        changed=true;closed=activeReportId===id;
      };
    };
    await done;
    if(changed&&closed&&activeReportId===id&&sessionOK()&&editorOK()){blankReport();await persistCurrent();}
    if(changed){await refreshHistory();await window.refreshTrash?.();}
    return changed;
  }
  const teamState=id=>reportRequest('GET',id,null,false,false,null,null,null,true);
  window.VistoriaTeamTrash={
    known:isSharedTrashReport,
    async move(id){
      if(!validToken()||navigator.onLine===false)throw Error('Conecte-se à equipe para mover a vistoria em todos os aparelhos.');
      const {member}=await teamRequest();
      if(member?.status!=='approved')throw Error('Acesso à equipe não aprovado.');
      let state;
      try{state=await teamState(id);}
      catch(error){
        // A cópia legada pode ter sido marcada como compartilhada sem existir no servidor.
        // Só a resposta autenticada de ausência autoriza oferecer a lixeira local.
        if(error.status!==404||error.message!=='Vistoria não encontrada')throw error;
        const local=(await reports()).find(row=>row.id===id);
        if(!local)throw error;
        rememberLocalCopy(id);
        return window.VistoriaLocalTrash.move(id);
      }
      if(member.role!=='admin')throw Error('Somente o administrador pode mover uma vistoria compartilhada para a lixeira da equipe.');
      await persistCurrent();
      const result=state.deleted_at?state:await reportRequest('DELETE',id,{revision:state.revision});
      await markTeamTrash(id,member.google_subject,result.revision);
      await syncTeam();await showTeam();await window.refreshTrash?.();
      notify('Vistoria movida para a lixeira da equipe. Os aparelhos conectados receberão a alteração.');
    },
    async restore(id){
      if(!validToken()||navigator.onLine===false)throw Error('Conecte-se à equipe para restaurar a vistoria.');
      const {member}=await teamRequest();
      if(member?.status!=='approved'||member.role!=='admin')throw Error('Somente o administrador pode restaurar uma vistoria compartilhada.');
      const state=await teamState(id);
      if(state.deleted_at)await reportRequest('POST',id,{action:'restore',revision:state.revision});
      const tx=db.transaction('draft','readwrite'),done=txDone(tx);
      tx.objectStore('draft').delete('deleted-report:'+id);await done;
      await syncTeam();await showTeam();await window.refreshTrash?.();
      notify('Restauração da equipe confirmada. A vistoria retornará com o mesmo ID.');
    }
  };
  function markTeamRenewed(id,revision,archived=false){
    for(const card of document.querySelectorAll('.cloud-report-card')){
      if(card.dataset.reportId!==id)continue;
      const status=card.querySelector('[data-team-renewal]');
      if(status)status.textContent=archived?'Atualizada · versão local anterior preservada para revisão':'Local atualizado · Rev. '+revision;
    }
  }
  async function syncTeam(receiveOnly=false){
    if(teamRunning||!validToken()||navigator.onLine===false)return;
    teamRunning=true;
    let teamSent=0,teamReceived=0,teamConflicts=0,teamDeferred=0;
    const conflictFields=[];
    try{
      const {member}=await teamRequest();
      if(member?.status!=='approved'){queueMember=null;++queueGeneration;$('gdrive-queue')?.replaceChildren();return;}
      if(queueMember?.google_subject!==member.google_subject)++queueGeneration;
      queueMember=member;
      const {reports:remote}=await reportRequest();
      rememberTeamIds(remote);
      const key='vistoria-team-baseline:'+member.google_subject;
      const baseline=JSON.parse(localStorage.getItem(key)||'{}');
      const background=window.VistoriaBackground?await window.VistoriaBackground.list():[];
      for(const job of background)if(job.subject===member.google_subject&&job.state==='sent'&&baseline[job.id]?.revision===job.revision){baseline[job.id]={revision:job.newRevision,hash:job.hash};localStorage.setItem(key,JSON.stringify(baseline));}
      const queued=new Set(background.filter(j=>j.subject===member.google_subject&&j.state==='pending').map(j=>j.id));
      let local=await reports();
      const remoteIdsForTrash=new Set(remote.map(x=>x.report_id));
      for(const row of local){
        if(remoteIdsForTrash.has(row.id)||!isSharedTrashReport(row.id))continue;
        try{
          const state=await teamState(row.id);
          if(state.report_id===row.id&&state.deleted_at){
            if(await applyTeamTrash(state,row,member))teamReceived++;else teamDeferred++;
          }
        }catch{teamDeferred++;}
      }
      local=await reports();
      await showPendingQueue(member);
      // A revisão recebida deve atualizar também a vistoria que está aberta.
      for(const item of remote){
        if(queueMember?.google_subject!==member.google_subject||!validToken())break;
        const marker=await idbReq(db.transaction('draft').objectStore('draft').get('deleted-report:'+item.report_id));
        if(marker&&!canRestoreTeamTrash(marker,item,member.google_subject)){
          teamDeferred++;
          conflictFields.push(item.report_id+': na lixeira local; confirme a remoção da equipe ou restaure manualmente');
          continue;
        }
        const previous=baseline[item.report_id];
        const row=local.find(x=>x.id===item.report_id);
        if(receiveOnly===true&&row)continue;
        const localHash=row?await digest(row.document):null;
        if(row&&previous?.revision===item.revision&&localHash===previous.hash)continue;
        // Uma fila ainda em transmissão pode carregar a revisão anterior: aguardar recibo.
        if(queued.has(item.report_id)){teamDeferred++;continue;}
        if(row&&!previous){
          const received=await reportRequest('GET',item.report_id);
          if(!validate({id:item.report_id,document:received.document})||received.revision!==item.revision){teamDeferred++;continue;}
          if(queueMember?.google_subject!==member.google_subject||!validToken()){teamDeferred++;continue;}
          const latest=await idbReq(db.transaction('reports').objectStore('reports').get(item.report_id));
          if(!latest||await digest(latest.document)!==localHash){teamDeferred++;continue;}
          const receivedHash=await digest(received.document);
          if(receivedHash===localHash){
            baseline[item.report_id]={revision:received.revision,hash:receivedHash};
            localStorage.setItem(key,JSON.stringify(baseline));markTeamRenewed(item.report_id,received.revision);
            continue;
          }
          // Sem base, não inferir quais campos são alterações locais. Renovar o mesmo ID
          // e arquivar as duas versões em uma única transação, com aviso para revisão.
          const archive={reportId:item.report_id,account:member.google_subject,baseRevision:null,remoteRevision:received.revision,local:row.document,remote:received.document,choices:[],reason:'missing-baseline',created:new Date().toISOString()};
          if(!await replaceTeamLocal(item,row,received.document,member,archive)){teamDeferred++;continue;}
          baseline[item.report_id]={revision:received.revision,hash:receivedHash};
          localStorage.setItem(key,JSON.stringify(baseline));
          teamReceived++;teamConflicts++;
          conflictFields.push(item.report_id+': versão local anterior preservada; consulte as versões locais de conflitos');
          markTeamRenewed(item.report_id,received.revision,true);
          if(typeof refreshHistory==='function')await refreshHistory();
          continue;
        }
        // Uma revisão remota e uma edição local podem ter avançado ao mesmo tempo.
        if(row&&localHash!==previous.hash){
          if(previous.revision!==item.revision){
            // Conciliação automática inclusive com editor aberto, se estiver integralmente salvo.
            if(!await activeMatchesSaved(item.report_id,localHash)){teamDeferred++;continue;}
            try{
              const base=await reportRequest('GET',item.report_id,null,false,false,previous.revision);
              const current=await reportRequest('GET',item.report_id);
              if(base.revision!==previous.revision||await digest(base.document)!==previous.hash||current.revision!==item.revision)throw Error('Revisão-base não confirmada');
              const {mergeReport}=await import('./team-merge.mjs');
              const merged=mergeReport(base.document,row.document,current.document);
              if(merged.conflicts.length){
                teamConflicts++;
                conflictFields.push(item.report_id+': '+merged.conflicts.slice(0,8).map(c=>c.path.join('.')||'identidade/base').join(', '));
                continue;
              }
              if(!validate({id:item.report_id,document:merged.document}))throw Error('Conciliação inválida');
              const remoteHash=await digest(current.document);
              if(!await replaceTeamLocal(item,row,merged.document,member)){teamDeferred++;continue;}
              // O hash de referência continua sendo o conteúdo remoto confirmado.
              // O envio seguinte usa o CAS original para publicar apenas sobre essa revisão.
              baseline[item.report_id]={revision:current.revision,hash:remoteHash};
              localStorage.setItem(key,JSON.stringify(baseline));teamReceived++;
              markTeamRenewed(item.report_id,current.revision);
              if(typeof refreshHistory==='function')await refreshHistory();
            }catch(e){
              teamConflicts++;conflictFields.push(item.report_id+': base ou revisão não confirmada');
            }
          }
          continue;
        }
        const active=typeof activeReportId!=='undefined'&&activeReportId===item.report_id;
        if(active&&!await activeMatchesSaved(item.report_id,localHash)){teamDeferred++;continue;}
        const d=await reportRequest('GET',item.report_id);
        if(!validate({id:item.report_id,document:d.document})||d.revision!==item.revision){teamDeferred++;continue;}
        const remoteHash=await digest(d.document);
        if(!await replaceTeamLocal(item,row,d.document,member)){teamDeferred++;continue;}
        baseline[item.report_id]={revision:d.revision,hash:remoteHash};
        localStorage.setItem(key,JSON.stringify(baseline));teamReceived++;
        markTeamRenewed(item.report_id,d.revision);
        if(typeof refreshHistory==='function')await refreshHistory();
      }
      if(receiveOnly===true){await refreshHistory();return;}
      if(localStorage.getItem('vistoria-team-auto:'+member.google_subject)==='1'){
        const remoteIds=new Set(remote.map(x=>x.report_id));
        for(const item of local){
          if(queueMember?.google_subject!==member.google_subject||!validToken()||localStorage.getItem('vistoria-team-auto:'+member.google_subject)!=='1')break;
          if(remoteIds.has(item.id)||isTeamReport(item.id)||baseline[item.id]||!validate(item)||!item.document.records?.length)continue;
          if(!await activeMatchesSaved(item.id,await digest(item.document))){teamDeferred++;continue;}
          try{
            const d=await reportRequest('POST',item.id,{document:item.document,revision:0});
            rememberTeamIds([{report_id:item.id}]);
            baseline[item.id]={revision:d.revision,hash:await digest(item.document)};
            localStorage.setItem(key,JSON.stringify(baseline));teamSent++;
          }catch(e){teamDeferred++;const status=$('gdrive-team-status');if(status)status.textContent='Envio pendente: '+e.message;}
        }
      }
      for(const item of remote){
        if(queued.has(item.report_id))continue;
        if(queueMember?.google_subject!==member.google_subject||!validToken())break;
        const previous=baseline[item.report_id];
        if(!previous||previous.revision!==item.revision)continue;
        const row=await idbReq(db.transaction('reports').objectStore('reports').get(item.report_id));
        if(!row)continue;
        const hash=await digest(row.document);
        if(hash===previous.hash)continue;
        if(!await activeMatchesSaved(item.report_id,hash)){teamDeferred++;continue;}
        try{
          const d=await reportRequest('POST',item.report_id,{document:row.document,revision:previous.revision});
          baseline[item.report_id]={revision:d.revision,hash};
          localStorage.setItem(key,JSON.stringify(baseline));teamSent++;
        }catch(e){teamDeferred++;const status=$('gdrive-team-status');if(status)status.textContent='Envio pendente: '+e.message;}

      }
      await showPendingQueue(member);
      const status=$('gdrive-team-status');
      if(status){
        const moment=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        status.textContent=(teamConflicts||teamDeferred?'Sincronização parcial':'Equipe sincronizada')+' às '+moment+
          '. Enviadas: '+teamSent+'; recebidas: '+teamReceived+
          '; conflitos: '+teamConflicts+'; pendentes: '+teamDeferred+'.'+(conflictFields.length?' Campos em conflito: '+conflictFields.join(' | ')+'. Versões preservadas.':'');
      }
    }catch(e){const status=$('gdrive-team-status');if(status)status.textContent='Equipe: sincronização pendente — '+e.message;}
    finally{teamRunning=false;}
  }
  window.addEventListener('online',()=>{if(validToken())void syncTeam();else void restoreSession();});

  // PDF emitido a partir da resposta autenticada do servidor; não confundir com assinatura digital.
  async function downloadVerifiedClosures(reportId,events){
    const closures=(events||[]).filter(e=>e.action==='completed');
    if(!closures.length)throw Error('Esta vistoria ainda não tem baixas autenticadas.');
    const pdf=await PDFLib.PDFDocument.create(),font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const safe=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?');
    let page=pdf.addPage([595,842]),y=800;
    const draw=(value,size=11)=>{const line=safe(value);if(y<65){page=pdf.addPage([595,842]);y=800;}page.drawText(line.slice(0,105),{x:42,y,size,font,color:PDFLib.rgb(0.08,0.15,0.2)});y-=size+9;};
    draw('VISTORIA TECNICA - COMPROVANTE DE BAIXAS',15);draw('Relatorio: '+reportId);draw('Emissao: '+new Date().toLocaleString('pt-BR'));draw('Origem: historico autenticado do servidor da equipe');draw('Documento de consulta; nao e uma assinatura digital.');y-=16;
    for(const e of closures){draw('OS: '+(e.work_order_snapshot||'Nao informada')+' | TAG: '+(e.tag_snapshot||'Nao informada'));draw('Tecnico cadastrado: '+(e.actor_name||'Nao registrado'));draw('Conta autenticada: '+(e.actor_email||'Nao registrada'));draw('Baixa: '+new Date(e.occurred_at).toLocaleString('pt-BR')+' | Revisao: '+e.revision);draw('Identificador permanente: '+e.point_id);y-=10;}
    const bytes=await pdf.save();download(new Blob([bytes],{type:'application/pdf'}),'Comprovante-baixas-'+reportId.slice(0,45)+'.pdf');
  }
  const cloudReportDisclosureStates=new Map();
  function cloudDisclosureState(subject){
    if(!cloudReportDisclosureStates.has(subject))cloudReportDisclosureStates.set(subject,{list:false,showFinalized:vistoriaShowFinalizedPreference(),areas:new Map(),menus:new Map()});
    return cloudReportDisclosureStates.get(subject);
  }
  function captureCloudReportDisclosures(root){
    const section=root?.querySelector('.cloud-team-reports[data-disclosure-subject]');
    if(!section)return;
    const state=cloudDisclosureState(section.dataset.disclosureSubject);
    const list=section.querySelector('.cloud-reports-disclosure');
    if(list)state.list=list.open;
    for(const folder of section.querySelectorAll('details[data-cloud-area]'))state.areas.set(folder.dataset.cloudArea,folder.open);
    for(const card of section.querySelectorAll('.cloud-report-card[data-report-id]')){
      const menu=card.querySelector('.cloud-report-menu');if(menu)state.menus.set(card.dataset.reportId,menu.open);
    }
  }
  async function showReports(member,box,status){
    const section=document.createElement('section');section.className='cloud-team-reports';section.dataset.disclosureSubject=member.google_subject;const disclosureState=cloudDisclosureState(member.google_subject);disclosureState.showFinalized=vistoriaShowFinalizedPreference();box.append(section);
    const heading=document.createElement('h4');heading.textContent='Vistorias compartilhadas';section.append(heading);const hint=document.createElement('p');hint.className='cloud-subtitle';hint.textContent='As revisões da equipe renovam automaticamente a vistoria neste aparelho, mantendo o mesmo ID.';section.append(hint);const queueDetails=document.createElement('details');queueDetails.className='cloud-disclosure cloud-queue-details';const queueTitle=document.createElement('summary');queueTitle.textContent='Envios e sincronização automática';queueDetails.append(queueTitle);section.append(queueDetails);
    const autoKey='vistoria-team-auto:'+member.google_subject;
    const autoLabel=document.createElement('label');autoLabel.style.cssText='display:flex;align-items:center;gap:8px';
    const auto=document.createElement('input');auto.type='checkbox';auto.style.width='auto';auto.checked=localStorage.getItem(autoKey)==='1';
    auto.onchange=()=>{if(auto.checked&&!confirm('Compartilhar automaticamente com a equipe aprovada as vistorias locais ainda não compartilhadas?')){auto.checked=false;return;}localStorage.setItem(autoKey,auto.checked?'1':'0');if(auto.checked)void syncTeam();};
    autoLabel.append(auto,document.createTextNode('Compartilhar novas vistorias automaticamente'));queueDetails.append(autoLabel);

    const queuePanel=document.createElement('div');queuePanel.setAttribute('role','status');queueDetails.append(queuePanel);
    const refreshBackground=async()=>{if(!window.VistoriaBackground)return;const jobs=(await window.VistoriaBackground.list()).filter(j=>j.subject===member.google_subject);queuePanel.replaceChildren();for(const job of jobs){const line=document.createElement('p');line.textContent='Vistoria '+job.id.slice(0,8)+' — '+(job.state==='sent'?'Enviada':job.state==='conflict'?'Conflito: revisar antes de reenviar':'Pendente'+(job.total?' ('+(job.progress||0)+'/'+job.total+' partes)':''));queuePanel.append(line);if(job.state==='pending'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar envio pendente';cancel.onclick=async()=>{try{if(!confirm('Cancelar somente o envio? O relatório local será preservado. Um envio já iniciado pode ter sido concluído.'))return;const current=await teamRequest();if(current.member?.google_subject!==job.subject)throw Error('Conta alterada');const removed=await window.VistoriaBackground.cancel(job);status.textContent=removed?'Envio retirado da fila. Confira a revisão remota se já estava em andamento.':'Fila alterada; atualize a situação.';await refreshBackground();}catch(e){status.textContent=e.message;}};queuePanel.append(cancel);}}};
    await refreshBackground();
    const refreshButton=document.createElement('button');refreshButton.type='button';refreshButton.textContent='Atualizar situação dos envios';refreshButton.onclick=()=>refreshBackground().catch(e=>{status.textContent=e.message});queueDetails.append(refreshButton);
    const retryButton=document.createElement('button');retryButton.type='button';retryButton.textContent='Reagendar envios pendentes';retryButton.onclick=async()=>{
      retryButton.disabled=true;
      try{
        if(!window.VistoriaBackground||!navigator.serviceWorker)throw Error('Sincronização em segundo plano indisponível.');
        const current=await teamRequest();
        if(!current.member?.google_subject||current.member.google_subject!==member.google_subject)throw Error('Conta alterada; abra novamente a equipe.');
        const session=await fetch('/api/personal-session',{method:'POST',cache:'no-store',credentials:'same-origin'});
        if(!session.ok||(await session.json()).subject!==member.google_subject)throw Error('Ative Manter conta conectada para reagendar.');
        const pending=(await window.VistoriaBackground.list()).filter(j=>j.subject===member.google_subject&&j.state==='pending');
        if(!pending.length){status.textContent='Não há envios pendentes desta conta.';return;}
        const reg=await navigator.serviceWorker.ready;
        if(!reg.sync?.register)throw Error('Este navegador não permite reagendar envios em segundo plano. Os relatórios permanecem salvos.');
        await reg.sync.register('vistoria-background');
        status.textContent=pending.length+' envio(s) pendente(s) reagendado(s) para quando o navegador permitir.';
        await refreshBackground();
      }catch(error){status.textContent=error.message;}
      finally{retryButton.disabled=false;}
    };queueDetails.append(retryButton);
    const {reports:remote}=await reportRequest();
    rememberTeamIds(remote);
    const local=await reports();
    const archiveKeys=await idbReq(db.transaction('draft').objectStore('draft').getAllKeys());
    const searchLabel=document.createElement('label');searchLabel.className='cloud-search-label';searchLabel.textContent='Buscar vistoria';section.append(searchLabel);const search=document.createElement('input');search.type='search';search.placeholder='Pesquisar TAG, OS, título ou referência';search.setAttribute('aria-label','Buscar vistoria compartilhada');searchLabel.append(search);

    // Consulta autenticada, sob demanda, também nos relatórios que só existem no Drive central.
    const osPanel=document.createElement('details');const osTitle=document.createElement('summary');
    osTitle.textContent='Pesquisar OS em todas as vistorias da equipe (incluindo as não salvas neste aparelho)';
    osPanel.append(osTitle);osPanel.className='cloud-disclosure';section.append(osPanel);
    const osInput=document.createElement('input');osInput.type='search';osInput.placeholder='Ex.: 00010505291';
    osInput.setAttribute('aria-label','Número da OS na nuvem');osPanel.append(osInput);
    const osMode=document.createElement('select');osMode.setAttribute('aria-label','Tipo da pesquisa por OS');
    for(const [value,label] of [['partial','OS contém o número'],['exact','OS exatamente igual']]){
      const o=document.createElement('option');o.value=value;o.textContent=label;osMode.append(o);
    }osPanel.append(osMode);
    const osStart=document.createElement('button');osStart.type='button';osStart.textContent='Pesquisar OS da equipe';osPanel.append(osStart);
    const osMore=document.createElement('button');osMore.type='button';osMore.className='secondary';osMore.textContent='Procurar nas próximas 20 vistorias';osMore.hidden=true;osPanel.append(osMore);
    const osResult=document.createElement('div');osResult.setAttribute('aria-live','polite');osPanel.append(osResult);
    let osCursor=0,osQuery='',osQueryMode='',osBusy=false,osGeneration=0;
    osInput.oninput=osMode.onchange=()=>{++osGeneration;osMore.hidden=true;osCursor=0;};
    async function searchRemoteOs(fresh){
      if(osBusy)return;
      const query=osInput.value.trim(),mode=osMode.value;
      if(query.length<2||query.length>80){osResult.textContent='Digite ao menos dois caracteres da OS.';return;}
      if(fresh){osCursor=0;osResult.replaceChildren();osQuery=query;osQueryMode=mode;}
      if(query!==osQuery||mode!==osQueryMode)return;
      const generation=osGeneration,view=teamViewGeneration,token=accessToken;
      osBusy=true;osStart.disabled=osMore.disabled=true;osMore.hidden=true;
      try{
        const {member:current}=await teamRequest();
        if(current?.google_subject!==member.google_subject)throw Error('Conta Google alterada. Atualize a equipe.');
        const r=await fetch('/api/team-reports?os='+encodeURIComponent(query)+'&match='+mode+'&offset='+osCursor,{cache:'no-store',headers:{Authorization:'Bearer '+token}});
        const d=await r.json().catch(()=>({error:'Servidor indisponível'}));
        if(!r.ok||d.error)throw Error(d.error||'Falha na busca de OS');
        if(generation!==osGeneration||view!==teamViewGeneration||token!==accessToken||!validToken())return;
        for(const match of d.matches||[]){
          const line=document.createElement('div');line.style.cssText='border-top:1px solid #ddd;padding:10px 0';
          const p=document.createElement('p');
          p.textContent='OS '+match.os+' — '+(match.scope==='report'?'Cabeçalho do relatório':'Ponto '+(match.tag||'TAG não informada'))+' — Revisão '+match.revision;
          line.append(p);
          const open=document.createElement('button');open.type='button';open.className='secondary';open.textContent='Criar cópia local para consultar';
          open.onclick=async()=>{
            open.disabled=true;
            try{
              if(!validToken())throw Error('Conecte a conta antes de consultar');
              const copy=await reportRequest('GET',match.report_id);
              const copyId=crypto.randomUUID();
              await putReport({id:copyId,updated:new Date().toISOString(),document:structuredClone(copy.document)});
              status.textContent='Cópia local criada, sem modificar o relatório da equipe.';
            }catch(e){status.textContent=e.message;}finally{open.disabled=false;}
          };
          line.append(open);osResult.append(line);
        }
        if(!d.matches?.length){const p=document.createElement('p');p.textContent='Nenhuma OS correspondente nesta página.';osResult.append(p);}
        if(d.truncated){const p=document.createElement('p');p.textContent='Resultados limitados nesta página. Refine a OS.';osResult.append(p);}
        osCursor=d.next_offset;osMore.hidden=osCursor===null;
        if(osCursor===null){const done=document.createElement('p');done.textContent='Busca concluída em todas as páginas consultadas.';osResult.append(done);}
      }catch(e){if(generation===osGeneration&&view===teamViewGeneration)osResult.textContent='Não foi possível concluir a busca: '+e.message;}
      finally{osBusy=false;osStart.disabled=osMore.disabled=false;}
    }
    osStart.onclick=()=>searchRemoteOs(true);
    osMore.onclick=()=>searchRemoteOs(false);

     const techDetails=document.createElement('details');techDetails.className='cloud-disclosure';const techTitle=document.createElement('summary');techTitle.textContent='Pesquisar por técnico que finalizou';techDetails.append(techTitle);section.append(techDetails);let verifiedReports=null;
     const tech=document.createElement('input');tech.type='search';tech.placeholder='Pesquisar baixas pelo nome cadastrado do técnico';tech.setAttribute('aria-label','Pesquisar técnico autenticado');techDetails.append(tech);
     const verifyButton=document.createElement('button');verifyButton.type='button';verifyButton.textContent='Pesquisar baixa autenticada';techDetails.append(verifyButton);
     const clearTech=document.createElement('button');clearTech.type='button';clearTech.className='secondary';clearTech.textContent='Limpar filtro do técnico';techDetails.append(clearTech);
     const techResults=document.createElement('div');techResults.setAttribute('aria-live','polite');techDetails.append(techResults);
     verifyButton.onclick=async()=>{if(tech.value.trim().length<3){techResults.textContent='Informe pelo menos três letras.';return;}verifyButton.disabled=true;try{const r=await fetch('/api/team-reports?technician='+encodeURIComponent(tech.value.trim()),{headers:{Authorization:'Bearer '+accessToken},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha na consulta');verifiedReports=new Set(d.matches.map(x=>x.report_id));techResults.replaceChildren();for(const match of d.matches){const p=document.createElement('p');p.textContent=(match.actor_name||'Não registrado')+' — '+(match.tag_snapshot||'TAG não informada')+' — OS '+(match.work_order_snapshot||'Não informada')+' — '+new Date(match.occurred_at).toLocaleString('pt-BR');techResults.append(p);}if(!d.matches.length)techResults.textContent='Nenhuma baixa autenticada encontrada.';listDisclosure.open=true;filter();}catch(e){techResults.textContent=e.message;}finally{verifyButton.disabled=false}};
     clearTech.onclick=()=>{verifiedReports=null;tech.value='';techResults.replaceChildren();filter()};
    const filterDetails=document.createElement('details');filterDetails.className='cloud-disclosure';const filterTitle=document.createElement('summary');filterTitle.textContent='Filtros e ordenação';filterDetails.append(filterTitle);section.append(filterDetails);const controls=document.createElement('div');controls.className='cloud-filter-grid';filterDetails.append(controls);const makeFilter=(label,opts)=>{const el=document.createElement('select');el.setAttribute('aria-label',label);for(const [value,text] of opts){const o=document.createElement('option');o.value=value;o.textContent=text;el.append(o)}controls.append(el);return el;};const ownership=makeFilter('Responsável',[['all','Todas'],['mine','Minhas'],['team','Da equipe']]);const area=makeFilter('Área',[['','Todas as áreas'],...vistoriaAreaCatalog(local).map(a=>[a,a])]);const sort=makeFilter('Ordenação',[['recent','Mais recentes'],['old','Mais antigas'],['tag','TAG A–Z']]);const count=document.createElement('small');count.className='cloud-result-count';count.setAttribute('aria-live','polite');
     const listDisclosure=document.createElement('details');listDisclosure.className='cloud-disclosure cloud-reports-disclosure';
     const listSummary=document.createElement('summary');listSummary.className='cloud-reports-summary';
     const summaryTitle=document.createElement('span');summaryTitle.className='cloud-reports-summary-title';summaryTitle.textContent='Mostrar vistorias';
     listSummary.append(summaryTitle,count);listDisclosure.append(listSummary);section.append(listDisclosure);listDisclosure.open=disclosureState.list;summaryTitle.textContent=listDisclosure.open?'Ocultar vistorias':'Mostrar vistorias';
     listDisclosure.addEventListener('toggle',()=>{summaryTitle.textContent=listDisclosure.open?'Ocultar vistorias':'Mostrar vistorias';});
     const finalFilter=document.createElement('label');finalFilter.className='vistoria-finalized-filter';const showFinalized=document.createElement('input');showFinalized.type='checkbox';showFinalized.checked=disclosureState.showFinalized;const finalizedLabel=document.createElement('span');finalizedLabel.setAttribute('aria-live','polite');finalFilter.append(showFinalized,finalizedLabel);listDisclosure.append(finalFilter);const createArea=document.createElement('button');createArea.type='button';createArea.className='secondary';createArea.textContent='+ Criar área';createArea.onclick=vistoriaCreateArea;listDisclosure.append(createArea);
     const entries=[];const filter=()=>{const q=search.value.trim().toLocaleLowerCase('pt-BR');let visible=0,finalizedCount=0;for(const e of entries){const current=historyItems.find(r=>r.id===e.row.dataset.reportId)?.document;const matchesFilters=(!verifiedReports||verifiedReports.has(e.row.dataset.reportId))&&e.text.toLocaleLowerCase('pt-BR').includes(q)&&(ownership.value==='all'||ownership.value===(e.mine?'mine':'team'))&&(!area.value||vistoriaAreaKey(vistoriaReportArea(current))===vistoriaAreaKey(area.value));if(matchesFilters)finalizedCount+=vistoriaClosedPointCount(current);const match=matchesFilters&&vistoriaVisible(current,showFinalized.checked);e.row.style.display=match?'grid':'none';if(match)visible++;}finalizedLabel.textContent=vistoriaFinalizedLabel(finalizedCount,showFinalized.checked);const ordered=[...entries].sort((a,b)=>sort.value==='tag'?a.tag.localeCompare(b.tag,'pt-BR'):sort.value==='old'?a.date-b.date:b.date-a.date);const selectedArea=area.value;const options=vistoriaAreaCatalog();area.replaceChildren(...[['','Todas as áreas'],...options.map(n=>[n,n])].map(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;return o}));area.value=options.includes(selectedArea)?selectedArea:'';
      for(const d of list.querySelectorAll(':scope > details[data-cloud-area]'))disclosureState.areas.set(d.dataset.cloudArea,d.open);
      const grouped=vistoriaGroupRows(ordered.map(e=>({document:historyItems.find(r=>r.id===e.row.dataset.reportId)?.document,entry:e})),[]);
      const blocks=grouped.map(([key,group])=>{const d=document.createElement('details');d.className='vistoria-area-group';d.dataset.cloudArea=key;d.open=disclosureState.areas.get(key)===true;const summary=document.createElement('summary'),name=document.createElement('span'),n=document.createElement('small');name.textContent=group.name;n.textContent=group.rows.filter(r=>r.entry.row.style.display!=='none').length+' vistoria(s)';summary.append(name,n);const body=document.createElement('div');body.className='vistoria-area-body cloud-area-body';for(const r of group.rows)body.append(r.entry.row);d.append(summary,body);d.hidden=!group.rows.some(r=>r.entry.row.style.display!=='none');return d;});list.replaceChildren(...blocks);count.textContent=visible+' de '+remote.length+' vistorias'+(visible===0?' — nenhuma encontrada':'');};search.oninput=()=>{if(search.value.trim())listDisclosure.open=true;filter();};ownership.onchange=area.onchange=sort.onchange=()=>{listDisclosure.open=true;filter();};const list=document.createElement('div');list.className='cloud-report-list';listDisclosure.append(list);showFinalized.onchange=()=>{disclosureState.showFinalized=vistoriaSaveFinalizedPreference(showFinalized.checked);const localFilter=document.getElementById('showFinalizedReports');if(localFilter?.checked!==showFinalized.checked){if(localFilter)localFilter.checked=showFinalized.checked;if(typeof renderHistory==='function')renderHistory();}filter();if(showFinalized.checked)vistoriaRevealFinalizedAreas(list,'details[data-cloud-area]');};list.addEventListener('vistoria-status-refresh',filter);
    const button=(parent,label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){status.textContent=e.message}finally{b.disabled=false}};parent.append(b);};
    for(const item of remote){
      const row=document.createElement('article');row.className='cloud-report-card';row.dataset.reportId=item.report_id;list.append(row);
      const doc=local.find(x=>x.id===item.report_id)?.document;
      const label=[doc?.meta?.title,doc?.meta?.number,...(doc?.records||[]).map(p=>p.tag),item.report_id].filter(Boolean).join(' — ');
      const title=document.createElement('strong');title.className='cloud-report-title';const tags=[...new Set((doc?.records||[]).map(p=>p.tag).filter(Boolean))];title.textContent=tags.join(' · ')||doc?.meta?.title||'Vistoria compartilhada';row.append(title);const meta=document.createElement('small');meta.className='cloud-report-meta';meta.textContent=[doc?.meta?.number||item.report_id.slice(0,8),'Rev. '+item.revision,item.updated_at?new Date(item.updated_at).toLocaleString('pt-BR'):'',item.owner_subject===member.google_subject?'Minha vistoria':'Equipe'].filter(Boolean).join(' · ');row.append(meta);
      const inspectionStatus=document.createElement('div');inspectionStatus.dataset.vistoriaStatus='1';inspectionStatus.innerHTML=vistoriaStatusHtml(doc);row.append(inspectionStatus);
      const finalize=document.createElement('button');finalize.type='button';finalize.className='secondary vistoria-finalize-action';finalize.dataset.finalizeCloudReport=item.report_id;finalize.textContent=vistoriaStatusAction(doc);finalize.disabled=!doc;finalize.onclick=()=>setVistoriaFinalized(item.report_id);row.append(finalize);const areaLabel=document.createElement('small');areaLabel.dataset.reportAreaLabel='1';areaLabel.className='cloud-report-meta';areaLabel.textContent=vistoriaReportArea(doc)||'Sem área definida';row.append(areaLabel);const move=document.createElement('button');move.type='button';move.className='secondary';move.dataset.moveCloudArea=item.report_id;move.textContent='Mover para área';move.disabled=!doc;move.onclick=()=>vistoriaMoveArea(item.report_id);row.append(move);
      const renewal=document.createElement('small');renewal.dataset.teamRenewal='1';renewal.className='cloud-report-meta';
      const archivePrefix='team-conflict:'+member.google_subject+':'+item.report_id+':';
      renewal.textContent=archiveKeys.some(k=>typeof k==='string'&&k.startsWith(archivePrefix))?'Versões anteriores preservadas · consultar histórico local':'Renovação automática ativa';
      row.append(renewal);
      entries.push({row,mine:item.owner_subject===member.google_subject,areas:(doc?.records||[]).map(p=>p.area),date:Date.parse(item.updated_at)||0,tag:title.textContent,text:label+' '+JSON.stringify(doc?.meta||{})+' '+(doc?.records||[]).map(p=>[p.pointWorkOrder,p.tag,p.area,p.os,p.order].filter(Boolean).join(' ')).join(' ')});
      const menu=document.createElement('details');menu.className='cloud-report-menu';menu.open=disclosureState.menus.get(item.report_id)===true;const summary=document.createElement('summary');summary.textContent='Histórico e outras ações';menu.append(summary);row.append(menu);
      // O botão é apenas uma alternativa; o mesmo fluxo roda sozinho.
      button(menu,'Atualizar da nuvem (mesmo ID)',async()=>{
        if(!validToken())throw Error('Conecte sua conta Google novamente.');
        if(teamRunning){status.textContent='Atualização automática em andamento.';return;}
        await syncTeam();
      });
      button(menu,'Revisar conflitos desta vistoria',async()=>{
        if(teamRunning||activeReportId===item.report_id)throw Error('Feche a edição e aguarde a sincronização antes de resolver conflitos.');
        const previousPanel=row.querySelector('[data-team-conflict]');if(previousPanel){previousPanel.remove();return;}
        const account=member.google_subject,key='vistoria-team-baseline:'+account;
        const original=await idbReq(db.transaction('reports').objectStore('reports').get(item.report_id));
        const baseline=JSON.parse(localStorage.getItem(key)||'{}')[item.report_id];
        if(!original||!baseline)throw Error('Não existe uma revisão-base local confirmada. Nenhum dado foi alterado.');
        const originalHash=await digest(original.document);
        const [base,latest]=await Promise.all([reportRequest('GET',item.report_id,null,false,false,baseline.revision),reportRequest('GET',item.report_id)]);
        if(base.revision!==baseline.revision||await digest(base.document)!==baseline.hash||latest.revision===baseline.revision)throw Error('Não há conflito de revisões confirmado.');
        const {mergeReport}=await import('./team-merge.mjs');
        const result=mergeReport(base.document,original.document,latest.document);
        if(!result.conflicts.length){await syncTeam();return;}
        const panel=document.createElement('div');panel.dataset.teamConflict='1';row.append(panel);
        const title=document.createElement('p');title.textContent='Escolha o valor de cada campo em conflito. As duas versões originais serão guardadas no aparelho.';panel.append(title);
        if(result.conflicts.some(c=>!['same-field','delete-edit'].includes(c.reason))){title.textContent='Conflito de identidade ou ordem dos pontos: revisão técnica necessária. Nenhum dado foi substituído.';return;}
        const selections=[];
        for(const conflict of result.conflicts){
          const label=document.createElement('label');label.textContent=conflict.path.join(' / ');
          const select=document.createElement('select');select.setAttribute('aria-label',conflict.path.join(' / '));
          for(const [value,text] of [['','Selecione a versão'],['local','Neste aparelho: '+conflict.local],['remote','Na nuvem: '+conflict.remote]]){
            const opt=document.createElement('option');opt.value=value;opt.textContent=text;select.append(opt);
          }
          label.append(select);panel.append(label);selections.push({path:conflict.path,select});
        }
        button(panel,'Aplicar escolhas ao mesmo ID',async()=>{
          if(teamRunning||activeReportId===item.report_id)throw Error('Aguarde a sincronização e feche a edição.');
          if(selections.some(x=>!x.select.value))throw Error('Escolha uma versão para todos os campos.');
          if(!confirm('Confirmar a conciliação? Os documentos originais serão preservados no histórico local de conflitos.'))return;
          teamRunning=true;
          try{
            const currentMember=(await teamRequest()).member;
            if(currentMember?.google_subject!==account||currentMember.status!=='approved'||!validToken())throw Error('Conta alterada.');
            const current=await reportRequest('GET',item.report_id);
            if(current.revision!==latest.revision||await digest(current.document)!==await digest(latest.document))throw Error('A nuvem recebeu nova revisão. Reabra a comparação.');
            if(window.VistoriaBackground&&(await window.VistoriaBackground.list()).some(j=>j.id===item.report_id&&j.subject===account&&j.state==='pending'))throw Error('Existe um envio pendente. Aguarde a fila.');
            const resolved=mergeReport(base.document,original.document,latest.document,new Map(selections.map(x=>[JSON.stringify(x.path),x.select.value])));
            if(resolved.conflicts.length||!validate({id:item.report_id,document:resolved.document}))throw Error('Conciliação incompatível; originais mantidos.');
            const remoteHash=await digest(latest.document);
            const tx=db.transaction(['reports','draft'],'readwrite'),done=txDone(tx),store=tx.objectStore('reports');
            let changed=false;const req=store.get(item.report_id);
            req.onsuccess=()=>{
              const currentLocal=req.result,nowBaseline=JSON.parse(localStorage.getItem(key)||'{}')[item.report_id];
              if(!currentLocal||JSON.stringify(currentLocal.document)!==JSON.stringify(original.document)||nowBaseline?.hash!==baseline.hash||nowBaseline?.revision!==baseline.revision||activeReportId===item.report_id||queueMember?.google_subject!==account||!validToken())return;
              const archive={reportId:item.report_id,account,baseRevision:base.revision,remoteRevision:latest.revision,local:original.document,remote:latest.document,choices:selections.map(x=>({path:x.path,choice:x.select.value})),created:new Date().toISOString()};
              tx.objectStore('draft').put(archive,'team-conflict:'+account+':'+item.report_id+':'+crypto.randomUUID());
              store.put({id:item.report_id,document:resolved.document,updated:archive.created});changed=true;
            };
            await done;if(!changed)throw Error('A vistoria mudou durante a operação. Reabra a comparação.');
            const map=JSON.parse(localStorage.getItem(key)||'{}');map[item.report_id]={revision:latest.revision,hash:remoteHash};localStorage.setItem(key,JSON.stringify(map));
            panel.remove();if(typeof refreshHistory==='function')await refreshHistory();status.textContent='Conciliação salva no mesmo ID; envio condicionado à revisão confirmada.';
          }finally{teamRunning=false;}
          await syncTeam();
        });
      });
      button(menu,'Consultar versões locais de conflitos',async()=>{
        const host=row.querySelector('[data-conflict-archive]');if(host){host.remove();return;}
        const panel=document.createElement('div');panel.dataset.conflictArchive='1';row.append(panel);
        const store=db.transaction('draft').objectStore('draft');
        const [keys,values]=await Promise.all([idbReq(store.getAllKeys()),idbReq(store.getAll())]);
        if(queueMember?.google_subject!==member.google_subject||!validToken()){panel.remove();return;}
        const prefix='team-conflict:'+member.google_subject+':'+item.report_id+':';
        const archived=values.filter((v,i)=>typeof keys[i]==='string'&&keys[i].startsWith(prefix)&&v?.account===member.google_subject&&v.reportId===item.report_id);
        if(!archived.length)panel.textContent='Sem conflitos resolvidos neste aparelho.';
        const {revisionChanges}=await import('./team-merge.mjs');
        for(const entry of archived){
          const details=document.createElement('details'),heading=document.createElement('summary');heading.textContent=new Date(entry.created).toLocaleString('pt-BR')+' · revisão '+entry.remoteRevision;details.append(heading);
          for(const change of revisionChanges(entry.local,entry.remote)){const p=document.createElement('p');p.textContent=change.path.join(' / ')+': aparelho '+change.before+' | nuvem '+change.after;details.append(p);}
          button(details,'Exportar versões originais (JSON)',async()=>{
            const session=(await teamRequest()).member;if(session?.google_subject!==entry.account||session.status!=='approved')throw Error('Conta alterada.');
            const url=URL.createObjectURL(new Blob([JSON.stringify(entry)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='conflito-'+item.report_id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          });panel.append(details);
        }
      });
      button(menu,'Histórico de revisões',async()=>{const d=await reportRequest('GET',item.report_id,null,true);const prior=row.querySelector('[data-team-history]');if(prior){prior.remove();return;}const details=document.createElement('div');details.dataset.teamHistory='1';for(const event of d.history||[]){const p=document.createElement('p');p.textContent='Revisão '+event.revision+' — '+({create:'Criação',update:'Atualização',delete:'Exclusão',restore:'Restauração'}[event.action]||event.action)+' — '+new Date(event.occurred_at).toLocaleString('pt-BR')+' — Técnico cadastrado: '+(event.actor_name||'Não registrado')+' — Conta: '+(event.actor_email||'Não registrada');details.append(p);
        if(event.available&&event.action==='update'){
          const previous=(d.history||[]).find(e=>e.available&&e.revision===event.revision-1);
          if(previous)button(details,'Ver campos alterados na revisão '+event.revision,async()=>{
            const prior=p.nextElementSibling;
            if(prior?.dataset.fieldChanges===String(event.revision)){prior.remove();return;}
            const [before,after]=await Promise.all([reportRequest('GET',item.report_id,null,false,false,previous.revision),reportRequest('GET',item.report_id,null,false,false,event.revision)]);
            if(before.revision!==previous.revision||after.revision!==event.revision)throw Error('Revisão histórica não confirmada.');
            const {revisionChanges}=await import('./team-merge.mjs');
            const panel=document.createElement('div');panel.dataset.fieldChanges=String(event.revision);
            const changes=revisionChanges(before.document,after.document);
            if(!changes.length)panel.textContent='Nenhuma diferença de conteúdo.';
            for(const change of changes){const line=document.createElement('p');line.textContent=change.path.join(' / ')+': '+change.before+' → '+change.after;panel.append(line);}
            p.after(panel);
          });
        }
        if(event.available)button(details,'Copiar revisão '+event.revision,async()=>{const d=await reportRequest('GET',item.report_id,null,false,false,event.revision);const copyId=crypto.randomUUID();rememberLocalCopy(copyId);await putReport({id:copyId,updated:new Date().toISOString(),document:structuredClone(d.document)});status.textContent='Revisão recuperada como cópia local, sem substituir o original.';});}for(const event of d.pointHistory||[]){const p=document.createElement('p');const action={created:'Inclusão',edited:'Edição',completed:'Finalização',reopened:'Reabertura',deleted:'Exclusão',restored:'Restauração'}[event.action]||event.action;p.textContent='Equipamento '+(event.tag_snapshot||event.point_id)+' — OS '+(event.work_order_snapshot||'Não informada')+' — '+action+' — '+new Date(event.occurred_at).toLocaleString('pt-BR')+' — Técnico: '+(event.actor_name||'Não registrado')+' — Conta: '+(event.actor_email||'Não registrada');details.append(p);}if((d.pointHistory||[]).some(e=>e.action==='completed'))button(details,'Baixar PDF de baixas autenticadas',()=>downloadVerifiedClosures(item.report_id,d.pointHistory));if(!details.childElementCount)details.textContent='Sem histórico registrado.';row.append(details)});
      button(menu,'Enviar revisão em segundo plano',async()=>{
        if(!window.VistoriaBackground||!navigator.serviceWorker)throw Error('Segundo plano indisponível neste navegador.');
        const reg=await navigator.serviceWorker.ready;if(!reg.sync)throw Error('Este navegador não oferece sincronização em segundo plano.');
        const session=await fetch('/api/personal-session',{method:'POST',cache:'no-store'});if(!session.ok||(await session.json()).subject!==member.google_subject)throw Error('Ative Manter conta conectada primeiro.');
        if(activeReportId===item.report_id)throw Error('Feche a edição antes de enfileirar.');
        const localRow=(await reports()).find(x=>x.id===item.report_id);
        const baseline=JSON.parse(localStorage.getItem('vistoria-team-baseline:'+member.google_subject)||'{}')[item.report_id];
        if(!localRow||!validate(localRow)||baseline?.revision!==item.revision)throw Error('Sincronize a revisão atual primeiro.');
        const hash=await digest(localRow.document);if(hash===baseline.hash)throw Error('Nenhuma alteração pendente.');
        if(new TextEncoder().encode(JSON.stringify(localRow.document)).length>12000000)throw Error('Segundo plano disponível até 12 MB.');
        if(!confirm('Autoriza enviar esta revisão para a equipe após fechar o aplicativo?'))return;
        await window.VistoriaBackground.put({id:item.report_id,subject:member.google_subject,document:localRow.document,revision:item.revision,hash,state:'pending',generation:crypto.randomUUID()});
        try{await reg.sync.register('vistoria-background');status.textContent='Revisão enfileirada. O navegador poderá enviar após fechar o aplicativo.';}catch{status.textContent='Revisão salva na fila, mas o agendamento falhou. Use Reagendar envios pendentes quando disponível.';}
      });
      button(row,'Criar cópia local',async()=>{const d=await reportRequest('GET',item.report_id);const copy=structuredClone(d.document);const copyId=crypto.randomUUID();rememberLocalCopy(copyId);await putReport({id:copyId,updated:new Date().toISOString(),document:copy});status.textContent='Cópia local criada; original compartilhado preservado.'});
      if(member.role==='admin')button(menu,'Mover para lixeira em todos os aparelhos',async()=>{if(confirm('Mover esta vistoria para a lixeira de toda a equipe? As fotos e o histórico serão preservados.'))await window.VistoriaTeamTrash.move(item.report_id)});
      for(const b of row.querySelectorAll('button')){b.classList.add('cloud-report-action');if(b.textContent==='Mover para lixeira em todos os aparelhos')b.classList.add('danger');}
    }
    filter();
    if(member.role==='admin'){
      const trash=document.createElement('details');trash.className='cloud-disclosure';const heading=document.createElement('summary');heading.textContent='Lixeira da equipe';trash.append(heading);section.append(trash);
      const content=document.createElement('div');trash.append(content);
      trash.addEventListener('toggle',async()=>{if(!trash.open)return;content.textContent='Carregando…';try{const d=await reportRequest('GET','',null,false,true);content.replaceChildren();if(!d.reports.length)content.textContent='Nenhuma vistoria excluída.';for(const item of d.reports){const row=document.createElement('div');const label=document.createElement('p');label.textContent=item.report_id+' · Excluída em '+new Date(item.deleted_at).toLocaleString('pt-BR');row.append(label);content.append(row);button(row,'Consultar auditoria',async()=>{const d=await reportRequest('GET',item.report_id,null,true);const previous=row.querySelector('[data-trash-audit]');if(previous){previous.remove();return;}const details=document.createElement('div');details.dataset.trashAudit='1';for(const event of d.history||[]){const p=document.createElement('p');p.textContent=({create:'Criação',update:'Atualização',delete:'Exclusão',restore:'Restauração'}[event.action]||event.action)+' — '+new Date(event.occurred_at).toLocaleString('pt-BR')+' — Técnico: '+(event.actor_name||'Não registrado')+' — '+(event.actor_email||'Conta não registrada');details.append(p);}if(!details.childElementCount)details.textContent='Sem histórico registrado.';row.append(details);});button(row,'Restaurar vistoria',async()=>{if(!confirm('Restaurar esta vistoria para a equipe?'))return;await reportRequest('POST',item.report_id,{action:'restore',revision:item.revision});await syncTeam();await showTeam();});}}catch(e){content.textContent=e.message;}});
    }
    const sharePanel=document.createElement('details');sharePanel.className='cloud-disclosure';const shareTitle=document.createElement('summary');shareTitle.textContent='Compartilhar vistoria deste aparelho';sharePanel.append(shareTitle);section.append(sharePanel);const select=document.createElement('select');select.setAttribute('aria-label','Vistoria local para compartilhar');sharePanel.append(select);
    for(const item of local){const option=document.createElement('option');option.value=item.id;const meta=item.document?.meta||{};const tags=[...new Set((item.document?.records||[]).map(p=>p.tag).filter(Boolean))];const date=new Date(item.updated);option.textContent=[meta.title||'Vistoria',tags.slice(0,3).join(', '),Number.isNaN(date.getTime())?'':date.toLocaleString('pt-BR'),String(item.id).slice(0,8)].filter(Boolean).join(' — ');select.append(option)}
    button(sharePanel,'Compartilhar vistoria local selecionada',async()=>{
      const item=(await reports()).find(x=>x.id===select.value);if(!item)throw Error('Selecione uma vistoria');
      const existing=remote.find(x=>x.report_id===item.id);
      if(existing&&!confirm('Publicar nova revisão da vistoria selecionada?'))return;
      const key='vistoria-team-baseline:'+member.google_subject;
      const baseline=JSON.parse(localStorage.getItem(key)||'{}');
      if(existing&&baseline[item.id]?.revision!==existing.revision)throw Error('Existe uma revisão remota diferente. Sincronize e compare os campos antes de publicar.');
      const d=await reportRequest('POST',item.id,{document:item.document,revision:existing?.revision||0});
      rememberTeamIds([{report_id:item.id}]);
      baseline[item.id]={revision:d.revision,hash:await digest(item.document)};
      localStorage.setItem(key,JSON.stringify(baseline));await showTeam();
    });
  }
  let teamViewGeneration=0;
  async function showTeam(){
    const generation=++teamViewGeneration;
    const target=$('gdrive-team-users'),status=$('gdrive-team-status');
    if(!target||!status)return;
    captureCloudReportDisclosures(target);const box=document.createElement('div');target.replaceChildren(box);
    try{
      const {member}=await teamRequest('POST',{action:'request'});
      if(generation!==teamViewGeneration)return;
      status.textContent=member?.status==='approved'?'Equipe conectada · '+(member.technician_name||member.email||'Conta Google aprovada'):member?.status==='blocked'?'Acesso à equipe bloqueado.':'Solicitação enviada. Aguarde aprovação.';
      if(member?.status!=='approved')return;
      try{await showReports(member,box,status)}catch(e){status.textContent=e.message;}
      if(member.role!=='admin')return;
      const adminPanel=document.createElement('details');adminPanel.className='cloud-disclosure cloud-admin-panel';const adminTitle=document.createElement('summary');adminTitle.textContent='Administração de usuários';adminPanel.append(adminTitle);box.append(adminPanel);const authorize=document.createElement('button');authorize.type='button';authorize.textContent='Autorizar Google Drive da equipe';
      authorize.onclick=async()=>{try{const r=await fetch('/api/team-drive-authorize',{method:'POST',headers:{Authorization:'Bearer '+accessToken}});const d=await r.json();if(!r.ok)throw Error(d.error);location.assign(d.url)}catch(e){status.textContent=e.message}};
      adminPanel.append(authorize);
      const {members}=await teamRequest('GET',null,true);
      for(const m of members){
        const row=document.createElement('div');row.textContent=m.email+' — '+m.status+' — '+(m.technician_name||'Nome não registrado')+' ';
        if(m.status==='approved'){const b=document.createElement('button');b.type='button';b.textContent='Cadastrar nome do técnico';b.onclick=async()=>{const name=prompt('Nome completo do técnico aprovado (vinculado à conta Google '+m.email+'):',m.technician_name||'');if(name===null)return;try{await teamRequest('POST',{action:'set-name',subject:m.google_subject,name});await showTeam()}catch(e){status.textContent=e.message}};row.append(b);}
        if(m.role!=='admin')for(const [label,value] of [['Aprovar','approved'],['Bloquear','blocked']]){
          const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{try{await teamRequest('POST',{subject:m.google_subject,status:value});await showTeam()}catch(e){status.textContent=e.message}};row.append(b);
        }
        row.className='cloud-member-row';adminPanel.append(row);
      }
    }catch(e){status.textContent=e.message;}
  }
  function setup() {
    if (!document.body || $('gdrive-panel')) return;
    const panel=document.createElement('section');
    panel.id='gdrive-panel';panel.className='card';
    panel.className='card cloud-dashboard';
     panel.innerHTML=`<div class="cloud-intro">
         <div class="cloud-mark" aria-hidden="true">☁</div>
         <div><span class="cloud-overline">ARMAZENAMENTO E SINCRONIZAÇÃO</span>
           <h3>Seu Google Drive</h3>
           <p>Relatórios e fotos organizados em um só lugar.</p>
         </div>
       </div>
       <div class="cloud-primary-actions">
         <button id="gdrive-connect" type="button">Conectar Google</button>
         <button id="gdrive-now" type="button" class="secondary">Sincronizar agora</button>
         <button id="gdrive-persistent" type="button" class="secondary">Manter conectado</button>
       </div>
       <p id="gdrive-status" class="cloud-connection-status" role="status" aria-live="polite">Desconectado. Conecte sua conta Google para sincronizar.</p>
       <details class="cloud-disclosure cloud-account-settings">
         <summary>Detalhes e configurações da conexão</summary>
         <p id="gdrive-session-status" class="muted" role="status" aria-live="polite">Para permanecer conectado, autorize “Manter conectado” uma vez.</p>
         <button id="gdrive-disconnect" type="button" class="danger" hidden>Desconectar conta</button>
         <details class="cloud-disclosure cloud-oauth-settings"><summary>Configuração avançada do Google</summary>
           <label for="gdrive-client-id">ID do cliente OAuth (Google Cloud)</label>
           <input id="gdrive-client-id" type="text" autocomplete="off" spellcheck="false" placeholder="123456789-...apps.googleusercontent.com">
         </details>
         <p class="muted">Os relatórios locais permanecem disponíveis offline. O Google pode solicitar nova autorização quando necessário.</p>
       </details>`;
     const anchor=document.getElementById('googleCloudHost')||document.getElementById('view-cloud')||document.querySelector('main');
    if(anchor)anchor.prepend(panel);
    const team=document.createElement('section');
    team.className='cloud-team-panel';
     team.innerHTML='<div class="cloud-section-head"><div><span class="cloud-overline">TRABALHO COMPARTILHADO</span><h3>Minha equipe</h3><p>Compartilhe e acompanhe vistorias com segurança.</p></div><button type="button" class="secondary" id="gdrive-team-refresh">Atualizar</button><button type="button" id="gdrive-team-local-sync" aria-label="Sincronizar vistorias locais com a equipe">Sincronizar com a equipe</button></div><p id="gdrive-team-status" class="cloud-team-status" role="status" aria-live="polite"></p><details class="cloud-disclosure cloud-local-queue"><summary>Alterações locais aguardando sincronização</summary><div id="gdrive-queue" role="status" aria-live="polite"></div></details><div id="gdrive-team-users"></div>';
    panel.append(team);
    $('gdrive-team-refresh').onclick=showTeam;
    $('gdrive-team-local-sync').onclick=async()=>{const button=$('gdrive-team-local-sync'),status=$('gdrive-team-status');if(teamRunning||historyBusy||busy)return notify('Aguarde a operação atual.');if(!validToken())return notify('Conecte sua conta Google antes de sincronizar com a equipe.');if(!navigator.onLine)return notify('Sem internet. As vistorias locais permanecem salvas.');if(!confirm('Enviar as vistorias locais ainda não compartilhadas para a equipe aprovada? As vistorias abertas serão preservadas e poderão ser enviadas após fechar a edição.'))return;button.disabled=true;try{await persistCurrent();const {member}=await teamRequest();if(member?.status!=='approved')throw Error('Sua conta precisa estar aprovada na equipe.');localStorage.setItem('vistoria-team-auto:'+member.google_subject,'1');status.textContent='Sincronizando vistorias locais com a equipe…';await syncTeam();await showTeam();status.textContent='Sincronização solicitada. Confira a fila de pendências e eventuais conflitos antes de considerar todos os envios concluídos.';}catch(e){status.textContent='Não foi possível sincronizar: '+e.message;}finally{button.disabled=false;}};
    $('gdrive-client-id').value=localStorage.getItem(CLIENT_KEY)||'176075378816-q3bad015gckijtjocifmod48al6m1e8q.apps.googleusercontent.com';
    loadGoogleScript().catch(()=>{}); // Precarrega; a autorização só ocorre após o clique do usuário.
    $('gdrive-connect').addEventListener('click',startConnection);
    $('gdrive-persistent').addEventListener('click',enablePersistent);
    $('gdrive-now').addEventListener('click',async()=>{if(!validToken())return startConnection();await sync();await syncTeam();await showTeam();});
    $('gdrive-disconnect').addEventListener('click',disconnect);
    document.addEventListener('vistoria-saved',()=>{if(!running)schedule()});
    function resume(){
      if(validToken()){enabled=true;schedule(1000);void syncTeam();return;}
      enabled=false;
      if(localStorage.getItem(CONNECTED_KEY)==='1'){
        $('gdrive-connect').textContent='Reconectar Google Drive';
        $('gdrive-disconnect').hidden=false;
        if(!navigator.onLine){
          sessionMessage('Offline. A conta será verificada quando a internet voltar.');
          display('Offline: vistorias locais disponíveis.');
          return;
        }
        void restoreSession();
      }
    }
    addEventListener('online',resume);
    addEventListener('offline',()=>{if(queueMember)void showPendingQueue(queueMember);});
    document.addEventListener('vistoria-saved',()=>{if(queueMember)void showPendingQueue(queueMember);});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume()});
    resume();
    setInterval(()=>{if(document.visibilityState==='visible'){if(validToken())sync();else void restoreSession();}},90000);
    setInterval(()=>{if(document.visibilityState==='visible'&&validToken()&&navigator.onLine!==false)void syncTeam();},20000);
    document.addEventListener('vistoria-saved',()=>{if(validToken())setTimeout(syncTeam,3000);if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(reg=>reg.sync?.register('vistoria-resume')).catch(()=>{});});
    navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='VISTORIA_RESUME')resume();});
    if(typeof window.download==='function') {
      const original=window.download;
      window.download=function(blob,name){const result=original.apply(this,arguments);if(/\.pdf$/i.test(String(name)))void savePdf(blob,name);return result;};
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
  async function reviewTechnical(field,text){
    assertReady();
    const response=await fetch('/api/technical-review',{
      method:'POST',
      cache:'no-store',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
      body:JSON.stringify({field,text}),
      signal:AbortSignal.timeout(45000)
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.error||'Revisão técnica indisponível no momento.');
    return payload;
  }
  window.VistoriaGoogleDrive={sync,disconnect,reviewTechnical,markPdfLocal:rememberLocalCopy,receiveForPdf:async()=>{await syncTeam(true);await sync(true);},getState:()=>({enabled,folderId,lastStatus,hadErrors})};
})();
