-- Vistoria Técnica: preautorização por e-mail, sem acesso direto do navegador.
create table if not exists public.vistoria_email_invitations (
 email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 254),
 authorized_by text not null references public.vistoria_members(google_subject),
 authorized_at timestamptz not null default now()
);
alter table public.vistoria_email_invitations enable row level security;
revoke all on public.vistoria_email_invitations from public, anon, authenticated;
grant select, insert, delete on public.vistoria_email_invitations to service_role;

create or replace function public.vistoria_manage_email_access(p_action text, p_email text, p_subject text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_email text := lower(btrim(p_email));
 v_member public.vistoria_members%rowtype;
 v_invite public.vistoria_email_invitations%rowtype;
 v_count bigint;
begin
 if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_subject is null or p_subject='' then
  return jsonb_build_object('state','invalid');
 end if;
 if p_action in ('authorize','cancel') and not exists (
  select 1 from public.vistoria_members where google_subject=p_subject and role='admin' and status='approved'
 ) then return jsonb_build_object('state','forbidden'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vistoria-invite:'||v_email,0));
 if p_action='cancel' then
  delete from public.vistoria_email_invitations where email=v_email;
  return jsonb_build_object('state','cancelled');
 elsif p_action='authorize' then
  select count(*) into v_count from public.vistoria_members where lower(btrim(email))=v_email;
  if v_count>1 then return jsonb_build_object('state','ambiguous'); end if;
  if v_count=1 then
   select * into v_member from public.vistoria_members where lower(btrim(email))=v_email for update;
   if v_member.role='admin' then return jsonb_build_object('state','admin'); end if;
   update public.vistoria_members set status='approved',decided_at=now(),decided_by=p_subject where google_subject=v_member.google_subject and role='technician';
   delete from public.vistoria_email_invitations where email=v_email;
   return jsonb_build_object('state','approved');
  end if;
  insert into public.vistoria_email_invitations(email,authorized_by) values(v_email,p_subject) on conflict(email) do nothing;
  return jsonb_build_object('state','invited');
 elsif p_action='request' then
  select * into v_member from public.vistoria_members where google_subject=p_subject;
  if found then return jsonb_build_object('state',v_member.status); end if;
  select * into v_invite from public.vistoria_email_invitations where email=v_email for update;
  if found and not exists(select 1 from public.vistoria_members where lower(btrim(email))=v_email) then
   insert into public.vistoria_members(google_subject,email,role,status,decided_at,decided_by)
    values(p_subject,v_email,'technician','approved',now(),v_invite.authorized_by) on conflict(google_subject) do nothing;
   delete from public.vistoria_email_invitations where email=v_email and exists(select 1 from public.vistoria_members where google_subject=p_subject and email=v_email and status='approved');
  else
   insert into public.vistoria_members(google_subject,email,role,status) values(p_subject,v_email,'technician','pending') on conflict(google_subject) do nothing;
  end if;
  select * into v_member from public.vistoria_members where google_subject=p_subject;
  return jsonb_build_object('state',v_member.status);
 end if;
 return jsonb_build_object('state','invalid');
end;
$$;
revoke all on function public.vistoria_manage_email_access(text,text,text) from public, anon, authenticated;
grant execute on function public.vistoria_manage_email_access(text,text,text) to service_role;
