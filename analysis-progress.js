/* Ongoing findings remain attached to the same inspection point. */
(()=>{
 const keys=['analysisHistory','analysisDraft'];itemKeys.push(...keys);
 const section=document.createElement('details');section.className='advanced';section.open=true;
 section.innerHTML='<summary>Andamento da análise</summary><p class="muted">Acrescente descobertas sobre o mesmo equipamento, sem apagar a condição inicial. A análise pode continuar em acompanhamento.</p><label>Andamentos registrados<textarea id="analysisHistory" readonly placeholder="Nenhum andamento acrescentado." style="min-height:120px"></textarea></label><label>Novo achado ou teste realizado<textarea id="analysisDraft" placeholder="Ex.: painel com acúmulo de sujeira; cabo soterrado; comunicação do módulo e do switch ainda em análise."></textarea></label><button type="button" class="secondary" id="appendAnalysis">Acrescentar andamento</button><p class="muted">Depois, toque em Salvar alteração para atualizar o ponto. Você também pode adicionar fotos na seção de evidências.</p>';
 $('problem').closest('label').after(section);
 $('analysisDraft').addEventListener('input',()=>save());
 $('appendAnalysis').onclick=()=>{
  const text=$('analysisDraft').value.trim();if(!text)return notify('Descreva o novo achado ou teste realizado.');
  const stamp=new Date().toLocaleString('pt-BR');
  const previous=$('analysisHistory').value.trim();
  $('analysisHistory').value=(previous?previous+'\n\n':'')+'ANDAMENTO — '+stamp+'\n'+text;
  $('analysisDraft').value='';
  if($('status').value==='Pendente')$('status').value='Em acompanhamento';
  save();notify('Andamento acrescentado ao rascunho. Toque em Salvar alteração para atualizar o ponto.');
 };
})();
