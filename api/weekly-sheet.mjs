export function createHandler({getId=()=>process.env.VISTORIA_WEEKLY_SHEET_ID}={}){
 return function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).send('Método não permitido.')}
  const id=String(getId()||'').trim();
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))return res.status(503).send('Planilha de apontamento não configurada. Volte ao aplicativo e informe o responsável.');
  res.setHeader('Location','https://docs.google.com/spreadsheets/d/'+id+'/edit');
  return res.status(302).end();
 }
}
export default createHandler();
