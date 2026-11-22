import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('google-drive-sync.js','utf8');
const start=source.indexOf("retryButton.onclick=async()=>{");
const end=source.indexOf("};queueDetails.append(retryButton);",start);
const handler=source.slice(start,end);

test('reagendamento verifica identidade Google da equipe e sessão antes de agendar',()=>{
 assert.ok(start>0&&end>start,'Ação de reagendamento presente');
 const memberCheck=handler.indexOf("current.member.google_subject!==member.google_subject");
 const sessionCheck=handler.indexOf("(await session.json()).subject!==member.google_subject");
 const pendingCheck=handler.indexOf("j.subject===member.google_subject&&j.state==='pending'");
 const register=handler.indexOf("reg.sync.register('vistoria-background')");
 assert.ok(memberCheck>=0&&sessionCheck>memberCheck&&pendingCheck>sessionCheck&&register>pendingCheck);
});

test('reagendar não duplica, cancela nem exclui documentos da fila',()=>{
 assert.ok(!/VistoriaBackground\.(put|cancel|clearFor)\s*\(/.test(handler));
 assert.match(handler,/if\(!pending.length\)/);
 assert.match(handler,/retryButton.disabled=true/);
 assert.match(handler,/finally\{retryButton.disabled=false;\}/);
});

test('falha de registro inicial preserva fila e orienta reagendar',()=>{
 const put=source.indexOf("await window.VistoriaBackground.put({id:item.report_id");
 const register=source.indexOf("await reg.sync.register('vistoria-background')",put);
 assert.ok(put>=0&&register>put);
 assert.match(source.slice(put,register+250),/catch\{status.textContent='Revisão salva na fila/);
});
