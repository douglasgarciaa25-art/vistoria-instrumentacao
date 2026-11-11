# Vistoria Técnica — instrumentação e automação

Aplicativo web/PWA para criar, editar, acompanhar e exportar relatórios técnicos. Os dados ficam primeiro no IndexedDB do dispositivo e podem ser copiados para nuvem.

## Recursos
- Vistorias com pontos, fotos, legendas, andamento e conclusão.
- Exportação de PDFs por ponto, por relatório e de todos os relatórios.
- Importação de PDF antigo, cópia JSON e lixeira local.
- Nuvem compartilhada Vercel Blob e integração **opcional** com Google Drive pessoal.
- Funcionamento offline para registros locais; o envio exige rede.

## Configurar Google Drive pessoal
1. No Google Cloud Console, ative a API Google Drive, configure o consentimento OAuth e crie uma credencial **Aplicativo da Web**.
2. Em origens JavaScript autorizadas informe `https://vistoria-instrumentacao.vercel.app` (ou seu domínio atual). Em modo de teste, autorize a conta como usuário de teste.
3. Na aba **Nuvem** do aplicativo, informe o **ID público** do cliente OAuth (`...apps.googleusercontent.com`) e toque em **Conectar Google Drive**.
4. Autorize o escopo limitado `drive.file`. O aplicativo cria **Meu Drive / Vistoria Técnica** na raiz, com vistorias JSON e subpastas **Fotos** e **PDFs**.
5. A sincronização automática funciona com o app **aberto**, internet e sessão válida. Reconecte quando o token expirar. Divergências entre cópias são preservadas para comparação.

Não insira *client secret*, senhas nem tokens no GitHub ou aplicativo. O Drive pessoal não substitui uma solução corporativa colaborativa: exclusões locais não apagam automaticamente backups no Drive.

## Nuvem compartilhada
O endpoint `/api/cloud` usa Vercel Blob e requer as variáveis privadas `BLOB_READ_WRITE_TOKEN` e `VISTORIA_ACCESS_HASH` (SHA-256 da chave compartilhada). Quem conhece a chave consegue consultar e modificar as vistorias da equipe; proteja essa informação.

## Verificação
Execute com Node.js 22:
```bash
npm ci
npm run check
npm test
```
O GitHub Actions roda as verificações de sintaxe e integridade. Antes de uso real, teste no Android e em dois aparelhos as funções de sincronização, recuperação, edição, PDF por ponto e reunido, fotos e modo offline.

**Atenção:** dados operacionais confidenciais da CMOC não devem ser enviados a contas pessoais sem autorização formal da empresa.

## Auditoria de integridade (11/11/2026)
- Gravações automáticas locais em fila sequencial, para não sobrescrever uma edição mais recente.
- Google Drive: cópias na lixeira ou marcadas como removidas não são restauradas silenciosamente; hashes de sincronização e fotos separados por pasta/conta.
- Nuvem compartilhada: verificação das alterações de outras abas antes de aplicar dados recebidos.
- API: valida identificadores, índices, limites e relação entre quantidade de partes e tamanho antes de aceitar revisões.
- PWA: com internet, busca os arquivos atuais; sem internet, utiliza a última versão em cache.
- PDF: anexo de origem ilegível não interrompe o relatório; aparece uma advertência no PDF gerado.
- Testes de regressão adicionais para as regras acima.

**Limitações:** o Google Drive exige autorização OAuth do proprietário e o aplicativo precisa permanecer aberto para sincronizar. A revisão de código não substitui testes em aparelhos reais, especialmente quando dois operadores alteram uma mesma vistoria.

## Revisão técnica de texto com IA (opcional)
- A equipe escreve primeiro a descrição, uma etapa de cada vez.
- Os campos de **andamento**, **condição encontrada**, **impacto**, **ação recomendada**, **serviço realizado**, **objetivo** e **conclusão** oferecem o botão **Revisar redação técnica com IA**.
- A IA devolve uma sugestão editável; **Usar texto revisado** substitui o campo somente depois da escolha do operador. Há opções **Manter meu texto** e **Desfazer revisão** (antes de mudar o campo novamente). O salvamento e a inclusão da etapa continuam sendo feitos normalmente.
- Não há revisão automática em segundo plano nem inclusão de fatos novos planejada. TAGs, medições, números, horários, condição de execução e hipóteses devem ser conferidos pela equipe.
- O botão envia **somente o texto do campo escolhido** ao provedor de IA. Não envia fotos, relatórios completos nem os demais campos. O texto não é enviado sem confirmação explícita.
- O endpoint `POST /api/technical-review` usa a mesma **chave da nuvem privada** e limita os tamanhos de entrada e saída. Nenhuma chave de IA é incluída no código JavaScript do navegador.
- O backend usa **Vercel AI Gateway** com um modelo da OpenAI (`openai/gpt-5.5`, alterável por `VISTORIA_AI_MODEL`). No servidor, usa `AI_GATEWAY_API_KEY` quando definida ou `VERCEL_OIDC_TOKEN` fornecido pela Vercel. O serviço depende de credenciais e créditos da AI Gateway; o plano ChatGPT Plus não habilita faturamento de API automaticamente.
- O funcionamento offline permite escrever e salvar, mas **revisar com IA exige internet**. Se o serviço falhar, o texto original permanece inalterado.
- Trate a saída como revisão de redação, **não como validação de procedimento, segurança, calibração, bloqueio ou resultado de manutenção**. Só envie dados operacionais da empresa a modelos externos com aprovação da organização.

### Testes da revisão de texto
```bash
npm ci
npm run check
npm test
```
Há testes de validação do payload, autenticação, interface, tratamento de respostas incompletas e requisição simulada sem enviar dados reais.
