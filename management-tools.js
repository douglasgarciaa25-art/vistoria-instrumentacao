(()=>{'use strict';
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
const home=document.getElementById('view-home');if(!home)return;
const panel=el('section');panel.className='card';panel.append(el('h2','Indicadores de manutenção'));
panel.classList.add('maintenance-indicators');
panel.append(el('p','Indicadores das vistorias salvas e sincronizadas neste aparelho.'));
const holder=el('label','Área da vistoria');holder.className='indicator-area';
const filter=el('select');filter.setAttribute('aria-label','Área dos indicadores');holder.append(filter);panel.append(holder);
const summary=el('div');summary.className='indicator-grid';summary.setAttribute('aria-live','polite');panel.append(summary);
const csv=el('button','Exportar indicadores para Excel (CSV)');csv.type='button';panel.append(csv);
const anchor=home.querySelector('.home-metrics-disclosure')||home.querySelector('.metrics');anchor.after(panel);
function indicatorRows(){return historyItems.flatMap(x=>(x.document.records||[]).map(p=>({p,m:x.document.meta,area:vistoriaReportArea(x.document)})))}
function indicatorFilter(data,area){
 const key=v=>String(v||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 return data.filter(row=>!area||key(row.area)===area);
}
function rows(){return indicatorFilter(indicatorRows(),filter.value)}
function update(){
 const old=filter.value;
 const catalog=vistoriaAreaCatalog();
 const unique=new Map(catalog.map(name=>[vistoriaAreaKey(name),vistoriaAreaName(name)]).filter(([key])=>key));
 const choices=[['','Todas as áreas'],...unique];
 if(filter.options.length!==choices.length||choices.some(([value,label],i)=>filter.options[i]?.value!==value||filter.options[i]?.text!==label)){
  filter.replaceChildren(...choices.map(([value,label])=>new Option(label,value)));
  filter.value=unique.has(old)?old:'';
 }
 const data=rows();summary.replaceChildren();csv.disabled=!data.length;
 const done=data.filter(x=>['Corrigido','Sem pendência'].includes(x.p.status)).length;
 for(const [label,count,tone] of [['Total de pontos',data.length,'total'],['Pendentes',data.filter(x=>x.p.status==='Pendente').length,'pending'],['Em acompanhamento',data.filter(x=>x.p.status==='Em acompanhamento').length,'progress'],['Finalizados',done,'done'],['Alta ou crítica em aberto',data.filter(x=>!['Corrigido','Sem pendência'].includes(x.p.status)&&/alta|crítica/i.test(x.p.priority)).length,'critical']]){
  const card=el('div');card.className='indicator-stat';card.dataset.tone=tone;card.append(el('span',label),el('strong',String(count)));summary.append(card);
 }
 const completion=el('div');completion.className='indicator-completion';completion.append(el('span','Índice de conclusão'),el('strong',data.length?(100*done/data.length).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'));
 const meter=el('progress');meter.max=Math.max(1,data.length);meter.value=done;meter.setAttribute('aria-label','Índice de conclusão');completion.append(meter);summary.append(completion);
}
filter.onchange=update;document.addEventListener('vistoria-saved',update);new MutationObserver(update).observe(document.getElementById('historyList'),{childList:true});update();
const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
csv.onclick=()=>{const table=[['OS / referência','Data','TAG','Área da vistoria','Localização do ponto','Equipamento','Prioridade','Situação','Responsável','Prazo','Condição','Ação'],...rows().map(({p,m,area})=>[p.pointWorkOrder||m.workOrder||m.number,m.date,p.tag,area,p.area,p.equipment,p.priority,p.status,p.owner,p.deadline,p.problem,p.action])];download(new Blob(['\ufeff'+table.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'Indicadores-vistoria-'+today()+'.csv')};
// O ditado é controlado por voice-dictation.js para evitar botões e captações duplicados.
const tag=document.getElementById('tag');
if(tag&&'BarcodeDetector' in window&&navigator.mediaDevices?.getUserMedia){
 const scan=el('button','Ler QR Code da TAG');scan.type='button';scan.className='secondary';tag.closest('label').after(scan);
 scan.onclick=async()=>{let stream,closed=false;const dialog=el('dialog');const video=el('video');video.autoplay=true;video.playsInline=true;video.style.width='100%';const stop=el('button','Cancelar leitura');stop.type='button';dialog.append(video,stop);document.body.append(dialog);const report=activeReportId,point=editing,original=tag.value;
 const close=()=>{closed=true;stream?.getTracks().forEach(t=>t.stop());dialog.remove()};stop.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 try{dialog.showModal();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(closed){stream.getTracks().forEach(t=>t.stop());return}video.srcObject=stream;await video.play();const detector=new BarcodeDetector({formats:['qr_code']});const tick=async()=>{if(closed)return;try{const codes=await detector.detect(video);if(closed)return;const value=codes[0]?.rawValue;if(value){close();if(activeReportId!==report||editing!==point||tag.value!==original)return notify('O ponto mudou. Leitura descartada.');if(value.length>120||/[\r\n]/.test(value)||/^https?:/i.test(value))return notify('QR Code não contém uma TAG simples.');tag.value=value.trim();tag.dispatchEvent(new Event('input',{bubbles:true}));tag.dispatchEvent(new Event('change',{bubbles:true}));save();return}setTimeout(tick,300)}catch{close();notify('Não foi possível ler o QR Code.')}};tick()}catch{close();notify('Câmera ou leitura QR indisponível.')}};
}
})();