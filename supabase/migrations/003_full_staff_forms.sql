-- v0.3.0: スタッフ入力画面一式・提出・書類アップロード

create table if not exists public.staff_section_progress (
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  section_key text not null check (section_key in ('basic','income','spouse_dependents','insurance','previous_employment','housing_loan','documents')),
  completed_at timestamptz not null default now(),
  primary key (staff_assignment_id, section_key)
);


create table if not exists public.staff_income_info (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  other_salary_income bigint not null default 0 check (other_salary_income >= 0),
  other_income bigint not null default 0 check (other_income >= 0),
  disability_category text not null default 'なし' check (disability_category in ('なし','一般障害者','特別障害者')),
  widow_single_parent text not null default 'なし' check (widow_single_parent in ('なし','寡婦','ひとり親')),
  working_student boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_housing_loan_info (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  has_housing_loan boolean not null default false,
  first_year boolean not null default false,
  move_in_date date,
  year_end_balance bigint not null default 0 check (year_end_balance >= 0),
  joint_debt_ratio numeric(5,2),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_spouse_info (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  has_spouse boolean not null default false,
  spouse_name text not null default '',
  spouse_name_kana text not null default '',
  birth_date date,
  estimated_income bigint not null default 0 check (estimated_income >= 0),
  living_together boolean not null default false,
  address text not null default '',
  nonresident boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_dependents (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  name text not null,
  name_kana text not null default '',
  birth_date date not null,
  relationship text not null,
  estimated_income bigint not null default 0 check (estimated_income >= 0),
  living_together boolean not null default true,
  address text not null default '',
  nonresident boolean not null default false,
  disability_category text not null default 'なし' check (disability_category in ('なし','一般障害者','特別障害者')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_insurance_entries (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  insurance_type text not null,
  company_name text not null,
  policyholder_name text not null,
  beneficiary_name text not null default '',
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_previous_employment_summary (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  has_previous_employment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_previous_employments (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  employer_name text not null,
  retirement_date date,
  payment_amount bigint not null default 0 check (payment_amount >= 0),
  withholding_tax bigint not null default 0 check (withholding_tax >= 0),
  social_insurance bigint not null default 0 check (social_insurance >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  category text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.staff_section_progress enable row level security;
alter table public.staff_income_info enable row level security;
alter table public.staff_housing_loan_info enable row level security;
alter table public.staff_spouse_info enable row level security;
alter table public.staff_dependents enable row level security;
alter table public.staff_insurance_entries enable row level security;
alter table public.staff_previous_employment_summary enable row level security;
alter table public.staff_previous_employments enable row level security;
alter table public.staff_documents enable row level security;

revoke all on public.staff_section_progress, public.staff_income_info, public.staff_housing_loan_info, public.staff_spouse_info, public.staff_dependents,
  public.staff_insurance_entries, public.staff_previous_employment_summary,
  public.staff_previous_employments, public.staff_documents from anon, authenticated;

grant select, insert, update, delete on public.staff_section_progress to authenticated;
grant select, insert, update on public.staff_income_info to authenticated;
grant select, insert, update on public.staff_housing_loan_info to authenticated;
grant select, insert, update on public.staff_spouse_info to authenticated;
grant select, insert, update, delete on public.staff_dependents to authenticated;
grant select, insert, update, delete on public.staff_insurance_entries to authenticated;
grant select, insert, update on public.staff_previous_employment_summary to authenticated;
grant select, insert, update, delete on public.staff_previous_employments to authenticated;
grant select, insert, delete on public.staff_documents to authenticated;

-- 自分自身の割当かつ編集可能かを共通判定
create or replace function private.can_edit_assignment(p_assignment_id uuid)
returns boolean language sql security definer set search_path='' stable as $$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.year_settings ys on ys.year = sa.year
    where sa.id = p_assignment_id
      and sa.auth_user_id = (select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and sa.status in ('入力中','修正依頼')
  );
$$;
revoke execute on function private.can_edit_assignment(uuid) from public;
grant execute on function private.can_edit_assignment(uuid) to authenticated;

-- SELECT: 本人または管理者
create policy "read own progress or admin" on public.staff_section_progress for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_section_progress.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own income or admin" on public.staff_income_info for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_income_info.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own housing loan or admin" on public.staff_housing_loan_info for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_housing_loan_info.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own spouse or admin" on public.staff_spouse_info for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_spouse_info.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own dependents or admin" on public.staff_dependents for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_dependents.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own insurance or admin" on public.staff_insurance_entries for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_insurance_entries.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own previous summary or admin" on public.staff_previous_employment_summary for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_previous_employment_summary.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own previous or admin" on public.staff_previous_employments for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_previous_employments.staff_assignment_id and sa.auth_user_id=(select auth.uid())));
create policy "read own documents or admin" on public.staff_documents for select to authenticated
using ((select private.is_admin()) or exists(select 1 from public.staff_assignments sa where sa.id=staff_documents.staff_assignment_id and sa.auth_user_id=(select auth.uid())));

-- INSERT/UPDATE/DELETE: 編集可能な本人のみ
create policy "edit own progress insert" on public.staff_section_progress for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own progress update" on public.staff_section_progress for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own progress delete" on public.staff_section_progress for delete to authenticated using ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own income insert" on public.staff_income_info for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own income update" on public.staff_income_info for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own housing loan insert" on public.staff_housing_loan_info for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own housing loan update" on public.staff_housing_loan_info for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own spouse insert" on public.staff_spouse_info for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own spouse update" on public.staff_spouse_info for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own dependents insert" on public.staff_dependents for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own dependents update" on public.staff_dependents for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own dependents delete" on public.staff_dependents for delete to authenticated using ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own insurance insert" on public.staff_insurance_entries for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own insurance update" on public.staff_insurance_entries for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own insurance delete" on public.staff_insurance_entries for delete to authenticated using ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own previous summary insert" on public.staff_previous_employment_summary for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own previous summary update" on public.staff_previous_employment_summary for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own previous insert" on public.staff_previous_employments for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own previous update" on public.staff_previous_employments for update to authenticated using ((select private.can_edit_assignment(staff_assignment_id))) with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own previous delete" on public.staff_previous_employments for delete to authenticated using ((select private.can_edit_assignment(staff_assignment_id)));

create policy "edit own documents insert" on public.staff_documents for insert to authenticated with check ((select private.can_edit_assignment(staff_assignment_id)));
create policy "edit own documents delete" on public.staff_documents for delete to authenticated using ((select private.can_edit_assignment(staff_assignment_id)));

-- 提出処理。全セクション完了済みの場合のみ提出済みに変更
create or replace function public.staff_submit_year_adjustment(p_assignment_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_count int;
begin
  if not private.can_edit_assignment(p_assignment_id) then
    raise exception '現在は提出できません';
  end if;
  select count(*) into v_count
  from public.staff_section_progress
  where staff_assignment_id = p_assignment_id
    and section_key in ('basic','income','spouse_dependents','insurance','previous_employment','housing_loan','documents');
  if v_count <> 7 then
    raise exception '未完了の入力項目があります';
  end if;
  update public.staff_assignments
  set status='提出済み', submitted_at=now(), updated_at=now()
  where id=p_assignment_id and auth_user_id=(select auth.uid());
  return found;
end;
$$;
revoke execute on function public.staff_submit_year_adjustment(uuid) from public, anon;
grant execute on function public.staff_submit_year_adjustment(uuid) to authenticated;

-- Private Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'year-end-adjustment-documents',
  'year-end-adjustment-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/heic','image/heif']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Storage RLS: path must be <assignment_uuid>/<file>
create policy "staff upload own year end docs"
on storage.objects for insert to authenticated
with check (
  bucket_id='year-end-adjustment-documents'
  and exists (
    select 1 from public.staff_assignments sa
    join public.year_settings ys on ys.year=sa.year
    where sa.id::text=(storage.foldername(name))[1]
      and sa.auth_user_id=(select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and sa.status in ('入力中','修正依頼')
  )
);

create policy "staff or admin read year end docs"
on storage.objects for select to authenticated
using (
  bucket_id='year-end-adjustment-documents'
  and (
    (select private.is_admin())
    or exists (
      select 1 from public.staff_assignments sa
      where sa.id::text=(storage.foldername(name))[1]
        and sa.auth_user_id=(select auth.uid())
    )
  )
);

create policy "staff delete own year end docs"
on storage.objects for delete to authenticated
using (
  bucket_id='year-end-adjustment-documents'
  and exists (
    select 1 from public.staff_assignments sa
    join public.year_settings ys on ys.year=sa.year
    where sa.id::text=(storage.foldername(name))[1]
      and sa.auth_user_id=(select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and sa.status in ('入力中','修正依頼')
  )
);
