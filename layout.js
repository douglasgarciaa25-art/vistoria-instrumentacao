(()=>{
 const icons={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',edit:'<path d="M12 20H4V4h10M16 3l5 5-9 9-5 1 1-5z"/>',report:'<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h8"/>',cloud:'<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11M12 10v11m-4-4 4 4 4-4"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',check:'<path d="m5 12 4 4 10-10"/>'};
 const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[k]+'</svg>';
 const main=document.querySelector('main'),header=document.querySelector('header'),oldLayout=document.querySelector('.layout'),meta=$('meta').closest('.card'),review=$('entries').closest('.card'),backup=$('backup').closest('.card'),cloud=document.createElement('div'),history=$('historyPanel'),install=$('installPanel');
 document.querySelector('.intro').remove();
 // Keyboard users can bypass the repeated header and navigation on every screen.
 main.id='main-content';main.setAttribute('tabindex','-1');
 const skip=document.createElement('a');skip.className='skip-to-content';skip.href='#main-content';skip.textContent='Pular para o conteúdo principal';
 header.before(skip);
 header.innerHTML='<div class="brand">'+header.querySelector('img').outerHTML+'<div><span class="brand-divider"></span><small>INSTRUMENTAÇÃO & AUTOMAÇÃO</small><h1>Vistoria Técnica</h1></div></div><span id="connectionBadge" class="connection"></span>';
 const nav=document.createElement('nav');nav.className='app-nav';nav.setAttribute('aria-label','Navegação principal');nav.innerHTML=[['home','Início','home'],['editor','Vistoria','edit'],['review','Relatório','report'],['cloud','Nuvem','cloud']].map(([v,t,i])=>'<button type="button" data-view="'+v+'">'+icon(i)+'<span>'+t+'</span></button>').join('');header.after(nav);
 const weeklyLink=document.createElement('button');weeklyLink.type='button';weeklyLink.innerHTML=icon('report')+'<span>Apontamento</span>';weeklyLink.setAttribute('aria-label','Abrir apontamento semanal no Google Planilhas');weeklyLink.addEventListener('click',()=>{location.assign('/api/weekly-sheet')});nav.append(weeklyLink);
 const home=document.createElement('div');home.id='view-home';home.className='app-view';home.innerHTML='<section class="welcome"><div><p class="eyebrow">SEU DIA EM CAMPO</p><h2>Inspecione. Registre.<br><span>Transforme em ação.</span></h2><p>Registre inspeções, organize evidências, acompanhe pendências e gere relatórios de manutenção.</p><div class="actions"><button type="button" id="quickNew">'+icon('plus')+'Nova vistoria</button><button type="button" id="continueReport" class="hero-secondary">Continuar vistoria '+icon('arrow')+'</button></div></div><div class="welcome-mark" aria-hidden="true">'+icon('edit')+'<span>OBSERVAR<br>REGISTRAR<br>ACOMPANHAR</span></div></section><div class="metrics"><div><span class="metric-label">Vistorias salvas</span><strong id="metricReports">0</strong><small>Neste aparelho</small></div><div><span class="metric-label">Pontos registrados</span><strong id="metricPoints">0</strong><small>Nas vistorias salvas</small></div><div><span class="metric-label">Acompanhar</span><strong id="metricPending">0</strong><small>Pendentes ou em acompanhamento</small></div></div>';
  // Keep field-mode home uncluttered without hiding any saved-report indicators.
 const homeMetrics=home.querySelector('.metrics');
 const metricsDisclosure=document.createElement('details');metricsDisclosure.className='home-metrics-disclosure';
 const metricsSummary=document.createElement('summary');metricsSummary.textContent='Indicadores deste aparelho';
 metricsDisclosure.append(metricsSummary);homeMetrics.replaceWith(metricsDisclosure);metricsDisclosure.append(homeMetrics);
 metricsDisclosure.open=!window.matchMedia('(max-width:750px)').matches;
 const editor=document.createElement('div');editor.id='view-editor';editor.className='app-view';editor.innerHTML='<div class="view-heading"><div><p class="eyebrow">LEVANTAMENTO EM CAMPO</p><h2>Minha vistoria</h2><p>Identifique o relatório e adicione os pontos inspecionados.</p></div><button type="button" class="secondary" data-go="review">Revisar relatório '+icon('arrow')+'</button></div><div class="editor-steps"><a href="#identification">1. Identificação</a><a href="#form">2. Pontos e fotos</a><button type="button" data-go="review">3. Revisão</button></div>';
 const report=document.createElement('div');report.id='view-review';report.className='app-view';report.innerHTML='<div class="view-heading"><div><h2>Relatório técnico</h2></div><button type="button" class="secondary" data-go="editor">'+icon('plus')+'Adicionar ponto</button></div><div class="report-strip"><span id="currentReference">Vistoria em edição</span><strong><span id="count">0</span> pontos nesta vistoria</strong></div>';
 const reportSummary=document.createElement('section');reportSummary.className='card report-management-summary';reportSummary.setAttribute('aria-labelledby','reportManagementTitle');
 reportSummary.innerHTML='<h3 id="reportManagementTitle">Acompanhamento de todos os pontos</h3><div class="report-management-grid"><div><small>Total de pontos</small><strong id="reportTotal">0</strong></div><div data-kind="done"><small>Finalizados</small><strong id="reportDone">0</strong></div><div data-kind="progress"><small>Em acompanhamento</small><strong id="reportProgress">0</strong></div><div data-kind="pending"><small>Pendentes</small><strong id="reportPending">0</strong></div></div><label for="reportCompletion">Índice de conclusão <strong id="reportCompletionText">—</strong></label><progress id="reportCompletion" max="100" value="0"></progress><p class="muted" id="reportOtherStatus" hidden></p><p class="muted" id="reportManagementHint">Consolidado de todos os pontos das vistorias salvas neste aparelho, inclusive finalizadas e não selecionadas para PDF. Dados de outros dispositivos entram após sincronizar.</p>';
 const general=document.createElement('details');general.className='report-general-disclosure';general.innerHTML='<summary>Indicadores gerais <span id="reportCompactStats"></span></summary>';general.append(reportSummary);report.append(general);
 // Indicadores gerais, uma entrada por vistoria salva; o editor prevalece no relatório aberto.
 // Não altera dados e independe da seleção do PDF ou dos filtros de visualização.
 function reportPointsAcrossSavedReports(savedReports,currentReportId,currentPoints){
  const points=[];let currentSeen=false;
  for(const row of savedReports||[]){
   if(row?.id===currentReportId){
    points.push(...(currentPoints||[]));currentSeen=true;
   }else if(Array.isArray(row?.document?.records))points.push(...row.document.records);
  }
  if(!currentSeen&&Array.isArray(currentPoints)&&currentPoints.length)points.push(...currentPoints);
  return points;
 }
 function reportManagementStats(points){
  const total=points.length,done=points.filter(r=>['Corrigido','Sem pendência'].includes(r.status)).length,progress=points.filter(r=>r.status==='Em acompanhamento').length,pending=points.filter(r=>r.status==='Pendente').length;
  return {total,done,progress,pending,other:total-done-progress-pending,rate:total?Math.round(done/total*1000)/10:null};
 }
 function updateReportSummary(){
  const stats=reportManagementStats(reportPointsAcrossSavedReports(historyItems,activeReportId,records));
  for(const [id,key] of [['reportTotal','total'],['reportDone','done'],['reportProgress','progress'],['reportPending','pending']])$(id).textContent=stats[key];
  $('reportCompletion').value=stats.rate??0;
  $('reportCompactStats').textContent=stats.total?stats.done+'/'+stats.total+' finalizados · '+(stats.rate??0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'Sem pontos';
  $('reportCompletionText').textContent=stats.rate===null?'Sem pontos':stats.rate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  $('reportOtherStatus').hidden=!stats.other;
  $('reportOtherStatus').textContent=stats.other?stats.other+' ponto(s) com situação não classificada.':'';
 }
 const storage=document.createElement('div');storage.id='view-cloud';storage.className='app-view';storage.innerHTML='<div class="view-heading"><div><p class="eyebrow">GOOGLE DRIVE</p><h2>Vistorias na nuvem Google</h2><p>Organize suas vistorias, acompanhe a equipe e sincronize com segurança.</p></div></div>';
 cloud.id='googleCloudHost';
 meta.id='identification';home.append(history);editor.append(meta,$('form'));report.append(review);const extras=document.createElement('details');extras.className='card cloud-extras';const extrasTitle=document.createElement('summary');extrasTitle.textContent='Backup e instalação do aplicativo';extras.append(extrasTitle,backup,install);storage.append(cloud,extras);oldLayout.remove();main.prepend(home,editor,report,storage);
 // Secondary report settings are kept accessible without crowding the first step.
 const settings=document.createElement('details');settings.className='advanced';settings.innerHTML='<summary>Revisão, aprovações e marca d’água <span>Opcional</span></summary><div class="fields"></div>';
 for(const id of ['revision','watermark','approver','approvalDate','homologator','homologDate','revisionNote'])settings.lastElementChild.append($(id).closest('label'));meta.append(settings);
 const filterGroup=$('filterArea').closest('.fields'),filters=document.createElement('details');filters.className='advanced filters';filters.innerHTML='<summary>Filtrar por área, prioridade e situação</summary>';filterGroup.before(filters);filters.append(filterGroup);
 history.querySelector('.step').textContent='HISTÓRICO';history.querySelector('h2').textContent='Suas vistorias';history.querySelector('p.muted').textContent='Toque em Ver relatório na vistoria desejada para revisar seus pontos e baixar o PDF.';
 $('pdfAll').classList.add('secondary');$('saveReport').textContent='Salvar vistoria aberta';$('pdf').innerHTML=icon('report')+'Baixar relatório em PDF';
 // Keep the primary PDF action visible; secondary formats stay available on demand.
 const formats=document.createElement('details');formats.className='report-formats advanced';
 const formatsSummary=document.createElement('summary');formatsSummary.textContent='Outros formatos de exportação';
 const formatsActions=document.createElement('div');formatsActions.className='actions';
 const wordButton=$('word');wordButton.parentElement.insertAdjacentElement('afterend',formats);
 formats.append(formatsSummary,formatsActions);formatsActions.append(wordButton);

 backup.querySelector('p').textContent='Baixe uma cópia editável com os registros e fotos. Para levar os dados a outro aparelho, conecte o Google Drive ou restaure o arquivo.';
 const current=document.createElement('div');current.className='current-bar';current.innerHTML='<div><span class="current-dot"></span><span id="activeLabel">Vistoria em edição</span></div><button type="button" class="secondary" id="quickSave">'+icon('check')+'Salvar</button>';editor.insertBefore(current,meta);
 function show(view,focus=false){for(const el of [home,editor,report,storage])el.hidden=el.id!=='view-'+view;nav.querySelectorAll('button').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});if(focus){window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});const heading=$('view-'+view).querySelector('h2');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true})}update()}
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)show(b.dataset.view,true)});
 main.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)show(b.dataset.go,true)});
 $('quickNew').onclick=()=>{if(!historyReady||busy||historyBusy)return notify('Aguarde o carregamento dos formulários.');show('editor',true);$('newReport').click()};$('continueReport').onclick=()=>show('editor',true);$('quickSave').onclick=()=>$('saveReport').click();
 ['newReport','clear'].forEach(id=>$(id).addEventListener('click',()=>{if(historyReady&&!busy)show('editor',true)}));
 history.addEventListener('click',e=>{const b=e.target.closest('[data-open-report],[data-duplicate-report]');if(b&&historyReady&&!busy&&!historyBusy)show('editor',true)},true);
 $('entries').addEventListener('click',e=>{if(e.target.closest('[data-edit],[data-duplicate-item]'))show('editor',true)},true);
 function update(){updateReportSummary();const docs=historyItems.map(r=>r.document),points=reportPointsAcrossSavedReports(historyItems,activeReportId,records);$('metricReports').textContent=docs.length;$('metricPoints').textContent=points.length;$('metricPending').textContent=points.filter(r=>['Pendente','Em acompanhamento'].includes(r.status)).length;$('count').textContent=records.length;const label=$('number').value||'Vistoria em edição';$('activeLabel').textContent=label;$('currentReference').textContent=label;
 document.querySelectorAll('.badge').forEach(b=>{b.dataset.tone=/Crítica|Alta/.test(b.textContent)?'urgent':/Corrigido|Sem pendência/.test(b.textContent)?'good':'neutral'})}
 for(const el of [$('historyList'),$('entries')])new MutationObserver(update).observe(el,{childList:true,subtree:true});$('number').addEventListener('input',update);
 function connection(){$('connectionBadge').textContent=navigator.onLine?'Online':'Offline';$('connectionBadge').classList.toggle('offline',!navigator.onLine)}addEventListener('online',connection);addEventListener('offline',connection);connection();show('home');
})();
