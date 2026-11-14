import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={};
vm.runInNewContext(readFileSync('descritivo-core.js','utf8'),context);
const {PARTS,clean,compose}=context.VistoriaDescritivo;

test('guia utiliza somente as seis categorias técnicas e não inventa conteúdo',()=>{
 assert.equal(PARTS.length,6);
 assert.equal(compose({}),'');
 assert.equal(compose(null),'');
 assert.equal(compose({hypothesis:'Pode ser perda de ar.'}),'Hipóteses ainda não confirmadas: Pode ser perda de ar.');
 assert.equal(compose({condition:'Válvula em dupla ação',work:'Nenhum serviço executado.'}),
  'Condição observada: Válvula em dupla ação\n\nServiços efetivamente executados: Nenhum serviço executado.');
});
test('limpeza mantém TAGs, valores, ressalvas e quebras importantes',()=>{
 assert.equal(clean('  MC4530 LCV203 \r\n  19 mA \n\n\n causa não confirmada  '),
 'MC4530 LCV203 \n 19 mA \n\n causa não confirmada');
 assert.equal(compose({checks:'Não foi testado.',findings:'Apenas teste visual.'}).includes('Não foi testado.'),true);
});
test('50 cenários de composição não alteram fatos ou criam outras informações',()=>{
 for(let i=0;i<50;i++){
  const key=PARTS[i%PARTS.length].key;
  const value='TAG-'+String(i).padStart(3,'0')+' | '+(i%2===0?'4–20 mA':'Sem confirmação')+' | '+i;
  const input={[key]:value};
  const before=JSON.stringify(input);
  const output=compose(input);
  assert.equal(output,PARTS[i%PARTS.length].label+': '+value,'cenário '+i);
  assert.equal(JSON.stringify(input),before,'entrada imutável '+i);
  assert.equal(output.includes('Realizado com sucesso'),false,'sem confirmação inventada '+i);
 }
});
test('interface exige inclusão explícita, permite desfazer e limpa entre pontos',()=>{
 const js=readFileSync('descritivo-guiado.js','utf8');
 const html=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.ok(html.includes('<script src="descritivo-core.js"></script><script src="descritivo-guiado.js"></script>'));
 assert.ok(sw.includes("'/descritivo-core.js'")&&sw.includes("'/descritivo-guiado.js'"));
 assert.ok(js.includes('guidedApply'));
 assert.ok(js.includes('guidedUndo'));
 assert.ok(js.includes('lastApplied.previous'));
 assert.ok(js.includes("field.dispatchEvent(new Event('input'"));
 assert.ok(js.includes('reset=function()')&&js.includes('fill=function()'));
 assert.ok(js.includes('sem enviar informações para a IA'));
});
