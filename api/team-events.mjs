import {approvedMember} from '../team-auth.mjs';
// Only a generic notification leaves the server. Database credentials and rows
// stay on the server. The normal authenticated sync API fetches actual revisions.
export const config={maxDuration:60};
const TOPIC='realtime:vistoria-private-index';
export function indexEvent(message,joined){
 if(message?.topic!==TOPIC)return null;
 if(message.event==='phx_reply'&&message.ref==='join'){
  const response=message.payload?.response;
  return message.payload?.status==='ok'&&Array.isArray(response?.postgres_changes)&&response.postgres_changes.some(c=>c.schema==='public'&&c.table==='vistoria_report_index')?'ready':'error';
 }
 if(message.event==='phx_error'||message.event==='phx_close'||(message.event==='system'&&message.payload?.status==='error'))return 'error';
 if(joined&&message.event==='postgres_changes'&&message.payload?.data?.schema==='public'&&message.payload?.data?.table==='vistoria_report_index')return 'change';
 return null;
}
export async function serveTeamEvents(req,res,{authorize=approvedMember,Socket=globalThis.WebSocket,key=process.env.my_super_base_secrety_key133||process.env.SUPABASE_SECRET_KEY,limit=30000}={}){
 res.setHeader('Cache-Control','private, no-store, no-transform');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
 let member;
 try{member=await authorize(req)}catch{return res.status(503).end()}
 if(!member||member.status!=='approved')return res.status(403).end();
 if(!key||typeof Socket!=='function')return res.status(503).end();
 // New opaque API keys are sent only in the server-to-server URL; legacy JWTs
 // may also be supplied in the channel join message. Never log this URL.
 const url=new URL('wss://qwfsvyqyxpraulmwkfdb.supabase.co/realtime/v1/websocket');
 url.searchParams.set('apikey',key);url.searchParams.set('vsn','1.0.0');
 let socket;
 try{socket=new Socket(url.toString())}catch{return res.status(503).end()}
 res.statusCode=200;res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 res.flushHeaders?.();
 await new Promise(resolve=>{
  let ended=false,joined=false,heartbeat=null,deadline=null,joinTimeout=null;
  const finish=()=>{if(ended)return;ended=true;clearTimeout(deadline);clearTimeout(joinTimeout);clearInterval(heartbeat);try{socket.close()}catch{}if(!res.writableEnded&&!res.destroyed)res.end();resolve()};
  const write=type=>{if(ended||res.destroyed||res.writableEnded)return false;try{return res.write(JSON.stringify({type})+'\n')}catch{finish();return false}};
  const send=message=>{try{socket.send(JSON.stringify(message))}catch{finish()}};
  res.once('close',finish);
  socket.addEventListener('open',()=>{
   if(ended)return;
   const payload={config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:'*',schema:'public',table:'vistoria_report_index'}],private:false}};
   if(!key.startsWith('sb_'))payload.access_token=key;
   send({topic:TOPIC,event:'phx_join',payload,ref:'join'});
  });
  socket.addEventListener('message',event=>{
   if(ended)return;
   let packet;try{packet=JSON.parse(event.data)}catch{return}
   const type=indexEvent(packet,joined);
   if(type==='error'){finish();return}
   if(type==='ready'&&!joined){joined=true;clearTimeout(joinTimeout);write('ready');}
   if(type==='change')write('change');
  });
  socket.addEventListener('error',finish);socket.addEventListener('close',finish);
  write('connecting');
  joinTimeout=setTimeout(()=>{if(!joined)finish()},7000);
  heartbeat=setInterval(()=>{if(joined){send({topic:'phoenix',event:'heartbeat',payload:{},ref:'heartbeat'});write('ping')}},15000);
  deadline=setTimeout(finish,limit);
 });
}
export default function handler(req,res){return serveTeamEvents(req,res)}
