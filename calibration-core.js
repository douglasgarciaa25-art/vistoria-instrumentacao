/* Pure calculation rules shared by the form and Excel export. Values in kg and %. */
(function(root){
 const parse=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const s=String(v).trim();if(!/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?)$/.test(s))return NaN;return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(s)?s.replace(/\./g,''):s)};
 function reading(r){const m=parse(r.measured),p=parse(r.reference);if(m===null&&p===null)return {state:'empty'};if(m===null||p===null)return {state:'incomplete'};if(!Number.isFinite(m)||!Number.isFinite(p)||m<0||p<=0)return {state:'invalid'};return {state:'valid',measured:m,reference:p,difference:m-p,error:(m-p)/p*100}}
 function evaluate(c){const initial=reading(c.readings[0]),rows=c.readings.slice(1).map(reading),t=parse(c.tolerance),valid=rows.filter(r=>r.state==='valid'),max=valid.length?Math.max(...valid.map(r=>Math.abs(r.error))):null;let status='PENDENTE';if(rows.some(r=>r.state==='invalid')||!Number.isFinite(t)||t<0)status='DADOS INVÁLIDOS';else if(valid.length&&!rows.some(r=>r.state==='incomplete'))status=max<=t?'CONFORME':'NÃO CONFORME';return {initial,rows,max,status,count:valid.length}}
 const api={parse,reading,evaluate};root.CalibrationCore=api;
})(typeof window==='undefined'?globalThis:window);
