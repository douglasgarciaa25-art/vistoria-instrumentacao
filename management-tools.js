(()=>{'use strict';
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
const home=document.getElementById('view-home');if(!home)return;
const panel=el('section');panel.className='card';panel.append(el('h2','Indicadores de manutenção'));
panel.append(el('p','Indicadores das vistorias salvas e sincronizadas neste aparelho. Os filtros também se aplicam à exportação.'));
const filters=el('div');filters.className='fields';panel.append(filters);
function control(label,type,aria){const holder=el('label',label),input=el(type==='select'?'select':'input');if(type!=='select')input.type=type;input.setAttribute('aria-label',aria||label);holder.append(input);filters.append(holder);return input}
const filter=control('Área da vistoria','select','Área dos indicadores');
const sub=control('Localização do ponto','select');
const equipment=control('TAG ou equipamento','search');equipment.placeholder='Buscar TAG ou equipamento';
const status=control('Situação','select');for(const [label,value] of [['Todas',''],['Pendentes','Pendente'],['Em acompanhamento','Em acompanhamento'],['Finalizados','finalizados']])status.add(new Option(label,value));
const from=control('Data inicial','date'),to=control('Data final','date');
const clear=el('button','Limpar filtros');clear.type='button';clear.className='secondary';panel.append(clear);
const summary=el('div');summary.setAttribute('aria-live','polite');panel.append(summary);
const csv=el('button','Exportar indicadores para Excel (CSV)');csv.type='button';panel.append(csv);
const anchor=home.querySelector('.home-metrics-disclosure')||home.querySelector('.metrics');anchor.after(panel);
function indicatorRows(){return historyItems.flatMap(x=>(x.document.records||[]).map(p=>({p,m:x.document.meta,area:vistoriaReportArea(x.document)})))}
function indicatorFilter(data,f){
 const key=v=>String(v||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 const search=v=>key(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 return data.filter(({p,m,area})=>(!f.area||key(area)===f.area)&&(!f.sub||key(p.area)===f.sub)&&(!f.equipment||search([p.tag,p.equipment].join(' ')).includes(search(f.equipment)))&&(!f.status||(f.status==='finalizados'?['Corrigido','Sem pendência'].includes(p.status):p.status===f.status))&&(!f.from||(m.date&&m.date>=f.from))&&(!f.to||(m.date&&m.date<=f.to)));
}
function rows(){return indicatorFilter(indicatorRows(),{area:filter.value,sub:sub.value,equipment:equipment.value,status:status.value,from:from.value,to:to.value})}
function options(select,names,all){const old=select.value,unique=new Map();for(const name of names){const label=vistoriaAreaName(name),key=vistoriaAreaKey(label);if(key&&!unique.has(key))unique.set(key,label)}select.replaceChildren(new Option(all,''));for(const [key,label] of [...unique].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')))select.add(new Option(label,key));select.value=unique.has(old)?old:''}
function update(){const all=indicatorRows();options(filter,[...vistoriaAreaCatalog(),...all.map(x=>x.area)],'Todas as áreas');options(sub,all.filter(x=>!filter.value||vistoriaAreaKey(x.area)===filter.value).map(x=>x.p.area),'Todas as localizações');const data=rows();summary.replaceChildren();if(from.value&&to.value&&from.value>to.value){summary.append(el('p','A data inicial deve ser anterior ou igual à data final.'));csv.disabled=true;return}csv.disabled=!data.length;const done=data.filter(x=>['Corrigido','Sem pendência'].includes(x.p.status)).length;for(const [label,count] of [['Total de pontos',data.length],['Pendentes',data.filter(x=>x.p.status==='Pendente').length],['Em acompanhamento',data.filter(x=>x.p.status==='Em acompanhamento').length],['Finalizados',done],['Prioridade alta ou crítica em aberto',data.filter(x=>!['Corrigido','Sem pendência'].includes(x.p.status)&&/alta|crítica/i.test(x.p.priority)).length]]){const line=el('p',label+': '+count);const meter=el('progress');meter.max=Math.max(1,data.length);meter.value=count;meter.style.width='100%';line.append(meter);summary.append(line)}summary.append(el('p','Índice de conclusão: '+(data.length?(100*done/data.length).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—')))}
for(const input of [filter,sub,equipment,status,from,to])input.addEventListener(input===equipment?'input':'change',update);clear.onclick=()=>{for(const input of [filter,sub,equipment,status,from,to])input.value='';update()};document.addEventListener('vistoria-saved',update);new MutationObserver(update).observe(document.getElementById('historyList'),{childList:true});update();
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