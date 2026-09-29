-- v0.2.0: 共通編集期限・個別期限・基本情報入力

create table if not exists public.year_settings (
  year int primary key,
  default_editable_until timestamptz not null,
  updated_at timestamptz not null default now()
);

insert into public.year_settings(year, default_editable_until)
values (2026, '2026-12-15 00:00:00+09')
on conflict (year) do nothing;

alter table public.staff_assignments
  add column if not exists editable_until_override timestamptz;

create table if not exists public.staff_basic_info (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  name_kana text not null default '',
  postal_code text not null default '',
  address text not null default '',
  household_head_name text not null default '',
  relationship_to_household_head text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.year_settings enable row level security;
alter table public.staff_basic_info enable row level security;

revoke all on public.year_settings, public.staff_basic_info from anon, authenticated;
grant select on public.year_settings to authenticated;
grant select, insert, update on public.staff_basic_info to authenticated;

create policy "authenticated read year settings"
on public.year_settings for select to authenticated
using (true);

create policy "admin read basic info"
on public.staff_basic_info for select to authenticated
using ((select private.is_admin()));

create policy "staff read self basic info"
on public.staff_basic_info for select to authenticated
using (
  exists (
    select 1 from public.staff_assignments sa
    where sa.id = staff_basic_info.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);

create policy "staff insert self basic info"
on public.staff_basic_info for insert to authenticated
with check (
  exists (
    select 1
    from public.staff_assignments sa
    join public.year_settings ys on ys.year = sa.year
    where sa.id = staff_basic_info.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and sa.status in ('入力中','修正依頼')
  )
);

create policy "staff update self basic info"
on public.staff_basic_info for update to authenticated
using (
  exists (
    select 1
    from public.staff_assignments sa
    join public.year_settings ys on ys.year = sa.year
    where sa.id = staff_basic_info.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and sa.status in ('入力中','修正依頼')
  )
)
with check (
  exists (
    select 1
    from public.staff_assignments sa
    join public.year_settings ys on ys.year = sa.year
    where sa.id = staff_basic_info.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and sa.status in ('入力中','修正依頼')
  )
);
