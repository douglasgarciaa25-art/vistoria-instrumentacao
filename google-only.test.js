import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');

test('aba Nuvem utiliza somente Google Drive, sem painel antigo',()=>{
 const index=read('index.html');
 const layout=read('layout.js');
 assert.ok(!index.includes('NUVEM PRIVADA · VERCEL'));
 assert.ok(!index.includes('id="cloudKey"'));
 assert.ok(!index.includes('id="cloudLogin"'));
 assert.ok(!index.includes('id="cloudControls"'));
 assert.ok(!index.includes('<script src="cloud.js"></script>'));
 assert.ok(!index.includes('<script src="shared-cloud.js"></script>'));
 assert.ok(index.includes('<script src="google-drive-sync.js"></script>'));
 assert.ok(layout.includes("cloud.id='googleCloudHost'"));
 assert.ok(layout.includes('GOOGLE DRIVE'));
 assert.ok(!layout.includes("$('cloudKey')"));
});
test('Google Drive mantém sincronização de vistorias, fotos e PDFs',()=>{
 const drive=read('google-drive-sync.js');
 assert.ok(drive.includes("const ROOT_FOLDER = 'Vistoria Técnica'"));
 assert.ok(drive.includes('async function uploadPhotos'));
 assert.ok(drive.includes('async function savePdf'));
 assert.ok(drive.includes('async function sync'));
 assert.ok(drive.includes("document.getElementById('googleCloudHost')"));
 assert.ok(drive.includes('https://www.googleapis.com/auth/drive.file'));
 assert.ok(drive.includes('https://www.googleapis.com/auth/userinfo.email'));
});
test('PWA não armazena scripts antigos de nuvem em cache',()=>{
 const sw=read('sw.js');
 assert.ok(sw.includes("'/google-drive-sync.js'"));
 assert.ok(!sw.includes("'/cloud.js'"));
 assert.ok(!sw.includes("'/shared-cloud.js'"));
 assert.ok(sw.includes('vistoria-shell-v16-google-unico'));
});
test('indicadores e revisão técnica não exigem chave da Vercel',()=>{
 const enhancements=read('enhancements.js');
 const review=read('technical-review.js');
 const server=read('technical-review-server.mjs');
 assert.ok(enhancements.includes('Google Drive: conecte na aba Nuvem'));
 assert.ok(review.includes('window.VistoriaGoogleDrive'));
 assert.ok(!review.includes('cloudKey'));
 assert.ok(server.includes('VISTORIA_GOOGLE_CLIENT_ID'));
 assert.ok(server.includes('VISTORIA_GOOGLE_ALLOWED_EMAILS'));
 assert.ok(!server.includes('VISTORIA_ACCESS_HASH'));
});
