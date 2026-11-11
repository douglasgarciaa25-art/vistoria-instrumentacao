# Integração OneDrive pessoal — Vistoria Técnica

**O que está pronto:** módulo JavaScript com login Microsoft (MSAL, OAuth PKCE), permissão mínima `Files.ReadWrite.AppFolder`, fila durável no IndexedDB, reenvio automático com app aberto (a cada 60 segundos e quando volta a internet), cópias organizadas por vistoria e revisão, fotos/PDFs anexos e confirmação por `manifest.json`.

**O que não está pronto:** a inclusão no código-fonte do Vistoria Técnica e a publicação. A conta GitHub conectada não forneceu acesso ao repositório da aplicação. Este pacote é um adaptador pronto para inserir no frontend. Ele realiza **backup unidirecional para OneDrive**, não faz leitura/restauração e não faz edição colaborativa ou sincronização quando o app está totalmente fechado.

## 1. Registrar aplicativo Microsoft

1. Entre em https://entra.microsoft.com/ > Identidade > Aplicativos > Registros de aplicativos > Novo registro. Contas pessoais Microsoft são suportadas; escolha a opção que inclui contas pessoais.
2. Nome: `Vistoria Tecnica`. Configure **Aplicativo de página única (SPA)** com URI de redirecionamento **exatamente** `https://vistoria-instrumentacao.vercel.app/` (inclusive barra final). O mesmo URI precisa constar na configuração do código.
3. API permissions > Microsoft Graph > Delegated permissions > `Files.ReadWrite.AppFolder` (escopo em prévia). O usuário concederá autorização no login. Não solicite `Files.ReadWrite.All` nem `Files.ReadWrite` sem justificativa.
4. Copie **Application (client) ID** (identificador público). **Não** crie client secret para SPA e não compartilhe códigos/token/senha.
5. Adicione domínio `http://localhost:3000/` somente para desenvolvimento local, se usar essa porta.

## 2. Instalação no frontend

No projeto JavaScript/React/Vite/Next, copie a pasta `src/` e instale `npm install @azure/msal-browser`.

Adicione variável de ambiente pública Vite `VITE_MICROSOFT_CLIENT_ID` ou Next `NEXT_PUBLIC_MICROSOFT_CLIENT_ID` com o ID público. O código do frontend **não deve** conter segredo.

No carregamento inicial (apenas no navegador):

```js
import { createOneDriveSync } from './src/onedrive-sync.js';

const sync = createOneDriveSync({
  clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID,
  redirectUri: 'https://vistoria-instrumentacao.vercel.app/',
  onStatus: ({connected, pending, syncing, error, message}) => {
    // Exibir no menu Nuvem: Conectado / Pendente / Enviando / Erro
    console.info({ connected, pending, syncing, error, message });
  }
});
await sync.initialize();

// Clique no botão "Conectar OneDrive":
// await sync.connect();  // redireciona à Microsoft

// Depois do SALVAMENTO CONFIRMADO da vistoria na nuvem atual,
// criar uma cópia sem substituir os dados originais:
// await sync.queueVistoria({
//   id: vistoria.id,
//   dados: vistoria,
//   anexos: [arquivoPdf, fotoAntes, fotoDepois]  // File ou Blob, opcionais
// });

// Clique no botão "Sincronizar agora":
// await sync.syncNow();
```

Em Next.js, use um componente `use client` e `process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID`; nunca inicialize o módulo durante SSR.

## 3. Estrutura no OneDrive

Ao conectar, Microsoft Graph cria automaticamente **OneDrive > Apps > Vistoria Tecnica** (nome conforme cadastro Microsoft). Depois:

```
Apps/
  Vistoria Tecnica/
    Vistorias/
      OS001/
        2026-11-10T20-00-00-000Z_<uuid>/
          vistoria.json
          01_foto-antes.jpg
          02_relatorio.pdf
          manifest.json
```

Cada alteração vira uma **nova revisão**; alterações de outros dispositivos não sobrescrevem uma versão anterior. A fila só remove uma revisão quando todos os anexos e o manifesto são enviados com sucesso. Arquivos podem ficar parcialmente enviados em caso de falha, mas sem `manifest.json` a revisão não está completa.

## 4. Recomendações de segurança e limitações

- Avalie antes se é permitido enviar fotos, OS, nomes e dados da **CMOC** a uma conta pessoal. Sem liberação, use o OneDrive apenas para registros de teste fictícios.
- Use conta Microsoft protegida por verificação em duas etapas e bloqueio de tela no telefone.
- Não compartilhe senha, client secret, tokens ou o conteúdo de `.env` secreto.
- Os dados da fila IndexedDB são armazenados no dispositivo (sem criptografia própria no pacote), protegidos pelas proteções normais do aparelho/navegador. Não use este pacote como fonte única para registros sensíveis.
- O módulo não substitui o Blob atual; mantenha-o até fazer teste de restauração e validação de cada relatório.
- A permissão `Files.ReadWrite.AppFolder` é **preview** e precisa ser testada com sua conta. Se não for liberada, pare e revise permissões; não amplie acesso automaticamente.
- Upload simples tem limite **250 MB por arquivo**; arquivos maiores exigem uma sessão de upload, ainda não implementada.
- A sincronização automática só roda **quando o aplicativo está aberto** ou ao voltar ao app com sessão válida. PWA/Android não garantem tarefas com app fechado. Contas SPA podem exigir nova autenticação após expirar a sessão.
- `queueVistoria` deve ser chamado depois de salvar/editar um registro, e receber os PDFs/fotos reais. Se a aplicação só tem URLs de fotos e não `Blob`, adapte a leitura dos arquivos de forma autorizada.
- Não trate OneDrive pessoal como pasta colaborativa da equipe. Para acesso multiusuário, é mais adequado SharePoint/OneDrive corporativo aprovado.

## 5. Teste de aceite

1. Crie uma vistoria de teste, com uma foto e PDF não confidenciais, e salve normalmente na nuvem atual.
2. Conecte OneDrive; aceite `Files.ReadWrite.AppFolder`. Confirme que apareceu a pasta sob `Apps`.
3. Confirme que `vistoria.json`, foto, PDF e `manifest.json` estão na revisão criada.
4. Com internet desligada, altere a vistoria e salve; status deve mostrar "pendente".
5. Religue a internet, mantenha o app aberto, use "Sincronizar agora" ou aguarde a tentativa automática; confira a nova revisão.
6. Simule falha de rede durante o envio: dados originais permanecem na nuvem atual e a fila fica pendente.
7. Compare relatório/PDF e fotos com os originais antes de liberar para dados reais.

## Fontes Microsoft

- https://learn.microsoft.com/graph/onedrive-sharepoint-appfolder
- https://learn.microsoft.com/graph/api/drive-get-specialfolder?view=graph-rest-1.0
- https://learn.microsoft.com/graph/api/driveitem-put-content
- https://learn.microsoft.com/entra/identity-platform/how-to-add-redirect-uri
- https://learn.microsoft.com/entra/identity-platform/msal-client-application-configuration
