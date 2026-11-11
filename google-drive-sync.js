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
  const FOLDER_KEY = STORE + ':folderId';
  const SYNC_KEY = STORE + ':syncMap';
  let accessToken = '', expiresAt = 0, googleAccount = '', running = false;
  let folderId = '', photosId = '', pdfsId = '', scheduled = null, authClient = null;
  let enabled = false, lastStatus = '', hadErrors = false;
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
    if (!validToken()) { enabled=false; display('Reconecte o Google Drive para continuar a sincronização.',true); return; }
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
        if (!validate(row)) continue;
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
    if (running) return;
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
      authClient=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,callback:async token=>{
        if (!token?.access_token) { display('Autorização não concedida.',true); return; }
        accessToken=token.access_token;
        expiresAt=Date.now()+(Number(token.expires_in||3600)*1000);
        enabled=true;folderId='';photosId='';pdfsId='';
        syncScope='';syncMap={};photoSynced={};
        $('gdrive-disconnect').hidden=false;
        display('Conectado ao Google Drive. Preparando pasta na raiz…');
        await sync();
      },error_callback:()=>display('A janela do Google foi fechada ou bloqueada.',true)});
      authClient.requestAccessToken({prompt:'consent'});
    }catch(e){logError(e)}
  }
  function disconnect() {
    const token=accessToken;
    accessToken='';expiresAt=0;enabled=false;clearTimeout(scheduled);
    $('gdrive-disconnect').hidden=true;
    if(token&&window.google?.accounts?.oauth2)window.google.accounts.oauth2.revoke(token,()=>{});
    display('Desconectado. Arquivos já enviados continuam no Google Drive.');
  }
  function setup() {
    if (!document.body || $('gdrive-panel')) return;
    const panel=document.createElement('section');
    panel.id='gdrive-panel';panel.className='card';
    panel.style.cssText='border:1px solid #b4c5cf;max-width:100%;margin:16px 0;padding:18px;background:#fff';
    panel.innerHTML=`<h3 style="margin-top:0">Google Drive pessoal — sincronização</h3>
      <p class="muted">Vistorias, fotos e PDFs na pasta <b>Meu Drive / Vistoria Técnica</b>. As fotos ficam também dentro do backup JSON. Não substitui a nuvem antiga.</p>
      <label for="gdrive-client-id">ID do cliente OAuth (Google Cloud)</label>
      <input id="gdrive-client-id" type="text" autocomplete="off" spellcheck="false" placeholder="123456789-...apps.googleusercontent.com" style="width:100%;max-width:560px">
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button id="gdrive-connect" type="button">Conectar Google Drive</button>
        <button id="gdrive-now" type="button" class="secondary">Sincronizar agora</button>
        <button id="gdrive-disconnect" type="button" class="danger" hidden>Desconectar</button>
      </div>
      <p id="gdrive-status" role="status" aria-live="polite">Desconectado. Informe o ID OAuth e autorize sua conta Google.</p>
      <p class="muted">O sincronismo funciona com o aplicativo aberto, internet e a autorização Google válida. Ao conectar, o Google também informa seu e-mail para proteger o acesso opcional à revisão técnica por IA. Dados locais permanecem disponíveis offline.</p>`;
    const anchor=document.getElementById('googleCloudHost')||document.getElementById('view-cloud')||document.querySelector('main');
    if(anchor)anchor.prepend(panel);
    $('gdrive-client-id').value=localStorage.getItem(CLIENT_KEY)||'';
    loadGoogleScript().catch(()=>{}); // Precarrega; a autorização só ocorre após o clique do usuário.
    $('gdrive-connect').addEventListener('click',startConnection);
    $('gdrive-now').addEventListener('click',()=>sync());
    $('gdrive-disconnect').addEventListener('click',disconnect);
    document.addEventListener('vistoria-saved',()=>{if(!running)schedule()});
    addEventListener('online',()=>schedule(1000));
    addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(1400)});
    setInterval(()=>{if(enabled && document.visibilityState==='visible')sync()},90000);
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
