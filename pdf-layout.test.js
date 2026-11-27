import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('pdf-export.js','utf8');
const code=src.slice(src.indexOf(' function need(h)'),src.indexOf(' function summaryMetrics('));
function fixture(start=700){
 const ops=[];let pageNo=1;
 const font={widthOfTextAtSize:(t,s)=>String(t).length*s*.5};
 const page={drawRectangle:r=>ops.push({kind:'rect',page:pageNo,...r}),drawLine:()=>{}};
 const ctx=vm.createContext({y:start,M:40,CW:515,regular:font,bold:font,ink:'black',green:'purple',white:'white',muted:'gray',light:'light',line:'border',rgb:()=>'',page,wrap:(v,size,width)=>{const s=String(v);const max=Math.max(1,Math.floor(width/(size*.5)));return s.split('\n').flatMap(t=>t.match(new RegExp('.{1,'+max+'}','g'))||['']);},draw:(text,x,y,size)=>ops.push({kind:'text',text,x,y,size,page:pageNo}),newPage:()=>{pageNo++;ctx.y=748;}});
 vm.runInContext(code,ctx);return {ctx,ops,run:s=>vm.runInContext(s,ctx)};
}
test('TAG permanece abaixo da faixa de título, sem sobreposição',()=>{
 const f=fixture();f.run("heading('2.1 Levantamento de campo');bodyLine('FL05-MC4505-CT04A | Túnel da Ret 04',14,bold)");
 const rect=f.ops.find(o=>o.kind==='rect'),tag=f.ops.find(o=>o.text?.startsWith('FL05'));
 assert.ok(tag.y+tag.size<=rect.y-10);
});
test('texto da classificação fica abaixo dos cartões de indicadores',()=>{
 const f=fixture();f.run("grid([['Pontos avaliados','1'],['Pontos em aberto','0'],['Pontos encerrados','1'],['Alta / crítica em aberto','0']],4);paragraph('Classificação de prioridade: A definir: 1',9)");
 const bottom=Math.min(...f.ops.filter(o=>o.kind==='rect').map(o=>o.y));const text=f.ops.find(o=>o.text?.startsWith('Classificação'));
 assert.ok(text.y+text.size<=bottom-7);
});
test('texto próximo do rodapé migra para a página seguinte',()=>{
 const f=fixture(65);f.run("bodyLine('TAG de teste',14,bold)");const t=f.ops[0];assert.equal(t.page,2);assert.ok(t.y>55);
});
test('texto extenso e checklist não atravessam o rodapé',()=>{
 const f=fixture(200);f.run("detail('Descrição','texto '.repeat(700));checklistTable([{label:'Critério '.repeat(120),value:'Conforme'}])");
 assert.ok(f.ops.filter(o=>o.kind==='rect').every(o=>o.y>=55));
 assert.ok(f.ops.filter(o=>o.kind==='text').every(o=>o.y-o.size*.25>=55));
});
