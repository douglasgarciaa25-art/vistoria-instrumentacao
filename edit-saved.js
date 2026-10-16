/* Reopen saved points in the editor without replacing an unfinished draft. */
(()=>{
 const picker=document.createElement('label');picker.className='wide';picker.textContent='Ponto salvo para editar';
 const select=document.createElement('select');select.id='savedPointPicker';picker.append(select);$('formTitle').after(picker);
 function refreshPicker(){picker.hidden=!records.length;select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Selecione um ponto salvo';select.append(placeholder);records.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+'. '+r.tag+' — '+r.area;select.append(option)});select.value=editing===null?'':String(editing)}
 function openPoint(i){if(!records[i])return;$('entries').onclick({target:{dataset:{edit:String(i)}}});refreshPicker();save()}
 select.onchange=()=>{if(select.value!=='')openPoint(Number(select.value))};
 const originalRender=render;render=function(){originalRender();refreshPicker()};
 const originalReset=reset;reset=function(){originalReset();refreshPicker()};
 const originalFill=fill;fill=function(d){originalFill(d);refreshPicker()};
 window.openSavedPointEditor=function(){
  const defaults={condition:'',priority:'Média',status:'Pendente'};
  const pending=editing!==null||photos.length||itemKeys.some(k=>{const el=$(k);if(!el)return false;const value=el.value.trim();if(!value)return false;if(el.tagName==='SELECT')return value!==(el.querySelector('option[selected]')||el.options[0])?.value;return value!==(defaults[k]||'')});
  if(!pending&&records.length)openPoint(0);
  refreshPicker();
 };
 refreshPicker();
})();
