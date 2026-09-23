create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  staff_id char(4) not null unique check (staff_id ~ '^[0-9]{4}$'),
  display_name text not null,
  birth_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  year int not null,
  status text not null default '未登録' check (status in ('未登録','入力中','提出済み','確認中','修正依頼','完了')),
  password_set boolean not null default false,
  editable_until timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staff_member_id, year)
);

create table if not exists public.staff_verification_tokens (
  token_hash text primary key,
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_auth_limits (
  staff_id char(4) primary key check (staff_id ~ '^[0-9]{4}$'),
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.staff_verification_tokens enable row level security;
alter table public.staff_auth_limits enable row level security;

revoke all on public.admin_users, public.staff_members, public.staff_assignments, public.staff_verification_tokens, public.staff_auth_limits from anon, authenticated;
grant select on public.admin_users to authenticated;
grant select on public.staff_members to authenticated;
grant select on public.staff_assignments to authenticated;

create or replace function private.is_admin() returns boolean language sql security definer set search_path='' stable as $$
 select exists(select 1 from public.admin_users a where a.auth_user_id=(select auth.uid()));
$$;
revoke execute on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create policy "admin read admin_users" on public.admin_users for select to authenticated using ((select private.is_admin()));
create policy "admin read staff_members" on public.staff_members for select to authenticated using ((select private.is_admin()));
create policy "staff read self member" on public.staff_members for select to authenticated using (exists(select 1 from public.staff_assignments sa where sa.staff_member_id=staff_members.id and sa.auth_user_id=(select auth.uid())));
create policy "admin read assignments" on public.staff_assignments for select to authenticated using ((select private.is_admin()));
create policy "staff read self assignment" on public.staff_assignments for select to authenticated using (auth_user_id=(select auth.uid()));

create or replace function public.admin_register_staff(p_staff_id text,p_display_name text,p_birth_date date,p_year int,p_editable_until timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_staff uuid; v_assignment uuid;
begin
 if not private.is_admin() then raise exception 'admin only'; end if;
 if p_staff_id !~ '^[0-9]{4}$' then raise exception 'staff id must be 4 digits'; end if;
 insert into public.staff_members(staff_id,display_name,birth_date) values(p_staff_id,p_display_name,p_birth_date)
 on conflict(staff_id) do update set display_name=excluded.display_name,birth_date=excluded.birth_date,updated_at=now()
 returning id into v_staff;
 insert into public.staff_assignments(staff_member_id,year,editable_until) values(v_staff,p_year,p_editable_until)
 on conflict(staff_member_id,year) do update set editable_until=excluded.editable_until,updated_at=now()
 returning id into v_assignment;
 return v_assignment;
end$$;
revoke execute on function public.admin_register_staff(text,text,date,int,timestamptz) from public,anon;
grant execute on function public.admin_register_staff(text,text,date,int,timestamptz) to authenticated;

-- Birth dates are never exposed to anon clients. Verification is performed only in the Edge Function using the service role.
