/* Revisão local gratuita, sem transmissão de texto. */
(()=>{
 'use strict';
 const fields=[
  ['analysisDraft','Etapa do andamento'],
  ['problem','Condição encontrada'],
  ['impact','Impacto / consequência'],
  ['action','Ação recomendada'],
  ['completionWork','Serviço realizado'],
  ['objective','Objetivo'],
  ['conclusion','Conclusão']
 ];
 const resetPanels=[];
 const fieldHints={
  analysisDraft:'Informe o teste realizado, a condição observada e o resultado, quando disponíveis.',
  problem:'Descreva o sintoma observado e a TAG. Separe suspeitas de causas confirmadas.',
  impact:'Informe somente consequências observadas ou riscos identificados, distinguindo os dois.',
  action:'Indique a ação proposta e as verificações ainda necessárias.',
  completionWork:'Registre somente serviços executados e resultados efetivamente verificados.',
  objective:'Indique o equipamento e a finalidade da vistoria.',
  conclusion:'Informe a condição final conhecida e eventuais pendências.'
 };
 function reviseLocal(original,field){
   let revised=original.trim();
   // Substituições conservadoras: não alteram números, TAGs, negações ou resultados.
   const rules=[
    [/\btava\b/gi,'estava'],[/\btavam\b/gi,'estavam'],
    [/\bpra\b/gi,'para'],[/\bpro\b/gi,'para o'],
    [/\ba gente fez\b/gi,'realizamos'],[/\ba gente verificou\b/gi,'verificamos'],
    [/\bfoi feito a\b/gi,'foi realizada a'],[/\bfoi feito uma\b/gi,'foi realizada uma'],
    [/\bfoi realizado os\b/gi,'foram realizados os'],
    [/\bfoi realizada as\b/gi,'foram realizadas as'],
    [/\bfoi feito os\b/gi,'foram realizados os'],
    [/\bdeu problema\b/gi,'apresentou problema'],
    [/\bdeu falha\b/gi,'apresentou falha'],
    [/\bvoltou a funcionar\b/gi,'voltou a operar'],
    [/\bfoi trocado a\b/gi,'foi substituída a'],
    [/\bfoi trocado o\b/gi,'foi substituído o'],
    [/\bposiciondor\b/gi,'posicionador'],[/\bcalibraçao\b/gi,'calibração'],
    [/\bintrumentos\b/gi,'instrumentos'],[/\bcomunicaçao\b/gi,'comunicação'],
    [/\bvalvula\b/gi,'válvula'],[/\bpressao\b/gi,'pressão'],
    [/\bvazao\b/gi,'vazão'],[/\bnao\b/gi,'não']
   ];
   rules.push(
    [/\bfoi realizado uma\b/gi,'foi realizada uma'],
    [/\bfoi realizado a\b/gi,'foi realizada a'],
    [/\bfoi verificado as\b/gi,'foram verificadas as'],
    [/\bfoi verificado os\b/gi,'foram verificados os'],
    [/\bfizemos os testes\b/gi,'realizamos os testes'],
    [/\bfiz os testes\b/gi,'realizei os testes'],
    [/\bfiz a limpeza\b/gi,'realizei a limpeza'],
    [/\bfiz a troca\b/gi,'realizei a substituição'],
    [/\bdeu erro\b/gi,'apresentou erro'],
    [/\bperdeu a comunicação\b/gi,'apresentou perda de comunicação'],
    [/\bsem sinal nenhum\b/gi,'sem sinal'],
    [/\bde vez em quando\b/gi,'de forma intermitente'],
    [/\bpor enquanto\b/gi,'até o momento'],
    [/\bprecisa verificar\b/gi,'é necessário verificar'],
    [/\btem que verificar\b/gi,'é necessário verificar'],
    [/\bcelula de carga\b/gi,'célula de carga'],
    [/\btransmissao\b/gi,'transmissão'],
    [/\bautomacao\b/gi,'automação'],
    [/\binspecao\b/gi,'inspeção'],
    [/\bmanutencao\b/gi,'manutenção'],
    [/\bconexao\b/gi,'conexão'],
    [/\bsolenoide\b/gi,'solenoide']
   );
   rules.push(
    [/\bfoi feito um teste\b/gi,'foi realizado um teste'],
    [/\bfoi feita a checagem\b/gi,'foi realizada a verificação'],
    [/\bfoi checado o\b/gi,'foi verificado o'],
    [/\bfoi checado a\b/gi,'foi verificada a'],
    [/\bfoi conferido a\b/gi,'foi conferida a'],
    [/\bfoi efetuado a\b/gi,'foi efetuada a'],
    [/\bfoi identificado uma\b/gi,'foi identificada uma'],
    [/\bfoi encontrado uma\b/gi,'foi encontrada uma'],
    [/\bfoi constatado uma\b/gi,'foi constatada uma'],
    [/\bfoi feito testes\b/gi,'foram realizados testes'],
    [/\bfoi realizado testes\b/gi,'foram realizados testes'],
    [/\bfoi realizado verificações\b/gi,'foram realizadas verificações'],
    [/\bficou sem comunicação\b/gi,'ficou sem comunicação'],
    [/\bficou oscilando\b/gi,'apresentou oscilação'],
    [/\bficou variando\b/gi,'apresentou variação'],
    [/\bnão tava funcionando\b/gi,'não estava funcionando'],
    [/\bcom a finalidade de poder\b/gi,'com a finalidade de'],
    [/\bpara poder verificar\b/gi,'para verificar'],
    [/\bcom relação a\b/gi,'em relação a'],
    [/\bpossivel\b/gi,'possível'],
    [/\bhipotese\b/gi,'hipótese'],
    [/\bdiagnostico\b/gi,'diagnóstico'],
    [/\batuacao\b/gi,'atuação'],
    [/\balimentacao\b/gi,'alimentação'],
    [/\bconversao\b/gi,'conversão'],
    [/\bmedicao\b/gi,'medição'],
    [/\bverificacao\b/gi,'verificação'],
    [/\bsubstituicao\b/gi,'substituição'],
    [/\bcorrecao\b/gi,'correção'],
    [/\bconclusao\b/gi,'conclusão']
   );
   // Preserva identificadores, valores, unidades e trechos entre aspas.
   const protectedParts=/(["“][^"”\n]+["”]|\b[\w.-]*\d[\w.,:/%-]*|\b[A-Z]{2,}(?:[_-][A-Z0-9]+)*\b|\b(?:mA|mV|kPa|MPa|kgf|kWh|rpm|bar)\b)/g;
   revised=revised.split(protectedParts).map((part,i)=>{
    if(i%2)return part;
    for(const [pattern,value] of rules){
     part=part.replace(pattern,match=>/^[A-ZÀ-Ý]/.test(match)?value.charAt(0).toUpperCase()+value.slice(1):value);
    }
    return part;
   }).join('');
   // Capitaliza somente palavras comuns reconhecidas, sem modificar identificadores.
   revised=revised.replace(/^(foi|foram|realizei|realizamos|identificado|identificada|verificado|verificada|possível|não|durante|após|necessário|é necessário|a válvula|o equipamento)\b/iu,m=>m[0].toUpperCase()+m.slice(1));
   if(revised&&!/[.!?;:]$/.test(revised)&&!/[0-9]$/.test(revised))revised+='.';
   // Reestrutura apenas construções explícitas, sem inferir execução ou diagnóstico.
   if(field){
    const patterns=[
     [/^Foi realizada a verificação (.+)$/iu,'Realizou-se a verificação $1'],
     [/^Foi realizada a inspeção (.+)$/iu,'Realizou-se a inspeção $1'],
     [/^Foram realizados testes (.+)$/iu,'Realizaram-se testes $1'],
     [/^Foram realizados os testes (.+)$/iu,'Realizaram-se os testes $1'],
     [/^Foi identificada (.+)$/iu,'Identificou-se $1'],
     [/^Foi identificado (.+)$/iu,'Identificou-se $1'],
     [/^Foi constatada (.+)$/iu,'Constatou-se $1'],
     [/^Foi constatado (.+)$/iu,'Constatou-se $1'],
     [/^Foi efetuada (.+)$/iu,'Efetuou-se $1']
    ];
    if(field==='action')patterns.push([/^É necessário verificar (.+)$/iu,'Recomenda-se verificar $1']);
    for(const [pattern,value] of patterns){
     if(pattern.test(revised)){revised=revised.replace(pattern,value);break;}
    }
   }
   return revised;
 }
 if(typeof globalThis!=='undefined')globalThis.VistoriaReviseLocal=reviseLocal;
 if(typeof document==='undefined')return;

 for(const [id,title] of fields){
  const field=document.getElementById(id);
  if(!field||!field.closest('label'))continue;

  const container=document.createElement('div');
  container.className='technical-review';
  const review=document.createElement('button');
  review.type='button';review.className='secondary';
  review.textContent='Revisar redação técnica (offline)';
  const ai=document.createElement('button');
  ai.type='button';ai.className='secondary';ai.textContent='Reescrever com IA';
  const undo=document.createElement('button');
  undo.type='button';undo.className='secondary';undo.textContent='Desfazer revisão';undo.hidden=true;
  const status=document.createElement('p');
  status.className='muted technical-review-status';status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');

  const panel=document.createElement('div');
  panel.className='technical-review-preview';panel.hidden=true;
  const label=document.createElement('label');
  label.textContent='Sugestão de redação técnica — confira os dados antes de aceitar';
  const suggestion=document.createElement('textarea');
  suggestion.rows=5;suggestion.setAttribute('aria-label','Texto técnico sugerido para '+title);
  label.append(suggestion);
  const accept=document.createElement('button');
  accept.type='button';accept.textContent='Usar texto revisado';
  const dismiss=document.createElement('button');
  dismiss.type='button';dismiss.className='secondary';dismiss.textContent='Manter meu texto';
  const commands=document.createElement('div');commands.className='actions';
  commands.append(accept,dismiss);
  const hint=document.createElement('p');
  hint.className='muted';
  hint.textContent=fieldHints[id];
  const originalLabel=document.createElement('p');
  originalLabel.className='muted';
  originalLabel.textContent='Relato original (somente leitura)';
  const originalPreview=document.createElement('textarea');
  originalPreview.readOnly=true;originalPreview.rows=3;
  originalPreview.setAttribute('aria-label','Relato original de '+title);
  panel.append(originalLabel,originalPreview,label,hint,commands);

  const buttons=document.createElement('div');buttons.className='actions';buttons.append(ai,review,undo);
  container.append(buttons,status,panel);
  field.closest('label').after(container);

  let pending=null,applied=null,generation=0;
  function clear(){
   generation++;
   pending=null;applied=null;panel.hidden=true;undo.hidden=true;
   suggestion.value='';originalPreview.value='';status.textContent='';
  }
  resetPanels.push(clear);
  field.addEventListener('input',()=>{
   generation++;
   if(pending&&field.value!==pending.original){pending=null;panel.hidden=true;status.textContent='O texto mudou. Solicite outra revisão, se desejar.'}
   if(applied&&field.value!==applied.revised){applied=null;undo.hidden=true}
  });

  review.addEventListener('click',()=>{
   const original=field.value;
   if(!original.trim())return notify('Escreva primeiro a sua descrição.');
   generation++;
   const revised=reviseLocal(original,id);
   pending={original};
   originalPreview.value=original;
   suggestion.value=revised;panel.hidden=false;
   status.textContent=revised===original.trim()?'O assistente local não encontrou uma reformulação segura. Edite a sugestão manualmente; nenhum dado foi alterado.':'Sugestão local pronta. Confira os dados antes de aceitar.';
   accept.disabled=revised===original.trim();
  });

  ai.addEventListener('click',async()=>{
   const original=field.value;
   if(!original.trim())return notify('Escreva primeiro o relato.');
   if(original.trim().length>3500)return notify('Limite de 3.500 caracteres por revisão.');
   const drive=window.VistoriaGoogleDrive;
   if(!navigator.onLine||!drive?.getState().enabled)return notify('Conecte o Google Drive e a internet para usar IA. A revisão offline continua disponível.');
   if(!confirm('Enviar somente este texto ao serviço de IA? Não envie dados sigilosos sem autorização. O serviço pode gerar custos.'))return;
   const requestGeneration=++generation;
   ai.disabled=true;status.textContent='Reescrevendo com IA…';
   try{
    const result=await drive.reviewTechnical(id,original);
    if(generation!==requestGeneration||field.value!==original)return;
    if(typeof result.suggested!=='string'||!result.suggested.trim())throw Error('Resposta inválida.');
    pending={original};originalPreview.value=original;suggestion.value=result.suggested.trim();panel.hidden=false;
    accept.disabled=suggestion.value===original.trim();
    status.textContent='Sugestão da IA. Confira os fatos e medições antes de aceitar.';
   }catch(e){if(generation===requestGeneration)status.textContent='IA indisponível: '+e.message+' A revisão offline permanece disponível.';}
   finally{ai.disabled=false;}
  });
  suggestion.addEventListener('input',()=>{accept.disabled=!pending||!suggestion.value.trim()||suggestion.value.trim()===pending.original.trim()});
  accept.addEventListener('click',()=>{
   if(!pending)return;
   if(field.value!==pending.original){panel.hidden=true;pending=null;return notify('O texto mudou. Solicite nova revisão.')}
   const revised=suggestion.value.trim();
   if(!revised)return notify('A sugestão precisa ter algum texto.');
   const original=pending.original;
   pending=null;panel.hidden=true;suggestion.value='';
   field.value=revised;
   field.dispatchEvent(new Event('input',{bubbles:true}));
   applied={original,revised};undo.hidden=false;
   status.textContent='Redação técnica aplicada. O registro só será adicionado/salvo pelas ações normais do aplicativo.';
   notify('Texto revisado aplicado. Confira dados, TAGs, medições e serviços antes de salvar.');
  });
  dismiss.addEventListener('click',()=>{
   generation++;
   pending=null;panel.hidden=true;suggestion.value='';
   status.textContent='Texto original mantido, sem alterações.';
  });
  undo.addEventListener('click',()=>{
   if(!applied)return;
   if(field.value!==applied.revised)return notify('O texto já foi alterado; não é possível desfazer automaticamente.');
   const original=applied.original;
   applied=null;undo.hidden=true;
   field.value=original;field.dispatchEvent(new Event('input',{bubbles:true}));
   status.textContent='Relato original restaurado.';
   notify('Texto original restaurado.');
  });
 }

 // Limpa sugestões de outro ponto, mesmo quando os dados foram carregados sem eventos de input.
 const resetBefore=reset;
 reset=function(){for(const clear of resetPanels)clear();return resetBefore.apply(this,arguments)};
 const fillBefore=fill;
 fill=function(){for(const clear of resetPanels)clear();return fillBefore.apply(this,arguments)};
 document.getElementById('appendAnalysis')?.addEventListener('click',()=>{
  for(const clear of resetPanels)clear();
 });

 const batch=document.createElement('button');batch.type='button';batch.className='secondary';batch.textContent='Revisar todos os textos preenchidos com IA';
 const batchPanel=document.createElement('div');batchPanel.className='technical-review-preview';batchPanel.hidden=true;
 batch.onclick=async()=>{const drive=window.VistoriaGoogleDrive;const snapshot=fields.map(([id,title])=>({id,title,field:document.getElementById(id)})).filter(x=>x.field?.value.trim()).map(x=>({...x,original:x.field.value}));if(!snapshot.length)return notify('Preencha os textos primeiro.');if(!navigator.onLine||!drive?.getState().enabled)return notify('Conecte o Google Drive e a internet.');if(!confirm('Enviar os textos preenchidos desta tela à IA? Confira a autorização para dados internos.'))return;batch.disabled=true;batchPanel.hidden=false;batchPanel.replaceChildren();const context=typeof activeReportId!=='undefined'?activeReportId:null;try{for(const item of snapshot){if(item.original.length>3500)continue;if((typeof activeReportId!=='undefined'?activeReportId:null)!==context||snapshot.some(x=>x.field.value!==x.original))break;const result=await drive.reviewTechnical(item.id,item.original);if((typeof activeReportId!=='undefined'?activeReportId:null)!==context||snapshot.some(x=>x.field.value!==x.original))break;const label=document.createElement('p');label.textContent=item.title;const preview=document.createElement('textarea');preview.value=String(result.suggested||'');preview.rows=4;const apply=document.createElement('button');apply.type='button';apply.textContent='Aplicar sugestão';apply.onclick=()=>{if((typeof activeReportId!=='undefined'?activeReportId:null)!==context||item.field.value!==item.original)return notify('O texto mudou. Revise novamente.');if(!preview.value.trim())return;item.field.value=preview.value.trim();item.field.dispatchEvent(new Event('input',{bubbles:true}));apply.disabled=true;};batchPanel.append(label,preview,apply);}}catch(e){notify('Revisão interrompida: '+e.message);}finally{batch.disabled=false;}};
 resetPanels.push(()=>{batchPanel.replaceChildren();batchPanel.hidden=true;});
 document.getElementById('analysisDraft')?.closest('label')?.parentElement?.append(batch,batchPanel);
 const full=document.createElement('button');full.type='button';full.className='secondary';full.textContent='Revisar relatório completo com IA';
 const fullPanel=document.createElement('div');fullPanel.hidden=true;fullPanel.className='technical-review-preview';
 let fullGeneration=0;
 resetPanels.push(()=>{fullGeneration++;fullPanel.hidden=true;fullPanel.replaceChildren();});
 full.onclick=async()=>{const drive=window.VistoriaGoogleDrive;if(!navigator.onLine||!drive?.getState().enabled)return notify('Conecte o Google Drive e a internet.');const snapshot=structuredClone(data());const items=[];for(const key of ['objective','conclusion'])if(snapshot.meta[key]?.trim())items.push({label:key,field:key,text:snapshot.meta[key]});for(const point of snapshot.records){for(const key of ['problem','impact','action','completionWork'])if(point[key]?.trim())items.push({label:(point.tag||'Ponto')+' — '+key,field:key,text:point[key]});}if(!items.length)return notify('Nenhum texto registrado.');if(!confirm('Revisar '+items.length+' textos registrados? Os textos serão enviados à IA, em grupos de até 12. Nenhum original será alterado.'))return;const generation=++fullGeneration;fullPanel.hidden=false;fullPanel.replaceChildren();let cursor=0;const next=document.createElement('button');next.type='button';const progress=document.createElement('p');progress.setAttribute('role','status');fullPanel.append(progress,next);const run=async()=>{next.disabled=true;try{const end=Math.min(cursor+12,items.length);while(cursor<end&&generation===fullGeneration){const item=items[cursor];progress.textContent='Revisando '+(cursor+1)+' de '+items.length;let suggestion;try{suggestion=item.text.length>3500?'Texto acima do limite; revise individualmente.':(await drive.reviewTechnical(item.field,item.text)).suggested;}catch(e){progress.textContent='Interrompido: '+e.message;return;}if(generation!==fullGeneration)return;const heading=document.createElement('p');heading.textContent=item.label;const original=document.createElement('textarea');original.readOnly=true;original.rows=3;original.value=item.text;const revised=document.createElement('textarea');revised.rows=4;revised.value=String(suggestion||'');revised.setAttribute('aria-label','Sugestão para '+item.label);fullPanel.insertBefore(heading,next);fullPanel.insertBefore(original,next);fullPanel.insertBefore(revised,next);cursor++;}progress.textContent=cursor+' de '+items.length+' textos revisados. Copie as sugestões desejadas; os registros originais permanecem intactos.';}finally{next.disabled=cursor>=items.length;next.textContent=cursor>=items.length?'Revisão concluída':'Continuar revisão';}};next.onclick=run;await run();};
 document.getElementById('pdf')?.closest('.actions')?.after(full,fullPanel);
 const note=document.createElement('p');
 note.className='muted technical-review-note';
 note.textContent='O texto é sempre escrito pela equipe. O assistente local apenas sugere ajustes de redação; não confirma execução, testes, medições ou conformidade técnica. Confira e aprove antes de registrar.';
 document.getElementById('analysisDraft')?.closest('label')?.parentElement?.append(note);
})();
