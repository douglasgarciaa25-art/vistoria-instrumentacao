const DB='https://qwfsvyqyxpraulmwkfdb.supabase.co/rest/v1/';
export async function teamDb(path, options={}){
 const key=process.env.my_super_base_secrety_key133 || process.env.SUPABASE_SECRET_KEY;
 if(!key)throw new Error('Banco da equipe não configurado');
 const res=await fetch(DB+path,{...options,headers:{apikey:key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error('Falha no banco da equipe: '+res.status);
 return res.status===204?null:res.json();
}
export async function googleIdentity(req){
 const token=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._~-]+)$/i)?.[1];
 if(!token)return null;
 const r=await fetch('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(token),{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!r.ok)return null;
 const i=await r.json();
 if(!process.env.VISTORIA_GOOGLE_CLIENT_ID||i.aud!==process.env.VISTORIA_GOOGLE_CLIENT_ID||!(i.email_verified===true||i.email_verified==='true')||!i.sub||!i.email)return null;
 return {subject:String(i.sub),email:String(i.email).trim().toLowerCase()};
}
export async function memberFor(identity){
 const rows=await teamDb('vistoria_members?google_subject=eq.'+encodeURIComponent(identity.subject)+'&select=google_subject,email,role,status');
 return rows[0]||null;
}
export async function approvedMember(req){
 const identity=await googleIdentity(req);
 if(!identity)return null;
 const member=await memberFor(identity);
 return member?.status==='approved'?member:null;
}
