import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cloud=readFileSync('google-drive-sync.js','utf8');
const css=readFileSync('cloud-dashboard.css','utf8');
const sw=readFileSync('sw.js','utf8');

test('lista da nuvem inicia recolhida, mantendo título e quantidade visíveis',()=>{
 assert.match(cloud,/const listDisclosure=document\.createElement\('details'\);listDisclosure\.className='cloud-disclosure cloud-reports-disclosure'/);
 assert.match(cloud,/listSummary\.append\(summaryTitle,count\);listDisclosure\.append\(listSummary\);section\.append\(listDisclosure\)/);
 assert.match(cloud,/summaryTitle\.textContent='Mostrar vistorias'/);
 assert.match(cloud,/listDisclosure\.addEventListener\('toggle'/);
 assert.match(cloud,/listDisclosure\.open\?'Ocultar vistorias':'Mostrar vistorias'/);
 assert.match(cloud,/const list=document\.createElement\('div'\);list\.className='cloud-report-list';listDisclosure\.append\(list\)/);
 assert.doesNotMatch(cloud,/listDisclosure\.open\s*=\s*true;?\s*const entries/);
 assert.match(cloud,/count\.textContent=visible\+' de '\+remote\.length\+' vistorias'/);
});
test('pesquisar ou alterar filtros abre a lista para mostrar resultados',()=>{
 assert.match(cloud,/search\.oninput=\(\)=>\{if\(search\.value\.trim\(\)\)listDisclosure\.open=true;filter\(\);\}/);
 assert.match(cloud,/ownership\.onchange=area\.onchange=sort\.onchange=\(\)=>\{listDisclosure\.open=true;filter\(\);\}/);
 assert.match(cloud,/listDisclosure\.open=true;filter\(\);\}catch\(e\)\{techResults\.textContent=e\.message/);
});
test('cartões e operações não são excluídos da interface',()=>{
 assert.match(cloud,/row\.className='cloud-report-card'/);
 assert.match(cloud,/button\(row,'Criar cópia local'/);
 assert.match(cloud,/button\(menu,'Histórico de revisões'/);
 assert.match(cloud,/button\(menu,'Enviar revisão em segundo plano'/);
 assert.match(cloud,/button\(menu,'Mover para lixeira em todos os aparelhos'/);
 assert.match(cloud,/const osPanel=document\.createElement\('details'\)/);
 assert.match(cloud,/const techDetails=document\.createElement\('details'\)/);
});
test('painel recolhível é responsivo e atualizado também offline',()=>{
 assert.match(css,/\.cloud-reports-disclosure>/);
 assert.match(css,/\.cloud-reports-disclosure\[open\]/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(sw,/vistoria-shell-v\d+-[a-z0-9-]+/);
 assert.match(sw,/'\/cloud-dashboard\.css'/);
 assert.match(sw,/'\/google-drive-sync\.js'/);
});
test('pastas e menus da nuvem iniciam fechados e preservam estado na atualização',()=>{
 assert.match(cloud,/d\.open=disclosureState\.areas\.get\(key\)===true/);
 assert.match(cloud,/menu\.open=disclosureState\.menus\.get\(item\.report_id\)===true/);
 assert.match(cloud,/captureCloudReportDisclosures\(target\);const box=/);
 assert.match(cloud,/listDisclosure\.open=disclosureState\.list/);
 assert.doesNotMatch(cloud,/oldGroups\.get\(key\)!==false/);
 const snippet=cloud.slice(cloud.indexOf('const cloudReportDisclosureStates=new Map();'),cloud.indexOf('async function showReports(member,box,status)'));
 const helpers=new Function(snippet+';return {cloudDisclosureState,captureCloudReportDisclosures};')();
 const a=helpers.cloudDisclosureState('A');
 assert.equal(a.list,false);assert.equal(a.areas.get('britagem')===true,false);
 const section={dataset:{disclosureSubject:'A'},querySelector:()=>({open:true}),querySelectorAll:selector=>selector.includes('data-cloud-area')?[{dataset:{cloudArea:'britagem'},open:true},{dataset:{cloudArea:'moagem'},open:false}]:[{dataset:{reportId:'r1'},querySelector:()=>({open:true})}]};
 helpers.captureCloudReportDisclosures({querySelector:()=>section});
 assert.equal(a.list,true);assert.equal(a.areas.get('britagem'),true);assert.equal(a.areas.get('moagem'),false);assert.equal(a.menus.get('r1'),true);
 assert.equal(helpers.cloudDisclosureState('B').areas.get('britagem')===true,false);
});
