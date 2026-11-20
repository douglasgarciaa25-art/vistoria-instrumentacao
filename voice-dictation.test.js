import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('voice-dictation.js','utf8');

function setup({supported=true,permission=true}={}){
 const fields=[],calls={saves:0,inputs:[],notifications:[],focuses:0},instances=[];
 const createField=(id,value='Texto já registrado',guide=false)=>{
  const field={
   id,value,dataset:{},isConnected:true,readOnly:false,disabled:false,
   matches:selector=>guide&&selector==='textarea[data-guide-part]',
   closest:selector=>selector==='label'?{firstChild:{textContent:'Relato técnico'}}:null,
   getAttribute:()=>null,after(node){this.toolbar=node;},
   dispatchEvent(event){calls.inputs.push({id,type:event.type,value:this.value});},
   focus:()=>{calls.focuses++}
  };
  fields.push(field);return field;
 };
 class FakeSpeech{
  constructor(){instances.push(this);}
  start(){this.onstart?.();}
  stop(){this.onend?.();}
  abort(){this.onend?.();}
 }
 const document={
  body:{},
  querySelectorAll:()=>fields,
  createElement:tag=>({
   tag,dataset:{},className:'',attrs:{},children:[],
   classList:{add(){},remove(){}},
   setAttribute(k,v){this.attrs[k]=v;},
   append(...children){this.children.push(...children);}
  })
 };
 let observer;
 const context={
  window:supported?{SpeechRecognition:FakeSpeech}:{},
  document,editing:0,activeReportId:'r1',
  Event:class{constructor(type,opts){this.type=type;this.bubbles=opts?.bubbles;}},
  MutationObserver:class{constructor(cb){observer=cb;}observe(){}},
  confirm:()=>permission,
  notify:text=>calls.notifications.push(text),
  save:()=>calls.saves++
 };
 const run=()=>vm.runInNewContext(source,context,{timeout:2000});
 return {fields,calls,instances,context,createField,run,refresh:()=>observer()};
}

test('ditado pt-BR acrescenta ao texto sem substituí-lo e dispara salvamento',()=>{
 const app=setup(),field=app.createField('problem');
 app.run();
 assert.equal(field.dataset.voiceReady,'1');
 const [button,status]=field.toolbar.children;
 assert.match(button.textContent,/Ditar por áudio/);
 button.onclick();
 assert.equal(app.instances.length,1);
 const rec=app.instances[0];
 assert.equal(rec.lang,'pt-BR');
 assert.equal(rec.continuous,false);
 assert.equal(rec.interimResults,false);
 assert.equal(button.attrs['aria-pressed'],'true');
 rec.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'Foi ajustado o posicionador.'}}]});
 assert.equal(field.value,'Texto já registrado Foi ajustado o posicionador.');
 assert.equal(app.calls.saves,1);
 assert.deepEqual(app.calls.inputs.map(x=>x.type),['input']);
 rec.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'duplicado'}}]});
 assert.equal(app.calls.saves,1,'não repetir o mesmo ditado');
 rec.onend();
 assert.match(button.textContent,/Ditar por áudio/);
 assert.match(status.textContent,/Confira os termos técnicos/);
});

test('mudança de relatório ou edição do texto descarta o resultado de voz',()=>{
 const app=setup(),field=app.createField('action','Inspecionar');
 app.run();
 field.toolbar.children[0].onclick();
 app.context.activeReportId='r2';
 app.instances[0].onresult({results:[{isFinal:true,0:{transcript:'trocar válvula'}}]});
 assert.equal(field.value,'Inspecionar');
 assert.equal(app.calls.saves,0);
 assert.match(field.toolbar.children[1].textContent,/descartado/);
 app.instances[0].onend();
 app.context.activeReportId='r1';
 field.toolbar.children[0].onclick();
 field.value='Modificado manualmente';
 app.instances[1].onresult({results:[{isFinal:true,0:{transcript:'ignorar'}}]});
 assert.equal(field.value,'Modificado manualmente');
 assert.equal(app.calls.saves,0);
});

test('permissão negada não inicia microfone nem altera registro',()=>{
 const app=setup({permission:false}),field=app.createField('conclusion');
 app.run();field.toolbar.children[0].onclick();
 assert.equal(app.instances.length,0);
 assert.equal(app.calls.saves,0);
 assert.match(field.toolbar.children[1].textContent,/cancelado/);
});

test('se navegador não suporta reconhecimento, orienta usar microfone do teclado do Android',()=>{
 const app=setup({supported:false}),field=app.createField('impact');
 app.run();
 assert.match(field.toolbar.children[0].textContent,/teclado/);
 field.toolbar.children[0].onclick();
 assert.equal(app.calls.focuses,1);
 assert.equal(app.instances.length,0);
 assert.equal(field.value,'Texto já registrado');
 assert.match(field.toolbar.children[1].textContent,/teclado do Android/);
});

test('campos guiados criados depois também recebem microfone uma única vez',()=>{
 const app=setup(),first=app.createField('objective');
 app.run();
 const guided=app.createField('', '',true);
 app.refresh();app.refresh();
 assert.equal(first.dataset.voiceReady,'1');
 assert.equal(guided.dataset.voiceReady,'1');
 assert.equal(guided.toolbar.children.length,2);
 const unapproved=app.createField('gdrive-client-id');
 app.refresh();assert.equal(unapproved.toolbar,undefined,'não disponibilizar microfone em configuração OAuth');
});

test('erro de acesso ao microfone informa o usuário e restaura a interface',()=>{
 const app=setup(),field=app.createField('completionWork','Serviço');
 app.run();const [button,status]=field.toolbar.children;
 button.onclick();app.instances[0].onerror({error:'not-allowed'});
 assert.match(status.textContent,/não autorizado/);
 assert.equal(button.attrs['aria-pressed'],'false');
 assert.equal(app.calls.saves,0);
});

test('PWA carrega código, estilo e preserva controle antigo contra duplicações',()=>{
 const html=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 const mg=readFileSync('management-tools.js','utf8');
 const css=readFileSync('layout.css','utf8');
 assert.match(html,/<script src="voice-dictation\.js"><\/script>/);
 assert.match(sw,/'\/voice-dictation\.js'/);
 assert.match(sw,/vistoria-shell-v\d+-[a-z0-9-]+/);
 assert.doesNotMatch(mg,/const Speech=window\.SpeechRecognition/);
 assert.match(css,/\.voice-controls/);
 assert.match(source,/recognition\.lang='pt-BR'/);
 assert.match(source,/áudio pode ser processado pelo serviço de reconhecimento de voz/);
 assert.match(source,/document\.querySelectorAll/);
});
