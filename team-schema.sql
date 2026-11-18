-- Migration draft. Apply only after configuring a private server-side database.
-- Google identity must be verified by the server; never trust an email from the request body.
create table if not exists public.vistoria_members (
 google_subject text primary key,
 email text not null,
 role text not null default 'technician' check (role in ('admin','technician')),
 status text not null default 'pending' check (status in ('pending','approved','blocked')),
 requested_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by text references public.vistoria_members(google_subject)
);
create table if not exists public.vistoria_report_index (
 report_id text primary key,
 owner_subject text not null references public.vistoria_members(google_subject),
 drive_file_id text unique,
 revision bigint not null default 0,
 deleted_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.vistoria_audit (
 id bigint generated always as identity primary key,
 actor_subject text not null references public.vistoria_members(google_subject),
 report_id text references public.vistoria_report_index(report_id),
 action text not null check (action in ('request','approve','block','create','update','delete','restore')),
 occurred_at timestamptz not null default now(),
 revision bigint
);
alter table public.vistoria_members enable row level security;
alter table public.vistoria_report_index enable row level security;
alter table public.vistoria_audit enable row level security;
revoke all on public.vistoria_members, public.vistoria_report_index, public.vistoria_audit from anon, authenticated;
-- No direct client access. All operations require server-side verified Google identity.
-- Keep Drive files private to the server identity, not shared as editors with technicians.

alter table public.vistoria_audit add column if not exists drive_file_id text;
create table if not exists public.vistoria_upload_parts (owner_subject text not null references public.vistoria_members(google_subject), report_id text not null, upload_id uuid not null, part integer not null check(part between 0 and 15), payload text not null check(octet_length(payload)<=1100000), created_at timestamptz not null default now(), primary key(owner_subject,report_id,upload_id,part));
alter table public.vistoria_upload_parts enable row level security;
revoke all on public.vistoria_upload_parts from anon, authenticated;
