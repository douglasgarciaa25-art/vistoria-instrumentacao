/* Ordenação acessível das fotos sem alterar legenda, original ou marcações. */
(()=>{
 'use strict';
 const host=$('thumbs'),previousThumbs=thumbs;
 thumbs=function(){
  previousThumbs();
  host.querySelectorAll('[data-caption]').forEach((input,index)=>{
   const back=document.createElement('button'),forward=document.createElement('button');
   for(const [button,direction,title,disabled] of [
    [back,-1,'Foto anterior',index===0],
    [forward,1,'Próxima foto',index===photos.length-1]
   ]){
    button.type='button';button.className='secondary';button.textContent=title;
    button.setAttribute('aria-label',title+' (foto '+(index+1)+')');
    button.dataset.photoMove=String(direction);button.dataset.photoIndex=String(index);
    button.disabled=disabled;
   }
   input.after(back,forward);
  });
 };
 host.addEventListener('click',event=>{
  const target=event.target;
  if(!target?.dataset?.photoMove)return;
  if(busy||historyBusy)return notify('Aguarde o carregamento das fotos ou o salvamento.');
  const from=Number(target.dataset.photoIndex),to=from+Number(target.dataset.photoMove);
  if(!Number.isInteger(from)||from<0||from>=photos.length||!Number.isInteger(to)||to<0||to>=photos.length)return;
  [photos[from],photos[to]]=[photos[to],photos[from]];
  thumbs();save();
 });
 thumbs();
})();
