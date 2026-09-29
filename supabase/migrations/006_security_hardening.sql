-- v0.6.0 セキュリティ強化

-- スタッフID単位の失敗回数を30分ウィンドウで管理するための開始時刻。
alter table public.staff_auth_limits
  add column if not exists window_started_at timestamptz;

-- IPアドレスは平文保存せず、Edge Function側で不可逆ハッシュ化して保存する。
create table if not exists public.staff_auth_ip_limits (
  ip_hash text primary key,
  failed_count int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.staff_auth_ip_limits enable row level security;
revoke all on public.staff_auth_ip_limits from anon, authenticated;

-- 管理者権限は「admin_usersに登録済み」かつ「現在のJWTがAAL2(MFA済み)」の場合だけ有効。
create or replace function private.is_admin() returns boolean
language sql security definer set search_path='' stable as $$
  select
    coalesce((select auth.jwt()->>'aal'),'aal1') = 'aal2'
    and exists(
      select 1 from public.admin_users a
      where a.auth_user_id=(select auth.uid())
    );
$$;

revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;
