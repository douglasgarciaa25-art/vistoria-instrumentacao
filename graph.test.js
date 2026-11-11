import test from 'node:test';
import assert from 'node:assert/strict';
import { AppFolderClient, safeFolderName, safeFileName, revisionFolderName, GraphHttpError } from '../src/graph.js';

test('nomes de pastas não deixam caminho atravessar diretórios', () => {
  assert.equal(safeFolderName('../OS 123'), 'OS-123');
  assert.equal(safeFileName('../../foto:1.jpg'), 'foto_1.jpg');
  assert.throws(() => safeFolderName('...'));
  const v = revisionFolderName({ createdAt:'2026-11-10T20:20:20.000Z',queueId:'abc-123' });
  assert.equal(v, '2026-11-10T20-20-20-000Z_abc-123');
});

test('Graph restringe URL ao domínio oficial e injeta token em cabeçalho', async () => {
  const calls=[];
  const api=new AppFolderClient(async()=> 'test-token', async(url,opts) => {
    calls.push({url,opts});
    return {ok:true,status:200,json:async()=>({id:'folder-1'})};
  });
  const root=await api.getAppFolder();
  assert.equal(root.id,'folder-1');
  assert.equal(calls[0].opts.headers.Authorization,'Bearer test-token');
  await assert.rejects(api.request('https://attacker.invalid/data'));
});

test('Cria pasta se não existe e não renomeia pasta em conflito', async () => {
  let stage=0;
  const api=new AppFolderClient(async()=> 'test-token', async (url, opts) => {
    if (opts.method === 'POST') { stage++; assert.equal(JSON.parse(opts.body)['@microsoft.graph.conflictBehavior'],'fail');
      return {ok:true,status:201,json:async()=>({id:'new-id',name:'Vistorias',folder:{}})};
    }
    return {ok:true,status:200,json:async()=>({value:[]})};
  });
  const folder=await api.ensureFolder('root-1','Vistorias');
  assert.equal(folder.id,'new-id'); assert.equal(stage,1);
});

test('Erro HTTP não sinaliza sucesso', async () => {
  const api=new AppFolderClient(async()=> 't',async()=> ({ok:false,status:403,statusText:'Forbidden',headers:{get:()=>null},json:async()=>({error:{message:'Sem permissão'}})}));
  await assert.rejects(api.getAppFolder(), error=> error instanceof GraphHttpError && error.status===403);
});

test('Manifesto é o último arquivo enviado, preservando cópia por revisão', async () => {
  const uploads=[];
  const api=new AppFolderClient(async()=> 't',async (url, opts) => {
    if (url.endsWith('/special/approot')) return {ok:true,status:200,json:async()=>({id:'app'})};
    if (url.includes('/children') && opts.method==='GET') return {ok:true,status:200,json:async()=>({value:[]})};
    if (url.includes('/children') && opts.method==='POST') {
      const body=JSON.parse(opts.body); return {ok:true,status:201,json:async()=>({id:body.name,name:body.name,folder:{}})};
    }
    if (opts.method === 'PUT') {uploads.push(decodeURIComponent(url.match(/:\/([^/]+):\/content/)[1])); return {ok:true,status:201,json:async()=>({id:'ok'})};}
    throw Error('Chamada não prevista: '+url);
  });
  await api.uploadBackup({inspectionId:'OS001',queueId:'queue0001',createdAt:'2026-11-10T20:00:00.000Z',serializedData:'{"ok":true}',attachments:[{filename:'foto.jpg',type:'image/jpeg',blob:new Blob(['hello'],{type:'image/jpeg'})}]});
  assert.deepEqual(uploads,['vistoria.json','01_foto.jpg','manifest.json']);
});
