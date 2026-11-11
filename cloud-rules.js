/* Regras compartilhadas entre a API de nuvem e os testes. */
export const CHUNK_SIZE=750000;
export const MAX_PARTS=300;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validUuid(value){return typeof value==='string'&&UUID.test(value)}
export function validPart(value){return typeof value==='string'&&/^(0|[1-9][0-9]{0,2})$/.test(value)&&Number(value)<MAX_PARTS}
export function validPartUpload(part,body){
 return validPart(part)&&typeof body?.chunk==='string'&&body.chunk.length>0&&body.chunk.length<=CHUNK_SIZE;
}
export function validSyncCommit(body){
 return !!body&&validUuid(body.reportId)&&Array.isArray(body.parents)&&body.parents.length<=100&&
  body.parents.every(validUuid)&&new Set(body.parents).size===body.parents.length&&
  Number.isInteger(body.parts)&&body.parts>=1&&body.parts<=MAX_PARTS&&
  Number.isInteger(body.length)&&body.length>0&&body.length<=MAX_PARTS*CHUNK_SIZE&&
  Math.ceil(body.length/CHUNK_SIZE)===body.parts;
}
export function validBackupCommit(body){
 return !!body&&Number.isInteger(body.parts)&&body.parts>=1&&body.parts<=MAX_PARTS&&
  Number.isInteger(body.count)&&body.count>=1&&body.count<=10000&&
  Number.isInteger(body.length)&&body.length>0&&body.length<=MAX_PARTS*CHUNK_SIZE&&
  Math.ceil(body.length/CHUNK_SIZE)===body.parts;
}
export function validSyncPayload(value){
 if(!value||typeof value.deleted!=='boolean')return false;
 if(value.deleted)return true;
 const doc=value.document;
 return !!doc&&doc.version===1&&!!doc.meta&&typeof doc.meta==='object'&&Array.isArray(doc.records);
}
