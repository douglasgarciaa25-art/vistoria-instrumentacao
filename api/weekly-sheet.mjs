export function createHandler({getId=()=>process.env.VISTORIA_WEEKLY_SHEET_ID,googleFetch=fetch}={}){
return async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
 const match=String(req.headers.authorization||'').match(/^Bearer ([^\s]+)$/i);
 if(!match)return res.status(401).json({error:'Autorização necessária'});
 const id=String(getId()||'').trim();
 if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))return res.status(503).json({error:'Planilha não configurada'});
 try{
  const check=await googleFetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id)+'?fields=spreadsheetId',{headers:{Authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(10000)});
  if(!check.ok)return res.status(check.status===401?401:check.status===403||check.status===404?403:502).json({error:'Não foi possível autorizar a planilha'});
  const data=await check.json();
  if(data.spreadsheetId!==id)return res.status(502).json({error:'Resposta inesperada'});
  return res.status(200).json({id});
 }catch{return res.status(502).json({error:'Google indisponível'})}
}}
export default createHandler();
