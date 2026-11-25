# Matriz de verificação — 26 frentes do Vistoria Técnica

Atualização: 21/11/2026. Base: branch `feat/equipe-compartilhada`.
**Atenção:** estes 26 critérios foram organizados a partir dos requisitos disponíveis. Não foi localizada uma lista original numerada com critérios de aceitação. Portanto, **não representam 26 homologações concluídas**.

Legenda: **C** = implementação presente e conferida no código; **T** = teste sintético automatizado; **M** = validação manual indispensável; **P** = implementação ou comprovação parcial.

| Nº | Critério de aceite | Evidência no projeto | Estado / próximo teste |
|---:|---|---|---|
| 1 | OS opcional no cabeçalho, distinta da referência | `index.html` | C/T (regressão OS) |
| 2 | OS distinta por ponto e editável | `index.html`, `history.js` | C/T (regressão OS) |
| 3 | Zeros iniciais preservados | Campos string; `app-integrity.test.js` | C/T |
| 4 | OS nos PDFs por ponto e completos | `pdf-export.js` | C/T estrutural; M para impressão |
| 5 | Busca exata e parcial de OS no histórico local | `history.js` | C; M para registros reais |
| 6 | Busca exata e parcial de OS na equipe, mesmo sem cópia local | `api/team-reports.mjs`, `team-os-search.mjs`, `google-drive-sync.js`, `team-os-api.test.js` | C/T: consulta paginada em relatórios ativos do Drive, sem baixar fotos nem modificar registros; M: validar com dois usuários reais |
| 7 | Backup, recuperação e compatibilidade com relatórios antigos | `history.js`, `point-identity.js` | C/T de IDs; M de recuperação completa |
| 8 | Manter a conta conectada | `google-drive-sync.js`, `api/personal-session.mjs`, `personal-session.test.js` | C/T de sessão simulada; M em Android |
| 9 | Acesso aprovado, administrador e permissões Google | `team-auth.mjs`, `api/team.mjs`, `team-security.test.js` | C/T; M com dois usuários reais |
| 10 | ID permanente de equipamento ao editar/reordenar | `point-identity.js`, `point-identity.test.js` | C/T |
| 11 | Auditoria por ponto, finalização e reabertura | `point-audit-core.mjs`, `api/team-reports.mjs` | C/T sintético; M entre usuários |
| 12 | Nome cadastrado do autor, não digitado livremente | `api/team.mjs`, `vistoria_point_audit` | C; M: administrador cadastrar técnicos |
| 13 | Exclusão/restauração de relatório com histórico atômico | RPC `vistoria_change_report_state` | C/T de banco com rollback |
| 14 | Lixeira de equipamentos recuperando fotos | `point-trash.js`, `team-drive.test.js` | C/T; M Android |
| 15 | Salvar formulário local mesmo sem internet | `history.js`, `pwa.js`, `sw.js` | C/T estrutural; M offline real |
| 16 | Fila isolada por conta Google mesmo com mesmo ID | `background-sync.js`, `background-queue.test.js` | C/T |
| 17 | Cancelamento individual e logout sem afetar outra conta | `background-sync.js`, `google-drive-sync.js` | C/T |
| 18 | Concorrência da fila sem envio duplicado | Lease transacional IndexedDB; `background-queue.test.js` | C/T |
| 19 | Recibos, conflitos, falhas e documento preservado | `background-sync.js`, `background-queue.test.js` | C/T: falha HTTP/JSON isolada por item, envio dos demais, documento e revisão preservados; M: teste Android |
| 20 | Upload por partes, retomada e limite de 12 MB | `background-sync.js`, `api/team-reports.mjs` | C/T de 3,2 MB e rejeição >12 MB |
| 21 | Enviar com aplicativo fechado | Service Worker + Background Sync | P/M: depende do Android/navegador, não garantido universalmente |
| 22 | Dois seletores de fotos: câmera traseira e galeria | `index.html`, `field-tools.js` | C; M: permissão negada/cancelada, fotos múltiplas |
| 23 | Fotos antes/depois, legenda, prévia e ordenação | `photo-markup.js`, `field-tools.js`, `photo-order.js`, `photo-order.test.js`, `team-drive.test.js` | C/T: ordenação com legenda, original e marcação preservados, oito fotos sintéticas recuperadas do Drive; M: validar no Android |
| 24 | PDF longo e com muitas fotos, individual e consolidado | `pdf-export.js`, `pdf-lib.min.js` | C; M: memória/paginação com fotos reais |
| 25 | TAG por QR Code e ditado opcional | `management-tools.js` | C condicional; M: depende de BarcodeDetector/SpeechRecognition |
| 26 | Indicadores/CSV, revisão técnica por IA e acessibilidade | `management-tools.js`, `technical-review.js`, `layout.js` | P: implementações presentes, exigir QA funcional, teclado/leitor de tela e autorização IA |

## Testes obrigatórios antes de declarar 100%

1. Android real com o aplicativo instalado: conectado, offline, fechado e reaberto; câmera, galeria e PDFs com 8 fotos.
2. Duas contas Google aprovadas: mesma TAG/OS, editar, finalizar, excluir/restaurar e consultar auditoria; sem acesso indevido.
3. Administrador cadastra nomes dos técnicos (sob consentimento da equipe), testa troca de nome sem reescrever eventos antigos.
4. Simular conflito de duas revisões do mesmo relatório e comparar versões antes de resolver.
5. Homologar em Android, com duas contas autorizadas, a busca por OS de relatórios compartilhados **não presentes no armazenamento local**. A implementação consulta o Drive sob demanda em páginas de 20, sem criar índice persistente ou precisar regravar relatórios antigos.
6. Testar os recursos opcionais QR, ditado e IA no ambiente autorizado; sem envio de dados operacionais reais aos serviços externos durante testes.

## Segurança e operação

- Testes automatizados usam **dados sintéticos**.
- Nenhum teste deve alterar/excluir registros reais, nem inserir credenciais no repositório.
- A fila em segundo plano depende de suporte de navegador e condições do Android; não prometer 100% de entrega com app fechado em todos os aparelhos.
- A publicação somente é considerada concluída após CI aprovada, Vercel **READY** e domínio oficial apontando para o commit correto.
- Retomar nas próximas execuções somente os critérios **P/M**, atualizando esta matriz com evidências e sem renomear resultados pendentes como concluídos.

## Lote de melhorias — busca OS remota

- Pesquisa por OS **exata ou parcial** incluindo zeros iniciais preservados, relatórios antigos e documentos da equipe ausentes do celular.
- Endpoint exige membro Google aprovado, pesquisa apenas relatórios ativos, lê metadados no Drive central **sem baixar arquivos de fotos** e não modifica nenhum documento.
- Páginas de até 20 relatórios e quatro leituras paralelas por lote, com botão de continuar e mensagem de falha explícita.
- Cópia local apenas sob comando explícito, com novo identificador, sem sobrescrever a vistoria da equipe.
- Testes sintéticos: autenticação negada, OS de cabeçalho e pontos, exata/parcial, zeros, lixeira ignorada, paginação e falha de rede.
- **Pendente de homologação**: Android real, duas contas reais, câmera/permissões, PDF longo com fotos e recursos de QR/ditado/IA. Nenhum destes é declarado homologado.

## Lote de QA — ordenação de evidências

- Botões acessíveis de foto anterior/próxima na prévia de cada ponto, sem modificar imagem, legenda, original ou marcação.
- Ordenação funciona na edição local, backups e sincronização porque altera a sequência da lista de fotos já persistida.
- Teste de regressão para reordenação, bloqueio durante carregamento, preservação dos objetos e disponibilidade offline.
- Teste de recuperação de **oito fotografias sintéticas** por ponto, com OS geral e OS individual, no Drive simulado (não testa Android nem paginação visual do PDF).

## Lote de resiliência da fila — 20/11/2026

- Falha transitória de envio de um relatório não interrompe os demais itens da mesma conta: cada item libera sua lease e preserva documento e revisão para nova tentativa.
- Resposta JSON inválida de um recibo não remove o documento nem impede o envio de outros relatórios.
- Dois novos testes sintéticos verificam falha HTTP 503, retomada posterior, recibo inválido e ausência de reenvio duplicado do item já confirmado.
- A identidade da conta continua verificada pela sessão antes da transmissão e o isolamento por chave composta, geração e lease permanece inalterado.
- Ainda exige validação Android real, app fechado, duas contas autorizadas e concorrência de dispositivos. Não equivale a homologação integral.

## Lote de isolamento de sessão durante transmissão — 21/11/2026

- Revalidação da sessão autenticada e do identificador da conta **antes de cada POST** de relatório, inclusive consulta de partes, envio de cada chunk e conclusão.
- O token de acesso não é reutilizado após troca de conta; o token fresco da sessão corrente só é usado se a identidade permanecer igual à do trabalho.
- Se ocorrer logout, expiração ou troca de conta, a fila mantém o documento e a revisão originais, libera a lease e aguarda nova execução autorizada. Não elimina trabalhos de outras contas.
- Testes sintéticos específicos: troca de conta entre relatórios; logout entre chunks; troca de conta antes da consulta de partes, sem transmissão indevida.
- Pendência **M**: verificar em Android real e com duas contas autorizadas o comportamento do Service Worker com aplicativo fechado e retomada de upload. Nenhuma validação real foi simulada como homologação.

## Lote de validação de recibos de partes — 21/11/2026

- A retomada de upload em partes só aceita um vetor de índices inteiros, não negativos, sem duplicação e dentro da quantidade real de partes. Recibos de status com valores negativos, fora do limite, fracionários, textuais, duplicados ou ausentes são recusados sem transmitir bytes.
- JSON inválido ou recibo malformado preserva o documento, hash, revisão, progresso e lease liberada para nova tentativa. Nenhum documento é excluído ou marcado como enviado sem confirmação final.
- Testes sintéticos específicos verificam recibos inválidos e recuperação após JSON corrompido; **não substituem** Android real, duas contas autorizadas nem auditoria de rede no dispositivo.

## Lote de QA — limite de upload e recibos — 22/11/2026

- Novos testes sintéticos cobrem documento de 11,8 MB, falha transitória na parte 7, retomada com recibos de partes já armazenadas, nenhuma duplicação de partes confirmadas e OS com zeros iniciais.
- Resposta HTTP 200 sem `ok: true` não confirma parte, não avança progresso nem apaga documento.
- **Não homologado em Android real:** teste de PWA fechado, retomada no dispositivo e duas contas autorizadas permanecem M/P.
- Nenhum relatório real foi alterado por este lote de QA.

## Lote de recuperação do agendamento — 22/11/2026

- Botão **Reagendar envios pendentes** na equipe: verifica identidade Google da equipe, sessão pessoal e seleciona apenas pendências da conta autenticada antes de registrar o Background Sync.
- Falha ao registrar a sincronização depois de enfileirar não é apresentada como perda do relatório; a fila persistente permanece e a interface orienta reagendamento.
- Reagendamento não regrava, cancela ou remove relatórios; testes sintéticos de estrutura e autorização em `background-retry-ui.test.js`.
- Pendente M: testar Android real, app fechado e políticas de execução do navegador; registro de tarefa não garante execução.

## QA complementar — limite e recuperação (22/11/2026)

- Testes sintéticos para HTTP 429 transitório: mantém relatório, libera lease, recupera envio e preserva OS com zeros iniciais.
- Teste de relatório acima de 12 MB: estado de conflito sem transmissão ao servidor, preservando documento para revisão.
- Não substitui testes Android real, duas contas autorizadas nem PDF visual longo; critérios M/P permanecem pendentes.

## Layout incremental — progresso do assistente (22/11/2026)

- Navegação do assistente sinaliza campos essenciais preenchidos ou pendentes nas etapas de identificação e condição; na conclusão corrigida, sinaliza os campos de serviço exigidos.
- Indicadores são informativos, atualizados por input/change, sem escrever nos dados ou esconder opções adicionais.
- Requer conferência visual Android real e testes de acessibilidade antes de homologação manual.

## Assistente de campo — navegação por pendências (22/11/2026)

- Contador acessível de campos essenciais ainda vazios e atalho para o próximo campo pendente, inclusive campos de conclusão quando o status é Corrigido.
- O atalho abre a etapa/campo sem alterar os dados digitados e não bloqueia campos opcionais.
- Teste sintético incluído; experiência real Android ainda requer validação manual.

## Layout — foco e acessibilidade do assistente (22/11/2026)

- Mudança incremental: ao navegar entre etapas, o título da etapa recebe foco de teclado e leitor de tela, sem alterar os dados preenchidos.
- Rolagem respeita a preferência do sistema por movimento reduzido; validação utiliza a mesma lista de campos essenciais exibida no contador.
- Teste sintético de regressão incluído. Conferência visual e com leitor de tela Android real permanece pendente.

## Relatório parcial — seleção de pontos (24/11/2026)

- Seleção por ID permanente do ponto; filtro visual opcional somente selecionados, seleção dos visíveis e limpeza da seleção.
- PDF parcial somente com os pontos selecionados, respectivas fotos e numeração original; não inclui PDF de origem integral ou conclusão geral de uma seleção parcial. Exportação completa permanece disponível.
- Seleção não modifica documentos salvos, não é sincronizada e é reiniciada ao trocar de vistoria. Teste de regressão sintético; homologação Android real pendente.
