import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(name,'utf8');

test('PWA guarda todos os scripts efetivamente usados no modo offline',()=>{
 const scripts=[...file('index.html').matchAll(/<script src="([^"]+)"/g)].map(match=>match[1]);
 const sw=file('sw.js');
 assert.ok(scripts.length>=15);
 for(const src of scripts)assert.ok(sw.includes("'/" + src + "'"),'Script sem cache offline: '+src);
 assert.match(sw,/fetch\(event\.request,\{cache:'no-cache'\}\)/);
 assert.match(sw,/cache\.match\(url\.pathname\)/);
});
test('salvamento local usa fila e captura ID com dados do mesmo formulário',()=>{
 const src=file('history.js');
 assert.match(src,/persistQueue\.catch\(\(\)=>\{\}\)\.then\(task\)/);
 assert.match(src,/structuredClone\(data\(\)\),savingId=activeReportId/);
 assert.match(src,/reportId:savingId/);
});
test('Drive mantém exclusões locais e isola hashes por pasta',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/removedIds\.has\(id\)/);
 assert.match(src,/deleted-report:/);
 assert.match(src,/loadScope\(folderId\)/);
 assert.match(src,/SYNC_KEY\+':'\+syncScope/);
 assert.match(src,/PHOTOS_KEY\+':'\+syncScope/);
 assert.match(src,/doc\.reportId!==expectedReportId/);
});
test('nuvem compartilhada não sobrescreve alterações de outra aba',()=>{
 const src=file('shared-cloud.js');
 assert.match(src,/startingHashes=new Map/);
 assert.match(src,/const latest=await rows\(\)/);
 assert.match(src,/Outra aba alterou as vistorias/);
 assert.match(src,/erasedKeys\.filter/);
 assert.match(src,/\.\.\.trashedIds/);
});

test('PDF registra aviso quando o arquivo de origem falha',()=>{
 const src=file('pdf-export.js');
 assert.match(src,/sourcePdfFailed=true;sourcePdfWarnings\+\+/);
 assert.match(src,/O PDF de origem não pôde ser incorporado/);
});


test('equipe pesquisa OS individual com zeros iniciais e sem confundir com referência',()=>{
 const source=file('google-drive-sync.js');
 assert.match(source,/p\.pointWorkOrder,p\.tag,p\.area/);
 const fixture={meta:{number:'RV-001',workOrder:'0001020'},records:[{tag:'C550_CF02',pointWorkOrder:'00000035',area:'Flotação'}]};
 const haystack=[fixture.meta.title,fixture.meta.number,JSON.stringify(fixture.meta),
  ...fixture.records.map(p=>[p.pointWorkOrder,p.tag,p.area].join(' '))].join(' ').toLocaleLowerCase('pt-BR');
 assert.ok(haystack.includes('00000035'));
 assert.ok(haystack.includes('0001020'));
 assert.ok(!haystack.includes('9999999'));
});
test('logout não limpa a fila global e é limitado à conta autenticada',()=>{
 const drive=file('google-drive-sync.js');
 const background=file('background-sync.js');
 assert.match(drive,/clearFor\(disconnectingSubject\)/);
 assert.doesNotMatch(drive,/VistoriaBackground\?\.clear\(\)/);
 assert.match(background,/keyFor\(job.subject,job.id\)/);
 assert.match(background,/const clearFor=subject/);
 assert.match(background,/leaseUntil/);
});

test('sincronização da equipe recebe revisão da vistoria aberta sem perder o rascunho',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/async function activeMatchesSaved\(id,savedHash\)/);
 assert.match(src,/if\(active&&!await activeMatchesSaved\(item\.report_id,localHash\)\)/);
 assert.match(src,/db\.transaction\(\['reports','draft','trash'\],'readwrite'\)/);
 assert.match(src,/draft\.put\(\{\.\.\.structuredClone\(document\),reportId:id\},'current'\)/);
 assert.match(src,/reset\(\);fill\(structuredClone\(document\)\)/);
 assert.doesNotMatch(src,/if\(typeof activeReportId!=='undefined'&&activeReportId===item\.report_id\)continue;/);
});
test('sincronização da equipe permite envio de alteração em vistoria aberta já salva',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/if\(!await activeMatchesSaved\(item\.report_id,hash\)\)\{teamDeferred\+\+;continue;\}/);
 assert.match(src,/reportRequest\('POST',item\.report_id,\{document:row\.document,revision:previous\.revision\}\)/);
 assert.match(src,/Sincronização parcial/);
 assert.match(src,/Atualizar da nuvem \(mesmo ID\)/);
 assert.doesNotMatch(src,/\(cópia local preservada\)/);
});
test('guarda de edição ativa bloqueia alterações não salvas mas não bloqueia relatório fechado',async()=>{
 const vm=await import('node:vm');
 const src=file('google-drive-sync.js');
 const found=src.match(/  async function activeMatchesSaved\(id,savedHash\) \{[\s\S]*?\n  \}/);
 assert.ok(found,'função de segurança não encontrada');
 const context={activeReportId:'vistoria-a',saveTimer:null,historyBusy:false,busy:0,historyReady:true,digest:async d=>d.hash,data:()=>({hash:'rev-2'})};
 const decide=vm.runInNewContext('('+found[0].trim()+')',context);
 assert.equal(await decide('vistoria-b','rev-1'),true);
 assert.equal(await decide('vistoria-a','rev-2'),true);
 assert.equal(await decide('vistoria-a','rev-1'),false);
 context.saveTimer=42;
 assert.equal(await decide('vistoria-a','rev-2'),false);
 context.saveTimer=null;context.busy=1;
 assert.equal(await decide('vistoria-a','rev-2'),false);
});

test('Drive pessoal atualiza relatório e rascunho quando chega revisão no editor aberto',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/const active=row\.id===activeReportId;/);
 assert.match(src,/if\(active&&!await activeMatchesSaved\(row\.id,docHash\)\)\{conflicts\+\+;continue;\}/);
 assert.match(src,/tx\.objectStore\('reports'\)\.put\(\{id:row\.id,updated,document:packet\.document\}\)/);
 assert.match(src,/tx\.objectStore\('draft'\)\.put\(\{\.\.\.structuredClone\(packet\.document\),reportId:row\.id\},'current'\)/);
});
test('Drive pessoal não envia cópia antiga após conflito sem baseline',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/const marker='conflito:'\+remoteHash\+':'\+docHash/);
 assert.match(src,/if\(syncMap\[row\.id\]===marker\)\{conflicts\+\+;continue;\}/);
 assert.match(src,/syncMap\[row\.id\]=marker;saveMap\(\);conflicts\+\+/);
 assert.doesNotMatch(src,/syncMap\[row\.id\]=remoteHash;saveMap\(\);conflicts\+\+/);
});

test('equipe renova o mesmo ID e arquiva versão divergente quando não há baseline',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/if\(row&&!previous\)\{/);
 assert.match(src,/const received=await reportRequest\('GET',item\.report_id\)/);
 assert.match(src,/if\(receivedHash===localHash\)\{/);
 assert.match(src,/baseline\[item\.report_id\]=\{revision:received\.revision,hash:receivedHash\}/);
 assert.match(src,/if\(!latest\|\|await digest\(latest\.document\)!==localHash\)\{teamDeferred\+\+;continue;\}/);
 assert.match(src,/replaceTeamLocal\(item,row,received\.document,member,archive\)/);
 assert.match(src,/reason:'missing-baseline'/);
 assert.match(src,/if\(archive\)draft\.put\(archive,'team-conflict:'/);
 assert.match(src,/store\.put\(\{id,updated:item\.updated_at/);
 assert.match(src,/Campos em conflito/);
});
test('interface móvel separa título e botões de sincronização da equipe',()=>{
 const cloud=file('google-drive-sync.js');
 const css=file('cloud-dashboard.css');
 assert.match(cloud,/aria-label="Sincronizar vistorias locais com a equipe">Sincronizar com a equipe/);
 assert.match(css,/\.cloud-section-head\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(css,/\.cloud-section-head>div\{grid-column:1\/-1/);
 assert.match(css,/#gdrive-team-local-sync\{grid-column:2\}/);
});


test('renovação automática consulta equipe a cada vinte segundos e usa fluxo único no botão',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'&&validToken\(\)&&navigator\.onLine!==false\)void syncTeam\(\);\},20000\)/);
 const manual=src.slice(src.indexOf("button(menu,'Atualizar da nuvem (mesmo ID)'"),src.indexOf("button(menu,'Revisar conflitos desta vistoria'"));
 assert.match(manual,/await syncTeam\(\)/);
 assert.doesNotMatch(manual,/crypto\.randomUUID|confirm\(|store\.put/);
});

test('renovação transacional preserva ID, rascunho, originais e edição concorrente',async()=>{
 const vm=await import('node:vm'),src=file('google-drive-sync.js');
 const found=src.match(/  async function replaceTeamLocal\(item,original,document,member,archive=null\)\{[\s\S]*?\n  \}/);
 assert.ok(found);
 const id='qa-vistoria',old={meta:{title:'Anterior'},records:[]},next={meta:{title:'Nova'},records:[]};
 const row={id,document:old},member={google_subject:'tech'};
 async function run({changed=false,active=true,dirty=false,archive=null,otherDraft=false}={}){
   const reports=new Map([[id,structuredClone(row)]]),draft=new Map([['current',{...structuredClone(old),reportId:otherDraft?'outra':id}]]);
   let pending=0,settle,filled=null;
   const db={transaction(names){
     assert.deepEqual(Array.from(names),['reports','draft','trash']);
     const promise=new Promise(r=>settle=r);
     const stores={reports,draft,trash:new Map()};
     const tx={promise,objectStore(name){const map=stores[name];return {get(key){const req={};pending++;queueMicrotask(()=>{req.result=map.get(key);req.onsuccess();if(!--pending)settle()});return req;},put(value,key){map.set(key??value.id,structuredClone(value));},delete(key){map.delete(key);}}}};
     if(changed)reports.set(id,{id,document:{meta:{title:'Outra edição'},records:[]}});
     return tx;
   }};
   const context={db,txDone:t=>t.promise,activeReportId:active?id:'outra',accessToken:'token',queueMember:member,validToken:()=>true,saveTimer:dirty?1:null,historyBusy:false,busy:0,historyReady:true,data:()=>old,digest:async d=>JSON.stringify(d),activeMatchesSaved:async()=>!dirty,persistQueue:Promise.resolve(),reset(){},fill(d){filled=d;},$:()=>null,structuredClone,crypto:{randomUUID:()=> 'archive-001'},canRestoreTeamTrash:()=>false};
   const replace=vm.runInNewContext('('+found[0].trim()+')',context);
   const result=await replace({report_id:id,updated_at:'2026-11-24T00:00:00Z'},row,next,member,archive);
   return {result,reports,draft,filled};
 }
 let r=await run({archive:{local:old,remote:next}});
 assert.equal(r.result,true);assert.equal(r.reports.size,1);assert.deepEqual(r.reports.get(id).document,next);assert.equal(r.draft.get('current').reportId,id);assert.deepEqual(r.filled,next);
 assert.deepEqual(r.draft.get('team-conflict:tech:'+id+':archive-001').local,old);
 r=await run({changed:true});assert.equal(r.result,false);assert.equal(r.reports.get(id).document.meta.title,'Outra edição');
 r=await run({dirty:true});assert.equal(r.result,false);assert.deepEqual(r.reports.get(id).document,old);
 r=await run({otherDraft:true});assert.equal(r.result,false);assert.equal(r.draft.get('current').reportId,'outra');
 r=await run({active:false});assert.equal(r.result,true);assert.deepEqual(r.reports.get(id).document,next);assert.equal(r.filled,null);
});

test('lixeira da equipe só aplica remoção confirmada pelo servidor e preserva o mesmo ID',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/state\.report_id===row\.id&&state\.deleted_at/);
 assert.match(src,/trash\.put\(\{\.\.\.latest,deletedAt:item\.deleted_at/);
 assert.match(src,/draft\.put\(\{account,revision:Number\(item\.revision\)\},'deleted-report:'\+id\)/);
 assert.match(src,/trash\.delete\(id\);draft\.delete\('deleted-report:'\+id\)/);
 assert.match(file('trash-actions.js'),/VistoriaTeamTrash\.move\(id\)/);
 assert.match(file('enhancements.js'),/VistoriaTeamTrash\.restore\(id\)/);
});

test('uma exclusão local antiga não é revertida por download automático',async()=>{
 const vm=await import('node:vm'),src=file('google-drive-sync.js');
 const fn=src.match(/  function canRestoreTeamTrash\(marker,item,account\)\{[\s\S]*?\n  \}/);
 const canRestore=vm.runInNewContext('('+fn[0].trim()+')');
 assert.equal(canRestore(true,{revision:3},'admin'),false);
 assert.equal(canRestore({account:'admin',revision:3},{revision:3},'admin'),false);
 assert.equal(canRestore({account:'admin',revision:3},{revision:4},'other'),false);
 assert.equal(canRestore({account:'admin',revision:3},{revision:4},'admin'),true);
 assert.match(src,/if\(marker.result&&!canRestoreTeamTrash\(marker.result,item,account\)\)return/);
});

test('cópia local antiga ausente na equipe oferece apenas a lixeira local',async()=>{
 const vm=await import('node:vm'),src=file('google-drive-sync.js');
 const fn=src.match(/async move\(id\)\{[\s\S]*?\n    \},\n    async restore/)[0].replace(/,\n    async restore$/,'');
 const events=[];
 let error=Object.assign(Error('Vistoria não encontrada'),{status:404});
 const context={validToken:()=>true,navigator:{onLine:true},teamRequest:async()=>({member:{status:'approved',role:'member'}}),teamState:async()=>{throw error},reports:async()=>[{id:'copy'}],rememberLocalCopy:id=>events.push(['local',id]),window:{VistoriaLocalTrash:{move:async id=>events.push(['trash',id])}}};
 const move=vm.runInNewContext('({'+fn+'}).move',context);
 await move('copy');
 assert.deepEqual(events,[['local','copy'],['trash','copy']]);
 events.length=0;
 error=Object.assign(Error('Vistoria não encontrada'),{status:503});
 await assert.rejects(move('copy'),/Vistoria não encontrada/);
 assert.deepEqual(events,[]);
 error=Object.assign(Error('Vistoria não encontrada'),{status:404});
 context.reports=async()=>[];
 await assert.rejects(move('copy'),/Vistoria não encontrada/);
 assert.deepEqual(events,[]);
});
test('cópias locais não são confundidas com lixeira compartilhada',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/known:isSharedTrashReport/);
 assert.match(src,/isTeamReport\(id\)&&!isLocalCopy\(id\)/);
 assert.equal((src.match(/rememberLocalCopy\(copyId\)/g)||[]).length,2);
 assert.match(src,/copies\.delete\(item\.report_id\)/);
 assert.match(file('trash-actions.js'),/window\.VistoriaLocalTrash=\{move:moveLocal\}/);
});

test('status geral conclui automaticamente quando todos os pontos estão encerrados',async()=>{
 const vm=await import('node:vm'),src=file('history.js'),code=src.slice(src.indexOf('function vistoriaAllPointsClosed'),src.indexOf('function refreshVistoriaCloudStatuses'));
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 const d=(statuses,finalizedAt='',pending)=>({meta:{finalizedAt},records:statuses.map(status=>({status})),pending});
 assert.equal(ctx.vistoriaReportStatus(d(['Pendente','Corrigido'],'2026-11-24')).kind,'pending');
 assert.equal(ctx.vistoriaReportStatus(d(['Em acompanhamento','Corrigido'])).kind,'progress');
 assert.equal(ctx.vistoriaReportStatus(d(['Corrigido','Sem pendência'])).label,'Finalizada');
  assert.equal(ctx.vistoriaVisible(d(['Corrigido']),false),false);
  assert.equal(ctx.vistoriaStatusAction(d(['Corrigido'])),'Reabrir vistoria');
  assert.equal(ctx.vistoriaReportStatus({meta:{reopenedAt:'2026-11-26T10:00:00Z'},records:[{status:'Corrigido'}]}).label,'Em revisão');
  assert.equal(ctx.vistoriaVisible({meta:{reopenedAt:'2026-11-26T10:00:00Z'},records:[{status:'Corrigido'}]},false),true);
 const done=d(['Corrigido','Sem pendência'],'2026-11-24');
 assert.equal(ctx.vistoriaReportStatus(done).kind,'done');
 assert.equal(ctx.vistoriaVisible(done,false),false);
 assert.equal(ctx.vistoriaVisible(done,true),true);
 assert.equal(ctx.vistoriaStatusAction(done),'Reabrir vistoria');
 assert.equal(ctx.vistoriaVisible(d(['Pendente'],'2026-11-24'),false),true);
 assert.equal(ctx.vistoriaVisible(d(['Corrigido'],'2026-11-24',{editing:null,fields:{tag:'novo'}}),false),true);
 assert.equal(ctx.vistoriaReportStatus(undefined).kind,'unknown');
});
test('salvar um ponto Corrigido finaliza automaticamente só quando todos estão encerrados',async()=>{
 const vm=await import('node:vm'),src=file('history.js'),html=file('index.html');
 const snippet=src.slice(src.indexOf('function vistoriaFinalizeOnSavedCorrection'),src.indexOf('function refreshVistoriaCloudStatuses'));
 const ctx=vm.createContext({});
 vm.runInContext(snippet,ctx);
 const stamp='2026-11-26T13:00:00Z';
 const doc=(statuses,pending={editing:null,fields:{}})=>({
  meta:{finalizedAt:''},records:statuses.map((status,i)=>({pointId:'id-'+i,tag:'T'+i,status,photos:[{src:'foto'+i}]})),pending
 });
 const mixed=doc(['Corrigido','Pendente']);
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Corrigido',mixed,stamp),false);
 assert.equal(mixed.meta.finalizedAt,'');
 assert.equal(ctx.vistoriaReportStatus(mixed).kind,'pending');
 const completed=doc(['Corrigido','Sem pendência']);
 const original=JSON.stringify(completed.records);
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Corrigido',completed,stamp),true);
 assert.equal(completed.meta.finalizedAt,stamp);
 assert.equal(ctx.vistoriaReportStatus(completed).kind,'done');
 assert.equal(JSON.stringify(completed.records),original,'Fotos e identidade dos pontos não devem mudar');
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Corrigido',completed,stamp),false,'Não sobrescreve a data anterior');
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Pendente',doc(['Corrigido']),stamp),false);
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Sem pendência',doc(['Corrigido']),stamp),false);
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Corrigido',doc([]),stamp),false);
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Corrigido',doc(['Corrigido'],{editing:0,fields:{}}),stamp),false);
 assert.equal(ctx.vistoriaFinalizeOnSavedCorrection('Corrigido',doc(['Corrigido'],{editing:null,fields:{tag:'Rascunho'}}),stamp),false);
 assert.match(html,/const autoFinalized=vistoriaFinalizeOnSavedCorrection\(r\.status,snapshot,new Date\(\)\.toISOString\(\)\)/);
 assert.match(html,/if\(autoFinalized\)\{\$\('finalizedAt'\)\.value=snapshot\.meta\.finalizedAt/);
 assert.match(html,/render\(\);save\(\);notify\(autoFinalized\?/);
});
test('um clique finaliza a vistoria e registra pontos como corrigidos sem perder a edição',async()=>{
 const vm=await import('node:vm'),src=file('history.js');
 const snippet=src.slice(src.indexOf('function vistoriaAllPointsClosed'),src.indexOf('async function setVistoriaFinalized'));
 const ctx=vm.createContext({itemKeys:['tag','area','problem','status','completionDate','completionWork'],structuredClone,today:()=> '2026-11-26'});
 vm.runInContext(snippet,ctx);
 const original={meta:{title:'Vistoria'},records:[{tag:'C270 BA01',area:'Moagem',problem:'Condição',status:'Pendente',photos:[{src:'original'}]}],pending:{editing:0,fields:{tag:'C270 BA01',area:'Moagem',problem:'Reparo executado',status:'Pendente'},photos:[{src:'foto nova'}]}};
 const next=ctx.vistoriaPrepareFinalization(original,'2026-11-26T12:00:00Z');
 assert.equal(next.records[0].status,'Corrigido');
 assert.equal(next.records[0].problem,'Reparo executado');
 assert.equal(next.records[0].photos[0].src,'foto nova');
 assert.equal(next.records[0].completionDate,'2026-11-26');
 assert.equal(next.pending.editing,null);
 assert.equal(next.pending.photos.length,0);
 assert.equal(next.meta.finalizedAt,'2026-11-26T12:00:00Z');
 assert.equal(original.records[0].status,'Pendente');
 assert.equal(ctx.vistoriaReportStatus(next).kind,'done');
 assert.equal(ctx.vistoriaStatusAction(next),'Reabrir vistoria');
 assert.equal(ctx.vistoriaReportStatus(original).kind,'pending');
 const clean={meta:{},records:[{tag:'A',status:'Sem pendência'}],pending:{editing:null,fields:{}}};
 assert.equal(ctx.vistoriaPrepareFinalization(clean,'2026-11-26').records[0].status,'Sem pendência');
 assert.throws(()=>ctx.vistoriaPrepareFinalization({meta:{},records:[{tag:'A',status:'Pendente'}],pending:{editing:null,fields:{tag:'B'}}},'2026-11-26'),/Salve o novo ponto/);
 assert.throws(()=>ctx.vistoriaPrepareFinalization({meta:{},records:[],pending:{editing:null,fields:{}}},'2026-11-26'),/pelo menos um ponto/);
});
test('finalização persiste no mesmo relatório, atualiza o editor e sincroniza',()=>{
 const src=file('history.js'),cloud=file('google-drive-sync.js'),html=file('index.html');
 assert.match(src,/const next=vistoriaPrepareFinalization\(previous.document,stamp\)/);
 assert.match(src,/next\.records=next\.records\.map/);
 assert.match(src,/if\(activeReportId===id\)\{reset\(\);fill\(next\);\}/);
 assert.match(src,/store\.put\(\{\.\.\.latest,updated:new Date\(\)\.toISOString\(\),document:next\}\)/);
 assert.match(src,/await refreshHistory\(\);savedEvent\(\)/);
 assert.match(cloud,/vistoriaVisible\(current,showFinalized\.checked\)/);
 assert.match(cloud,/finalize\.onclick=\(\)=>setVistoriaFinalized\(item\.report_id\)/);
 assert.match(html,/"finalizedAt"\]\.includes\(k\)/);
 assert.match(file('layout.css'),/\.vistoria-status-dot\{/);
});

test('organização por área é única, respeita área explícita e preserva pontos técnicos',async()=>{
 const vm=await import('node:vm'),src=file('history.js'),code=src.slice(src.indexOf('const VISTORIA_AREA_KEY'),src.indexOf('function vistoriaRefreshAreaOptions'));
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 const rows=[{id:'a',document:{meta:{reportArea:'Moagem'},records:[{area:'Britagem'}]}},{id:'b',document:{meta:{},records:[{area:'flotação'},{area:' Flotação '}]}},{id:'c',document:{meta:{},records:[{area:'A'},{area:'B'}]}}];
 assert.equal(ctx.vistoriaReportArea(rows[0].document),'Moagem');
 assert.equal(ctx.vistoriaAreaKey(ctx.vistoriaReportArea(rows[1].document)),'flotação');
 assert.equal(ctx.vistoriaReportArea(rows[2].document),'');
 const catalog=ctx.vistoriaAreaCatalog(rows,[' MOAGEM ','moagem','Nova']);
 assert.equal(catalog.filter(a=>ctx.vistoriaAreaKey(a)==='moagem').length,1);
 const groups=ctx.vistoriaGroupRows(rows,catalog);
 assert.equal(groups.flatMap(([,g])=>g.rows).length,3);
 assert.ok(groups.some(([,g])=>g.name==='Nova'&&!g.rows.length));
 assert.equal(rows[0].document.records[0].area,'Britagem');
});
test('área de organização persistida no mesmo ID e exibida nas listas',()=>{
 const src=file('history.js'),cloud=file('google-drive-sync.js');
 assert.match(src,/meta:\{\.\.\.latest\.document\.meta,reportArea:area\}/);
 assert.match(src,/data-move-report-area/);
 assert.match(src,/vistoriaGroupRows\(rows,catalog\)/);
 assert.match(cloud,/vistoriaGroupRows\(ordered\.map/);
 assert.match(file('index.html'),/id="reportArea"/);
});
