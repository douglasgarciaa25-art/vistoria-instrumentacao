/* Compositor local de relatos: preserva integralmente os fatos escritos pela equipe. */
(function(root){
 'use strict';
 const PARTS=Object.freeze([
  Object.freeze({key:'condition',label:'Condição observada'}),
  Object.freeze({key:'checks',label:'Testes e verificações realizados'}),
  Object.freeze({key:'findings',label:'Resultados confirmados'}),
  Object.freeze({key:'hypothesis',label:'Hipóteses ainda não confirmadas'}),
  Object.freeze({key:'work',label:'Serviços efetivamente executados'}),
  Object.freeze({key:'next',label:'Pendências e próximos passos'})
 ]);
 function clean(value){
  return String(value==null?'':value).trim()
   .replace(/\r\n?/g,'\n')
   .replace(/[ \t]+/g,' ')
   .replace(/\n{3,}/g,'\n\n');
 }
 function compose(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return '';
  return PARTS.map(part=>{
   const value=clean(input[part.key]);
   return value?part.label+': '+value:'';
  }).filter(Boolean).join('\n\n');
 }
 root.VistoriaDescritivo=Object.freeze({PARTS,clean,compose});
})(typeof window!=='undefined'?window:globalThis);
