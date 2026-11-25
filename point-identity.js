/* Identidade permanente dos pontos: preserva a mesma chave após edição e reordenação.
   Relatórios antigos recebem IDs determinísticos por relatório e posição UMA única vez,
   no primeiro carregamento/salvamento; novos registros usam UUID aleatório. */
(()=>{
 'use strict';
 function ensure(list, reportId){
  if(!Array.isArray(list))return list;
  const used=new Set();
  for(let index=0;index<list.length;index++){
   const point=list[index];
   if(!point||typeof point!=='object')continue;
   let id=typeof point.pointId==='string'&&/^[a-zA-Z0-9:_-]{8,}$/.test(point.pointId)?point.pointId:'';
   if(!id||used.has(id)){
    const legacy='legacy:'+String(reportId||'unknown')+':'+(index+1);
    id=used.has(legacy)?crypto.randomUUID():legacy;
    point.pointId=id;
   }
   used.add(id);
  }
  return list;
 }
 const oldData=data;
 data=function(){ensure(records,activeReportId);return oldData()};
 const oldFill=fill;
 fill=function(document){ensure(document?.records,activeReportId);return oldFill(document)};
 const form=$('form'),oldSubmit=form.onsubmit;
 form.onsubmit=function(event){
  ensure(records,activeReportId);
  const index=editing,previousId=index!==null?records[index]?.pointId:null;
  const size=records.length,previousRecord=index!==null?records[index]:null;
  const result=oldSubmit.call(this,event);
  if(index===null&&records.length===size+1){
   if(!records.at(-1).pointId)records.at(-1).pointId=crypto.randomUUID();
  }else if(index!==null&&records[index]&&records[index]!==previousRecord){
   records[index].pointId=previousId||crypto.randomUUID();
  }
  return result;
 };
 window.VistoriaPointIds={ensure};
})();
