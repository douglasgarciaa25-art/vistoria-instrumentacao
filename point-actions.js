/* Explicit deletion in the editor, without requiring valid form fields. */
(()=>{
 function removePoint(index){
  if(busy||historyBusy)return notify('Aguarde a operação atual.');
  if(!records[index])return;
  if(!confirm('Excluir este ponto e suas fotos?'))return;
  records.splice(index,1);
  if(editing===index)reset();else if(editing!==null&&editing>index)editing--;
  render();save();notify('Ponto excluído.');
 }
 const button=document.createElement('button');button.type='button';button.id='deleteEditingPoint';button.className='danger';
 button.textContent='Excluir ponto em edição / descartar novo ponto';$('cancel').after(button);
 button.onclick=()=>{
  if(editing!==null)return removePoint(editing);
  if(busy||historyBusy)return notify('Aguarde a operação atual.');
  if(!confirm('Descartar os campos e fotos do novo ponto ainda não adicionado?'))return;
  reset();render();save();notify('Novo ponto descartado.');
 };
 const previous=$('entries').onclick;
 $('entries').onclick=e=>{const index=e.target.dataset.delete;if(index!==undefined)return removePoint(Number(index));return previous(e)};
})();
