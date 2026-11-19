# Matriz de verificação — 26 frentes do Vistoria Técnica

Atualização: 19/11/2026. Base: branch `feat/equipe-compartilhada`.
**Atenção:** estes 26 critérios foram organizados a partir dos requisitos disponíveis. Não foi localizada uma lista original numerada com critérios de aceitação. Portanto, **não representam 26 homologações concluídas**.

Legenda: **C** = implementação presente e conferida no código; **T** = teste sintético automatizado; **M** = validação manual indispensável; **P** = implementação ou comprovação parcial.

| Nº | Critério de aceite | Evidência no projeto | Estado / próximo teste |
|---:|---|---|---|
| 1 | OS opcional no cabeçalho, distinta da referência | `index.html` | C/T (regressão OS) |
| 2 | OS distinta por ponto e editável | `index.html`, `history.js` | C/T (regressão OS) |
| 3 | Zeros iniciais preservados | Campos string; `app-integrity.test.js` | C/T |
| 4 | OS nos PDFs por ponto e completos | `pdf-export.js` | C/T estrutural; M para impressão |
| 5 | Busca exata e parcial de OS no histórico local | `history.js` | C; M para registros reais |
| 6 | Busca de OS por ponto na lista compartilhada | `google-drive-sync.js` | P: corrigido para documentos locais; indexação remota integral ainda não homologada |
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
| 19 | Recibos, conflitos, falhas e documento preservado | `background-sync.js`, `background-queue.test.js` | C/T |
| 20 | Upload por partes, retomada e limite de 12 MB | `background-sync.js`, `api/team-reports.mjs` | C/T de 3,2 MB e rejeição >12 MB |
| 21 | Enviar com aplicativo fechado | Service Worker + Background Sync | P/M: depende do Android/navegador, não garantido universalmente |
| 22 | Dois seletores de fotos: câmera traseira e galeria | `index.html`, `field-tools.js` | C; M: permissão negada/cancelada, fotos múltiplas |
| 23 | Fotos antes/depois, legenda, prévia e ordenação | `photo-markup.js`, `field-tools.js` | P/M: validar preservação e ordenação no Android |
| 24 | PDF longo e com muitas fotos, individual e consolidado | `pdf-export.js`, `pdf-lib.min.js` | C; M: memória/paginação com fotos reais |
| 25 | TAG por QR Code e ditado opcional | `management-tools.js` | C condicional; M: depende de BarcodeDetector/SpeechRecognition |
| 26 | Indicadores/CSV, revisão técnica por IA e acessibilidade | `management-tools.js`, `technical-review.js`, `layout.js` | P: implementações presentes, exigir QA funcional, teclado/leitor de tela e autorização IA |

## Testes obrigatórios antes de declarar 100%

1. Android real com o aplicativo instalado: conectado, offline, fechado e reaberto; câmera, galeria e PDFs com 8 fotos.
2. Duas contas Google aprovadas: mesma TAG/OS, editar, finalizar, excluir/restaurar e consultar auditoria; sem acesso indevido.
3. Administrador cadastra nomes dos técnicos (sob consentimento da equipe), testa troca de nome sem reescrever eventos antigos.
4. Simular conflito de duas revisões do mesmo relatório e comparar versões antes de resolver.
5. Validar busca de OS de relatórios compartilhados **não presentes no armazenamento local**, que ainda precisa de indexação segura no servidor.
6. Testar os recursos opcionais QR, ditado e IA no ambiente autorizado; sem envio de dados operacionais reais aos serviços externos durante testes.

## Segurança e operação

- Testes automatizados usam **dados sintéticos**.
- Nenhum teste deve alterar/excluir registros reais, nem inserir credenciais no repositório.
- A fila em segundo plano depende de suporte de navegador e condições do Android; não prometer 100% de entrega com app fechado em todos os aparelhos.
- A publicação somente é considerada concluída após CI aprovada, Vercel **READY** e domínio oficial apontando para o commit correto.
- Retomar nas próximas execuções somente os critérios **P/M**, atualizando esta matriz com evidências e sem renomear resultados pendentes como concluídos.
