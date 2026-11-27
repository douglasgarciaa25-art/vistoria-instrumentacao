import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeReport,revisionChanges} from './team-merge.mjs';
test("campos diferentes",()=>{const base={"meta":{"title":"A"},"records":[{"pointId":"point-001","status":"Pendente","problem":"a"}]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records[0].problem="b")(local);(d=>d.records[0].status="Corrigido")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>r.document?.records[0].problem==="b"&&r.document.records[0].status==="Corrigido")(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("mesmo campo",()=>{const base={"meta":{"title":"A"},"records":[]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.meta.title="B")(local);(d=>d.meta.title="C")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>!r.document&&r.conflicts[0].path.join(".")==="meta.title")(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("adições simultâneas",()=>{const base={"meta":{},"records":[]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records.push({pointId:"point-001"}))(local);(d=>d.records.push({pointId:"point-002"}))(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>r.document?.records.length===2)(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("exclusão versus edição",()=>{const base={"meta":{},"records":[{"pointId":"point-001","status":"Pendente"}]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records=[])(local);(d=>d.records[0].status="Corrigido")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>!r.document&&r.conflicts[0].reason==="delete-edit")(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("pontos diferentes",()=>{const base={"meta":{},"records":[{"pointId":"point-001","status":"Pendente"},{"pointId":"point-002","status":"Pendente"}]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records[0].status="Corrigido")(local);(d=>d.records[1].status="Corrigido")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>r.document?.records.every(p=>p.status==="Corrigido"))(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("fotos e descritivo",()=>{const base={"meta":{},"records":[{"pointId":"point-001","photos":[],"problem":"a"}]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records[0].photos=["foto"])(local);(d=>d.records[0].problem="b")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>r.document?.records[0].photos[0]==="foto"&&r.document.records[0].problem==="b")(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("identidade duplicada",()=>{const base={"meta":{},"records":[{"pointId":"point-001"}]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records.push({pointId:"point-001"}))(local);(d=>d.meta.title="B")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>!r.document&&r.conflicts[0].reason==="invalid-base-or-point-identity")(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("reenvio igual",()=>{const base={"meta":{"title":"A"},"records":[]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.meta.title="B")(local);(d=>d.meta.title="B")(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>r.document?.meta.title==="B"&&!r.conflicts.length)(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});
test("ordem divergente",()=>{const base={"meta":{},"records":[{"pointId":"point-001"},{"pointId":"point-002"},{"pointId":"point-003"}]};const local=structuredClone(base),remote=structuredClone(base);(d=>d.records.reverse())(local);(d=>d.records.push(d.records.shift()))(remote);const before=JSON.stringify([base,local,remote]);assert.ok((r=>!r.document&&r.conflicts[0].reason==="point-order")(mergeReport(base,local,remote)));assert.equal(JSON.stringify([base,local,remote]),before);});

test('histórico detalha campos sem expor conteúdo dos anexos',()=>{const a={"meta":{"title":"A"},"records":[{"pointId":"point-001","status":"Pendente","photos":["data:image/x,abc"]}]},b={"meta":{"title":"B"},"records":[{"pointId":"point-001","status":"Corrigido","photos":["data:image/x,def"]}]};const c=revisionChanges(a,b);assert.equal(c.length,3);assert.equal(c[1].before,'Pendente');assert.equal(c[1].after,'Corrigido');assert.ok(!JSON.stringify(c).includes('data:image'));});

test('resolução explícita preserva campos independentes e escolhe apenas o conflito',()=>{const base={meta:{title:'A',area:'X'},records:[]},local={meta:{title:'B',area:'X'},records:[]},remote={meta:{title:'C',area:'Y'},records:[]};const r=mergeReport(base,local,remote,new Map([[JSON.stringify(['meta','title']),'local']]));assert.deepEqual(r.document,{meta:{title:'B',area:'Y'},records:[]});assert.equal(r.conflicts.length,0);});

test('conciliação automática conserva alterações independentes e prioriza texto local editado',async()=>{
 const {autoResolveReport}=await import('./team-merge.mjs');
 const base={meta:{title:'A',sector:'Usina'},records:[{pointId:'point-001',status:'Pendente',problem:'A'}]};
 const local=structuredClone(base),remote=structuredClone(base);
 local.meta.title='B';local.records[0].problem='B';remote.meta.title='C';remote.records[0].status='Corrigido';
 const original=JSON.stringify([base,local,remote]);
 const result=autoResolveReport(base,local,remote);
 assert.deepEqual(result.document,{meta:{title:'B',sector:'Usina'},records:[{pointId:'point-001',status:'Corrigido',problem:'B'}]});
 assert.deepEqual(result.choices,[{path:['meta','title'],choice:'local'}]);assert.equal(JSON.stringify([base,local,remote]),original);
});
test('recuperação não presume exclusão ou decisão técnica divergente',async()=>{
 const {autoResolveReport}=await import('./team-merge.mjs');
 const base={meta:{},records:[{pointId:'point-001',status:'Pendente'}]},local=structuredClone(base),remote=structuredClone(base);
 local.records=[];remote.records[0].status='Corrigido';assert.equal(autoResolveReport(base,local,remote).document,null);
 local.records=structuredClone(base.records);local.records[0].status='Em acompanhamento';assert.equal(autoResolveReport(base,local,remote).document,null);
});
test('normalização legada só preenche ausências, preserva fotos e originais',async()=>{
 const {repairLegacyReport}=await import('./team-merge.mjs');
 const d={version:1,meta:{title:'Vistoria'},records:[{pointId:'point-001',tag:'A',photos:[{src:'data:image/jpeg;base64,AAAA'}]}]};
 const raw=JSON.stringify(d),n=repairLegacyReport(d,['title','reopenedAt'],['tag','status']);
 assert.equal(n.meta.reopenedAt,'');assert.equal(n.records[0].status,'');assert.equal(n.records[0].photos[0].caption,'');assert.equal(n.records[0].photos[0].src,d.records[0].photos[0].src);assert.equal(JSON.stringify(d),raw);
 const bad=structuredClone(d);bad.records[0].photos=[{caption:'sem foto'}];assert.equal(repairLegacyReport(bad,['title'],['tag']),null);
});

test('cópia local inalterada não sobrescreve correção publicada por outro técnico',async()=>{const {autoResolveReport}=await import('./team-merge.mjs');const base={meta:{title:'A'},records:[{pointId:'point-001',status:'Pendente'}]},local=structuredClone(base),remote=structuredClone(base);remote.records[0].status='Corrigido';assert.deepEqual(autoResolveReport(base,local,remote).document,remote);});
