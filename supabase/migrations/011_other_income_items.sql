-- v0.10.0: 給与以外の所得を種類別に複数登録

create table if not exists public.staff_other_income_items (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  income_type text not null check (
    income_type in (
      '事業所得','雑所得','配当所得','不動産所得',
      '一時所得','譲渡所得','退職所得','その他'
    )
  ),
  amount bigint not null default 0 check (amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_other_income_items_assignment_idx
  on public.staff_other_income_items(staff_assignment_id, created_at);

alter table public.staff_other_income_items enable row level security;

revoke all on public.staff_other_income_items from anon, authenticated;
grant select, insert, update, delete on public.staff_other_income_items to authenticated;

drop policy if exists "staff or admin read other income items" on public.staff_other_income_items;
create policy "staff or admin read other income items"
on public.staff_other_income_items for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.staff_assignments sa
    where sa.id = staff_other_income_items.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "staff or admin insert other income items" on public.staff_other_income_items;
create policy "staff or admin insert other income items"
on public.staff_other_income_items for insert to authenticated
with check (
  (select private.is_admin())
  or private.can_edit_assignment(staff_assignment_id)
);

drop policy if exists "staff or admin update other income items" on public.staff_other_income_items;
create policy "staff or admin update other income items"
on public.staff_other_income_items for update to authenticated
using (
  (select private.is_admin())
  or private.can_edit_assignment(staff_assignment_id)
)
with check (
  (select private.is_admin())
  or private.can_edit_assignment(staff_assignment_id)
);

drop policy if exists "staff or admin delete other income items" on public.staff_other_income_items;
create policy "staff or admin delete other income items"
on public.staff_other_income_items for delete to authenticated
using (
  (select private.is_admin())
  or private.can_edit_assignment(staff_assignment_id)
);

-- 既存の「給与以外の所得合計」がある場合は「その他」として1件移行。
insert into public.staff_other_income_items (
  staff_assignment_id, income_type, amount, note
)
select
  sii.staff_assignment_id,
  'その他',
  sii.other_income,
  '旧入力欄から移行'
from public.staff_income_info sii
where coalesce(sii.other_income,0) > 0
  and not exists (
    select 1 from public.staff_other_income_items oi
    where oi.staff_assignment_id = sii.staff_assignment_id
  );
