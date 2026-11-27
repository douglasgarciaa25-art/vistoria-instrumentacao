import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cloud=readFileSync('google-drive-sync.js','utf8');
const layout=readFileSync('layout.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('cloud-dashboard.css','utf8');
const sw=readFileSync('sw.js','utf8');

test('Nuvem mostra conexão, sincronização e manter conectado sem esconder ações principais',()=>{
 for(const id of ['gdrive-connect','gdrive-now','gdrive-persistent','gdrive-disconnect','gdrive-status','gdrive-session-status','gdrive-client-id']){
  assert.ok(cloud.includes('id="'+id+'"'),id+' deve continuar presente');
 }
 assert.match(cloud,/class="cloud-intro"/);
 assert.match(cloud,/class="cloud-primary-actions"/);
 assert.match(cloud,/class="cloud-connection-status"/);
 assert.match(cloud,/id="gdrive-persistent"[^>]*>Manter conectado</);
 assert.match(cloud,/id="gdrive-disconnect"[^>]*hidden/);
 assert.match(cloud,/\$\('gdrive-connect'\)\.addEventListener\('click',startConnection\)/);
 assert.match(cloud,/\$\('gdrive-now'\)\.addEventListener\('click'/);
 assert.match(cloud,/\$\('gdrive-disconnect'\)\.addEventListener\('click',disconnect\)/);
});

test('Configurações e administração estão disponíveis em painéis recolhíveis',()=>{
 for(const id of ['gdrive-team-refresh','gdrive-team-status','gdrive-queue','gdrive-team-users']){
  assert.ok(cloud.includes('id="'+id+'"'),id+' deve continuar acessível');
 }
 for(const x of ['cloud-queue-details','cloud-disclosure','cloud-filter-grid','cloud-admin-panel','cloud-search-label','cloud-report-menu']){
  assert.ok(cloud.includes(x),x+' não foi renderizado');
 }
 assert.match(cloud,/button\(sharePanel,'Compartilhar vistoria local selecionada'/);
 assert.match(cloud,/button\(menu,'Histórico de revisões'/);
 assert.match(cloud,/if\(member\.role!=='admin'\)return;/);
 assert.match(cloud,/if\(member\.status==='approved'\)\{\s*const trash=/);
 assert.match(cloud,/className='cloud-report-card'/);
 assert.match(cloud,/className='cloud-team-reports'/);
 assert.match(cloud,/const filter=\(\)=>/);
 assert.match(cloud,/const queueDetails=document\.createElement\('details'\)/);
});

test('Backup, instalação, fotos e dados permanecem ligados à mesma interface',()=>{
 assert.match(layout,/extras\.append\(extrasTitle,backup,install\)/);
 assert.match(layout,/storage\.append\(cloud,extras\)/);
 assert.match(cloud,/button\(sharePanel,'Compartilhar vistoria local selecionada'/);
 assert.match(cloud,/await putReport\(/);
 assert.match(cloud,/downloadVerifiedClosures/);
 assert.match(cloud,/VistoriaBackground/);
});

test('Estilo offline, responsivo, com foco visível e sem remover a navegação',()=>{
 assert.match(html,/href="\/layout\.css"/);
 assert.match(html,/href="\/cloud-dashboard\.css"/);
 assert.match(sw,/'\/cloud-dashboard\.css'/);
 assert.match(sw,/vistoria-shell-v\d+-[a-z0-9-]+/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/focus-visible/);
 assert.match(css,/\.cloud-report-list\{/);
 assert.match(css,/\.cloud-primary-actions\{/);
 assert.match(css,/#view-cloud \.cloud-extras/);
 assert.match(layout,/data-view/);
});

test('UI não modifica as permissões autenticadas nem endpoints existentes',()=>{
 assert.match(cloud,/const \{member\}=await teamRequest\('POST',\{action:'request'\}\)/);
 assert.match(cloud,/await reportRequest\('GET',item\.report_id/);
 assert.match(cloud,/reportRequest\('DELETE',id,\{revision:state\.revision\}\)/);
 assert.match(cloud,/const baseline=JSON\.parse\(localStorage\.getItem\(/);
 assert.match(cloud,/if\(member\.role!=='admin'\)return/);
});

test('Login aprovado inicia autorização offline uma vez e preserva renovação por cookie',()=>{
 assert.match(cloud,/if\(await tryAutomaticPersistence\(\)\)return;/);
 const flow=cloud.slice(cloud.indexOf('async function tryAutomaticPersistence()'),cloud.indexOf('function disconnect()'));
 assert.match(flow,/sessionStorage\.getItem\(PERSISTENCE_ATTEMPT_KEY\)/);
 assert.match(flow,/if\(member\?\.status!=='approved'\)return false;/);
 assert.match(flow,/sessionStorage\.setItem\(PERSISTENCE_ATTEMPT_KEY,'1'\)/);
 assert.match(flow,/\/api\/team-drive-authorize\?personal=1/);
 assert.match(cloud,/fetch\('\/api\/personal-session',\{method:'POST',cache:'no-store',credentials:'same-origin'\}\)/);
 assert.match(cloud,/sessionStorage\.removeItem\(PERSISTENCE_ATTEMPT_KEY\)/);
});
