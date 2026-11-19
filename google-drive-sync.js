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
  async function sync() {
    if (!enabled || running) return;
    if (!navigator.onLine) { display('Offline: vistorias preservadas no aparelho.'); return; }
    if (!validToken()) { enabled=false; $('gdrive-connect').textContent='Reconectar Google Drive'; display('Autorização expirada. Toque em Reconectar; seus registros continuam salvos.',true); return; }
    if (typeof historyReady==='undefined'||!historyReady) return;
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
          // The remote record changed; download without losing local unsaved changes.
          const packet=await downloadJson(remote.id,row.id);
          if (!validate({id:row.id,document:packet.document})) continue;
          if(row.id===activeReportId) {
            const cloneId=crypto.randomUUID();
            const copy=structuredClone(packet.document);
            copy.meta={...copy.meta,title:(copy.meta.title||'Vistoria')+' (versão recebida do Drive)'};
            await putReport({id:cloneId,updated:new Date().toISOString(),document:copy});
            // Avoid importing the same remote revision repeatedly.
            syncMap[row.id]=remoteHash;saveMap();
            conflicts++;
          } else {
            // Outra aba pode ter editado esta vistoria durante o download remoto.
            const latest=await idbReq(db.transaction('reports').objectStore('reports').get(row.id));
            if(!latest||await digest(latest.document)!==docHash){conflicts++;continue;}
            await putReport({id:row.id,updated:packet.savedAt||new Date().toISOString(),document:packet.document});
            syncMap[row.id]=remoteHash;saveMap();received++;
          }
        } else {
          // When two devices edit without a shared baseline, preserve BOTH copies.
          const packet=await downloadJson(remote.id,row.id);
          const cloneId=crypto.randomUUID();
          const document=structuredClone(packet.document);
          document.meta={...document.meta,title:(document.meta.title||'Vistoria')+' (cópia remota)'};
          await putReport({id:cloneId,updated:new Date().toISOString(),document});
          // Record this remote hash as the last seen so this device can upload local changes next time.
          syncMap[row.id]=remoteHash;saveMap();conflicts++;
        }
      }
      const now=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      display(`Drive sincronizado às ${now}. Enviadas: ${sent}; recebidas: ${received}; divergências preservadas: ${conflicts}.`);
      hadErrors=false;
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
        display('Conectado ao Google Drive. Preparando pasta na raiz…');
        sessionMessage('Drive conectado nesta sessão. Para continuar conectado depois de fechar o aplicativo, toque em “Manter conta conectada” e autorize o acesso offline uma vez.');
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
  async function enablePersistent(){
    try{
      assertReady();
      sessionMessage('Abrindo autorização do Google para manter a conta conectada entre acessos…');
      const r=await fetch('/api/team-drive-authorize?personal=1',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{Authorization:'Bearer '+accessToken}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.url)throw Error(d.error||'Autorização indisponível');
      location.assign(d.url);
    }catch(e){display(e.message,true);sessionMessage('Falha ao ativar conexão automática: '+e.message);}
  }
  function disconnect() {
    const token=accessToken;
    const disconnectingSubject=queueMember?.google_subject;
    queueMember=null;++queueGeneration;$('gdrive-queue')?.replaceChildren();
    localStorage.removeItem(CONNECTED_KEY);
    if(disconnectingSubject)void window.VistoriaBackground?.clearFor(disconnectingSubject).catch(()=>{});
    void fetch('/api/personal-session',{method:'DELETE',cache:'no-store',credentials:'same-origin'}).catch(()=>{});
    accessToken='';expiresAt=0;enabled=false;clearTimeout(scheduled);
    $('gdrive-disconnect').hidden=true;
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
  async function reportRequest(method='GET',id='',body=null,history=false,trash=false,version=null,part=null,downloadRevision=null){
    assertReady();
    if(method==='POST'&&body?.document){const bytes=new TextEncoder().encode(JSON.stringify(body.document));if(bytes.length>3000000){if(bytes.length>12000000)throw Error('Relatório acima de 12 MB. Reduza as fotos.');const {member}=await teamRequest();if(member?.status!=='approved')throw Error('Acesso não aprovado');const hash=await digest(body.document);const queueKey='vistoria-upload:'+member.google_subject+':'+id;let pending;try{pending=JSON.parse(localStorage.getItem(queueKey)||'null');}catch{}if(!pending||pending.hash!==hash||pending.revision!==body.revision||Date.now()-pending.created>86400000){pending={upload_id:crypto.randomUUID(),hash,revision:body.revision,created:Date.now()};localStorage.setItem(queueKey,JSON.stringify(pending));}const upload_id=pending.upload_id;const size=750000;const total=Math.ceil(bytes.length/size);const staged=await reportRequest('POST',id,{action:'upload-status',upload_id,revision:body.revision});const received=new Set(staged.parts||[]);for(let part=0;part<total;part++){if(received.has(part))continue;const chunk=bytes.subarray(part*size,(part+1)*size);let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));await reportRequest('POST',id,{action:'upload-part',upload_id,part,payload:btoa(binary),revision:body.revision});const status=$('gdrive-team-status');if(status)status.textContent='Enviando relatório: '+(part+1)+'/'+total;}const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const result=await reportRequest('POST',id,{action:'upload-finish',upload_id,total,revision:body.revision,sha256});localStorage.removeItem(queueKey);return result;}}
    const r=await fetch('/api/team-reports'+(id?'?id='+encodeURIComponent(id)+(history?'&history=1':version!==null?'&version='+encodeURIComponent(version):'')+(part!==null?'&part='+part+'&revision='+encodeURIComponent(downloadRevision):''):(trash?'?trash=1':'')),{method,cache:'no-store',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json().catch(()=>({error:'Servidor da equipe indisponível (HTTP '+r.status+').'}));if(!r.ok||d.error)throw Error(d.error||'Falha na vistoria compartilhada');if(d.segmented){if(!Number.isInteger(d.total)||d.total<1||d.total>16)throw Error('Quantidade de partes inválida');const chunks=[];let length=0;for(let i=0;i<d.total;i++){const p=await reportRequest('GET',id,null,false,false,version,i,d.revision);if(p.part!==i||p.total!==d.total||p.revision!==d.revision)throw Error('Download inconsistente');const chunk=Uint8Array.from(atob(p.payload),c=>c.charCodeAt(0));chunks.push(chunk);length+=chunk.length;}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return {...d,document:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}return d;
  }
  let teamRunning=false;
  const TEAM_IDS='vistoria-team-known-ids';
  function rememberTeamIds(remote){const ids=new Set(JSON.parse(localStorage.getItem(TEAM_IDS)||'[]'));for(const item of remote)ids.add(item.report_id);localStorage.setItem(TEAM_IDS,JSON.stringify([...ids]));}
  function isTeamReport(id){return JSON.parse(localStorage.getItem(TEAM_IDS)||'[]').includes(id);}
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
  async function syncTeam(){
    if(teamRunning||!validToken()||navigator.onLine===false)return;
    teamRunning=true;
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
      const local=await reports();
      await showPendingQueue(member);
      for(const item of remote){
        const previous=baseline[item.report_id];
        const row=local.find(x=>x.id===item.report_id);
        if(previous?.revision===item.revision)continue;
        if(row&&(!previous||await digest(row.document)!==previous.hash)){const status=$('gdrive-team-status');if(status)status.textContent='Divergência preservada na vistoria '+item.report_id+'. Compare as versões antes de publicar.';continue;}
        if(typeof activeReportId!=='undefined'&&activeReportId===item.report_id)continue;
        const d=await reportRequest('GET',item.report_id);
        if(!d.document?.meta||!Array.isArray(d.document.records)||!validate({id:item.report_id,document:d.document}))continue;
        const latest=await idbReq(db.transaction('reports').objectStore('reports').get(item.report_id));
        if(latest&&(!previous||await digest(latest.document)!==previous.hash))continue;
        await putReport({id:item.report_id,updated:item.updated_at,document:d.document});
        baseline[item.report_id]={revision:d.revision,hash:await digest(d.document)};
        localStorage.setItem(key,JSON.stringify(baseline));
      }
      if(localStorage.getItem('vistoria-team-auto:'+member.google_subject)==='1'){
        const remoteIds=new Set(remote.map(x=>x.report_id));
        for(const item of local){
          if(queueMember?.google_subject!==member.google_subject||!validToken()||localStorage.getItem('vistoria-team-auto:'+member.google_subject)!=='1')break;
          if(remoteIds.has(item.id)||isTeamReport(item.id)||baseline[item.id]||!validate(item)||!item.document.records?.length)continue;
          if(typeof activeReportId!=='undefined'&&activeReportId===item.id)continue;
          try{
            const d=await reportRequest('POST',item.id,{document:item.document,revision:0});
            rememberTeamIds([{report_id:item.id}]);
            baseline[item.id]={revision:d.revision,hash:await digest(item.document)};
            localStorage.setItem(key,JSON.stringify(baseline));
          }catch(e){const status=$('gdrive-team-status');if(status)status.textContent='Envio pendente: '+e.message;}
        }
      }
      for(const item of remote){
        if(queued.has(item.report_id))continue;
        if(item.owner_subject!==member.google_subject&&member.role!=='admin')continue;
        if(typeof activeReportId!=='undefined'&&activeReportId===item.report_id)continue;
        if(queueMember?.google_subject!==member.google_subject||!validToken())break;
        const previous=baseline[item.report_id];
        if(!previous||previous.revision!==item.revision)continue;
        const row=await idbReq(db.transaction('reports').objectStore('reports').get(item.report_id));
        if(!row)continue;
        const hash=await digest(row.document);
        if(hash===previous.hash)continue;
        try{
          const d=await reportRequest('POST',item.report_id,{document:row.document,revision:previous.revision});
          baseline[item.report_id]={revision:d.revision,hash};
          localStorage.setItem(key,JSON.stringify(baseline));
        }catch(e){const status=$('gdrive-team-status');if(status)status.textContent='Envio pendente: '+e.message;}

      }
      await showPendingQueue(member);
    }catch(e){const status=$('gdrive-team-status');if(status)status.textContent='Equipe: '+e.message;}
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
  async function showReports(member,box,status){
    const section=document.createElement('section');section.className='cloud-team-reports';box.append(section);
    const heading=document.createElement('h4');heading.textContent='Vistorias compartilhadas';section.append(heading);const hint=document.createElement('p');hint.className='cloud-subtitle';hint.textContent='Encontre vistorias da equipe sem perder tempo.';section.append(hint);const queueDetails=document.createElement('details');queueDetails.className='cloud-disclosure cloud-queue-details';const queueTitle=document.createElement('summary');queueTitle.textContent='Envios e sincronização automática';queueDetails.append(queueTitle);section.append(queueDetails);
    const autoKey='vistoria-team-auto:'+member.google_subject;
    const autoLabel=document.createElement('label');autoLabel.style.cssText='display:flex;align-items:center;gap:8px';
    const auto=document.createElement('input');auto.type='checkbox';auto.style.width='auto';auto.checked=localStorage.getItem(autoKey)==='1';
    auto.onchange=()=>{if(auto.checked&&!confirm('Compartilhar automaticamente com a equipe aprovada as vistorias locais ainda não compartilhadas?')){auto.checked=false;return;}localStorage.setItem(autoKey,auto.checked?'1':'0');if(auto.checked)void syncTeam();};
    autoLabel.append(auto,document.createTextNode('Compartilhar novas vistorias automaticamente'));queueDetails.append(autoLabel);

    const queuePanel=document.createElement('div');queuePanel.setAttribute('role','status');queueDetails.append(queuePanel);
    const refreshBackground=async()=>{if(!window.VistoriaBackground)return;const jobs=(await window.VistoriaBackground.list()).filter(j=>j.subject===member.google_subject);queuePanel.replaceChildren();for(const job of jobs){const line=document.createElement('p');line.textContent='Vistoria '+job.id.slice(0,8)+' — '+(job.state==='sent'?'Enviada':job.state==='conflict'?'Conflito: revisar antes de reenviar':'Pendente'+(job.total?' ('+(job.progress||0)+'/'+job.total+' partes)':''));queuePanel.append(line);if(job.state==='pending'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar envio pendente';cancel.onclick=async()=>{try{if(!confirm('Cancelar somente o envio? O relatório local será preservado. Um envio já iniciado pode ter sido concluído.'))return;const current=await teamRequest();if(current.member?.google_subject!==job.subject)throw Error('Conta alterada');const removed=await window.VistoriaBackground.cancel(job);status.textContent=removed?'Envio retirado da fila. Confira a revisão remota se já estava em andamento.':'Fila alterada; atualize a situação.';await refreshBackground();}catch(e){status.textContent=e.message;}};queuePanel.append(cancel);}}};
    await refreshBackground();
    const refreshButton=document.createElement('button');refreshButton.type='button';refreshButton.textContent='Atualizar situação dos envios';refreshButton.onclick=()=>refreshBackground().catch(e=>{status.textContent=e.message});queueDetails.append(refreshButton);
    const {reports:remote}=await reportRequest();
    rememberTeamIds(remote);
    const local=await reports();
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
     verifyButton.onclick=async()=>{if(tech.value.trim().length<3){techResults.textContent='Informe pelo menos três letras.';return;}verifyButton.disabled=true;try{const r=await fetch('/api/team-reports?technician='+encodeURIComponent(tech.value.trim()),{headers:{Authorization:'Bearer '+accessToken},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha na consulta');verifiedReports=new Set(d.matches.map(x=>x.report_id));techResults.replaceChildren();for(const match of d.matches){const p=document.createElement('p');p.textContent=(match.actor_name||'Não registrado')+' — '+(match.tag_snapshot||'TAG não informada')+' — OS '+(match.work_order_snapshot||'Não informada')+' — '+new Date(match.occurred_at).toLocaleString('pt-BR');techResults.append(p);}if(!d.matches.length)techResults.textContent='Nenhuma baixa autenticada encontrada.';filter();}catch(e){techResults.textContent=e.message;}finally{verifyButton.disabled=false}};
     clearTech.onclick=()=>{verifiedReports=null;tech.value='';techResults.replaceChildren();filter()};
    const filterDetails=document.createElement('details');filterDetails.className='cloud-disclosure';const filterTitle=document.createElement('summary');filterTitle.textContent='Filtros e ordenação';filterDetails.append(filterTitle);section.append(filterDetails);const controls=document.createElement('div');controls.className='cloud-filter-grid';filterDetails.append(controls);const makeFilter=(label,opts)=>{const el=document.createElement('select');el.setAttribute('aria-label',label);for(const [value,text] of opts){const o=document.createElement('option');o.value=value;o.textContent=text;el.append(o)}controls.append(el);return el;};const ownership=makeFilter('Responsável',[['all','Todas'],['mine','Minhas'],['team','Da equipe']]);const area=makeFilter('Área',[['','Todas as áreas'],...[...new Set(local.flatMap(x=>(x.document?.records||[]).map(p=>p.area).filter(Boolean)))].sort().map(a=>[a,a])]);const sort=makeFilter('Ordenação',[['recent','Mais recentes'],['old','Mais antigas'],['tag','TAG A–Z']]);const count=document.createElement('small');count.className='cloud-result-count';count.setAttribute('aria-live','polite');section.append(count);const entries=[];const filter=()=>{const q=search.value.trim().toLocaleLowerCase('pt-BR');let visible=0;for(const e of entries){const match=(!verifiedReports||verifiedReports.has(e.row.dataset.reportId))&&e.text.toLocaleLowerCase('pt-BR').includes(q)&&(ownership.value==='all'||ownership.value===(e.mine?'mine':'team'))&&(!area.value||e.areas.includes(area.value));e.row.style.display=match?'grid':'none';if(match)visible++;}const ordered=[...entries].sort((a,b)=>sort.value==='tag'?a.tag.localeCompare(b.tag,'pt-BR'):sort.value==='old'?a.date-b.date:b.date-a.date);for(const e of ordered)list.append(e.row);count.textContent=visible+' de '+remote.length+' vistorias'+(visible===0?' — nenhuma encontrada':'');};search.oninput=filter;ownership.onchange=area.onchange=sort.onchange=filter;const list=document.createElement('div');list.className='cloud-report-list';section.append(list);
    const button=(parent,label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){status.textContent=e.message}finally{b.disabled=false}};parent.append(b);};
    for(const item of remote){
      const row=document.createElement('article');row.className='cloud-report-card';row.dataset.reportId=item.report_id;list.append(row);
      const doc=local.find(x=>x.id===item.report_id)?.document;
      const label=[doc?.meta?.title,doc?.meta?.number,...(doc?.records||[]).map(p=>p.tag),item.report_id].filter(Boolean).join(' — ');
      const title=document.createElement('strong');title.className='cloud-report-title';const tags=[...new Set((doc?.records||[]).map(p=>p.tag).filter(Boolean))];title.textContent=tags.join(' · ')||doc?.meta?.title||'Vistoria compartilhada';row.append(title);const meta=document.createElement('small');meta.className='cloud-report-meta';meta.textContent=[doc?.meta?.number||item.report_id.slice(0,8),'Rev. '+item.revision,item.updated_at?new Date(item.updated_at).toLocaleString('pt-BR'):'',item.owner_subject===member.google_subject?'Minha vistoria':'Equipe'].filter(Boolean).join(' · ');row.append(meta);
      entries.push({row,mine:item.owner_subject===member.google_subject,areas:(doc?.records||[]).map(p=>p.area),date:Date.parse(item.updated_at)||0,tag:title.textContent,text:label+' '+JSON.stringify(doc?.meta||{})+' '+(doc?.records||[]).map(p=>[p.pointWorkOrder,p.tag,p.area,p.os,p.order].filter(Boolean).join(' ')).join(' ')});
      const menu=document.createElement('details');menu.className='cloud-report-menu';const summary=document.createElement('summary');summary.textContent='Histórico e outras ações';menu.append(summary);row.append(menu);
      button(menu,'Histórico de revisões',async()=>{const d=await reportRequest('GET',item.report_id,null,true);const prior=row.querySelector('[data-team-history]');if(prior){prior.remove();return;}const details=document.createElement('div');details.dataset.teamHistory='1';for(const event of d.history||[]){const p=document.createElement('p');p.textContent='Revisão '+event.revision+' — '+({create:'Criação',update:'Atualização',delete:'Exclusão',restore:'Restauração'}[event.action]||event.action)+' — '+new Date(event.occurred_at).toLocaleString('pt-BR')+' — Técnico cadastrado: '+(event.actor_name||'Não registrado')+' — Conta: '+(event.actor_email||'Não registrada');details.append(p);if(event.available)button(details,'Copiar revisão '+event.revision,async()=>{const d=await reportRequest('GET',item.report_id,null,false,false,event.revision);const copyId=crypto.randomUUID();rememberTeamIds([{report_id:copyId}]);await putReport({id:copyId,updated:new Date().toISOString(),document:structuredClone(d.document)});status.textContent='Revisão recuperada como cópia local, sem substituir o original.';});}for(const event of d.pointHistory||[]){const p=document.createElement('p');const action={created:'Inclusão',edited:'Edição',completed:'Finalização',reopened:'Reabertura',deleted:'Exclusão',restored:'Restauração'}[event.action]||event.action;p.textContent='Equipamento '+(event.tag_snapshot||event.point_id)+' — OS '+(event.work_order_snapshot||'Não informada')+' — '+action+' — '+new Date(event.occurred_at).toLocaleString('pt-BR')+' — Técnico: '+(event.actor_name||'Não registrado')+' — Conta: '+(event.actor_email||'Não registrada');details.append(p);}if((d.pointHistory||[]).some(e=>e.action==='completed'))button(details,'Baixar PDF de baixas autenticadas',()=>downloadVerifiedClosures(item.report_id,d.pointHistory));if(!details.childElementCount)details.textContent='Sem histórico registrado.';row.append(details)});
      if(item.owner_subject===member.google_subject)button(menu,'Enviar revisão em segundo plano',async()=>{
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
        await reg.sync.register('vistoria-background');status.textContent='Revisão enfileirada. O navegador poderá enviar após fechar o aplicativo.';
      });
      button(row,'Criar cópia local',async()=>{const d=await reportRequest('GET',item.report_id);const copy=structuredClone(d.document);const copyId=crypto.randomUUID();rememberTeamIds([{report_id:copyId}]);await putReport({id:copyId,updated:new Date().toISOString(),document:copy});status.textContent='Cópia local criada; original compartilhado preservado.'});
      if(member.role==='admin')button(menu,'Excluir da equipe',async()=>{if(confirm('Excluir esta vistoria da lista da equipe?')){await reportRequest('DELETE',item.report_id);await showTeam()}});
      for(const b of row.querySelectorAll('button')){b.classList.add('cloud-report-action');if(b.textContent==='Excluir da equipe')b.classList.add('danger');}
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
      if(existing&&existing.owner_subject!==member.google_subject&&member.role!=='admin')throw Error('Sem permissão para editar');
      if(existing&&!confirm('Publicar nova revisão da vistoria selecionada?'))return;
      const key='vistoria-team-baseline:'+member.google_subject;
      const baseline=JSON.parse(localStorage.getItem(key)||'{}');
      if(existing&&baseline[item.id]?.revision!==existing.revision)throw Error('Existe uma revisão remota diferente. Abra uma cópia e compare antes de publicar.');
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
    const box=document.createElement('div');target.replaceChildren(box);
    try{
      const {member}=await teamRequest('POST',{action:'request'});
      if(generation!==teamViewGeneration)return;
      status.textContent=member?.status==='approved'?'Acesso aprovado — '+member.role+' — '+(member.technician_name||'Nome não registrado')+' — '+(member.email||'Conta Google'):member?.status==='blocked'?'Acesso bloqueado.':'Solicitação enviada. Aguarde aprovação.';
      if(member?.status!=='approved')return;
      try{await showReports(member,box,status)}catch(e){status.textContent=e.message;}
      if(member.role!=='admin')return;
      const authorize=document.createElement('button');authorize.type='button';authorize.textContent='Autorizar Google Drive da equipe';
      authorize.onclick=async()=>{try{const r=await fetch('/api/team-drive-authorize',{method:'POST',headers:{Authorization:'Bearer '+accessToken}});const d=await r.json();if(!r.ok)throw Error(d.error);location.assign(d.url)}catch(e){status.textContent=e.message}};
      box.append(authorize);
      const {members}=await teamRequest('GET',null,true);
      for(const m of members){
        const row=document.createElement('div');row.textContent=m.email+' — '+m.status+' — '+(m.technician_name||'Nome não registrado')+' ';
        if(m.status==='approved'){const b=document.createElement('button');b.type='button';b.textContent='Cadastrar nome do técnico';b.onclick=async()=>{const name=prompt('Nome completo do técnico aprovado (vinculado à conta Google '+m.email+'):',m.technician_name||'');if(name===null)return;try{await teamRequest('POST',{action:'set-name',subject:m.google_subject,name});await showTeam()}catch(e){status.textContent=e.message}};row.append(b);}
        if(m.role!=='admin')for(const [label,value] of [['Aprovar','approved'],['Bloquear','blocked']]){
          const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{try{await teamRequest('POST',{subject:m.google_subject,status:value});await showTeam()}catch(e){status.textContent=e.message}};row.append(b);
        }
        box.append(row);
      }
    }catch(e){status.textContent=e.message;}
  }
  function setup() {
    if (!document.body || $('gdrive-panel')) return;
    const panel=document.createElement('section');
    panel.id='gdrive-panel';panel.className='card';
    panel.style.cssText='border:1px solid #b4c5cf;max-width:100%;margin:16px 0;padding:18px;background:#fff';
    panel.innerHTML=`<h3 style="margin-top:0">Google Drive pessoal — sincronização</h3>
      <p class="muted">Vistorias, fotos e PDFs na pasta <b>Meu Drive / Vistoria Técnica</b>. As fotos ficam também dentro do backup JSON. </p>
      <details><summary>Configuração avançada</summary><label for="gdrive-client-id">ID do cliente OAuth (Google Cloud)</label>
      <input id="gdrive-client-id" type="text" autocomplete="off" spellcheck="false" placeholder="123456789-...apps.googleusercontent.com" style="width:100%;max-width:560px"></details>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button id="gdrive-connect" type="button">Conectar Google Drive</button>
        <button id="gdrive-persistent" type="button" class="secondary">Manter conta conectada</button>
        <button id="gdrive-now" type="button" class="secondary">Sincronizar agora</button>
        <button id="gdrive-disconnect" type="button" class="danger" hidden>Desconectar</button>
      </div>
      <p id="gdrive-status" role="status" aria-live="polite">Desconectado. Conecte sua conta Google para sincronizar.</p>
      <p id="gdrive-session-status" class="muted" role="status" aria-live="polite">Para permanecer conectado, autorize a opção “Manter conta conectada” após conectar.</p>
      <p class="muted">O sincronismo ocorre com o aplicativo aberto e internet. A opção “Manter conta conectada” permite renovar automaticamente a autorização ao reabrir, enquanto a sessão de até 30 dias for válida. O Google pode solicitar nova autorização. Vistorias locais permanecem disponíveis offline.</p>`;
    const anchor=document.getElementById('googleCloudHost')||document.getElementById('view-cloud')||document.querySelector('main');
    if(anchor)anchor.prepend(panel);
    const team=document.createElement('section');
    team.innerHTML='<h3>Gerenciamento de usuários</h3><button type="button" id="gdrive-team-refresh">Solicitar acesso / Atualizar usuários</button><p id="gdrive-team-status" role="status"></p><div id="gdrive-queue" role="status" aria-live="polite"></div><div id="gdrive-team-users"></div>';
    panel.append(team);
    $('gdrive-team-refresh').onclick=showTeam;
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
    setInterval(()=>{if(document.visibilityState==='visible'){if(validToken()){sync();syncTeam()}else void restoreSession();}},90000);
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
  window.VistoriaGoogleDrive={sync,disconnect,reviewTechnical,getState:()=>({enabled,folderId,lastStatus,hadErrors})};
})();
