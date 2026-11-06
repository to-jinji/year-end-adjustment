-- v0.12.0: 扶養控除等申告書の確認履歴
-- 申告内容自体は既存の basic / income / spouse / dependents を直接使用し、二重保存しない。

create table if not exists public.staff_fuyou_declaration_confirmations (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_fuyou_declaration_confirmations enable row level security;

revoke all on public.staff_fuyou_declaration_confirmations from anon, authenticated;
grant select, insert, update on public.staff_fuyou_declaration_confirmations to authenticated;

drop policy if exists "read own fuyou confirmation or admin" on public.staff_fuyou_declaration_confirmations;
create policy "read own fuyou confirmation or admin"
on public.staff_fuyou_declaration_confirmations for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.staff_assignments sa
    where sa.id = staff_fuyou_declaration_confirmations.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "insert own fuyou confirmation" on public.staff_fuyou_declaration_confirmations;
create policy "insert own fuyou confirmation"
on public.staff_fuyou_declaration_confirmations for insert to authenticated
with check (
  exists (
    select 1
    from public.staff_assignments sa
    where sa.id = staff_fuyou_declaration_confirmations.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "update own fuyou confirmation" on public.staff_fuyou_declaration_confirmations;
create policy "update own fuyou confirmation"
on public.staff_fuyou_declaration_confirmations for update to authenticated
using (
  exists (
    select 1
    from public.staff_assignments sa
    where sa.id = staff_fuyou_declaration_confirmations.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.staff_assignments sa
    where sa.id = staff_fuyou_declaration_confirmations.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);
