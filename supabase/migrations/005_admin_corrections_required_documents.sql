-- v0.5.0: 管理者による回答修正履歴・必要書類の必須判定

create table if not exists public.staff_admin_changes (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  admin_user_id uuid not null,
  section_key text not null check (section_key in ('basic','income','spouse_dependents','insurance','previous_employment','housing_loan')),
  summary text not null,
  changed_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_admin_changes_assignment_created_idx
  on public.staff_admin_changes(staff_assignment_id, created_at desc);

alter table public.staff_admin_changes enable row level security;
revoke all on public.staff_admin_changes from anon, authenticated;
grant select on public.staff_admin_changes to authenticated;

create policy "staff or admin read admin changes"
on public.staff_admin_changes for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.staff_assignments sa
    where sa.id = staff_admin_changes.staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);

-- 必要書類の要件と登録状況をJSONで返す。
create or replace function public.staff_required_documents(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_is_owner boolean;
  v_is_admin boolean;
  v_prev integer := 0;
  v_life integer := 0;
  v_quake integer := 0;
  v_social integer := 0;
  v_small integer := 0;
  v_housing integer := 0;
  v_result jsonb := '[]'::jsonb;
  v_required integer;
  v_uploaded integer;
begin
  select exists(select 1 from public.admin_users au where au.auth_user_id=(select auth.uid())) into v_is_admin;
  select exists(select 1 from public.staff_assignments sa where sa.id=p_assignment_id and sa.auth_user_id=(select auth.uid())) into v_is_owner;
  if not (v_is_admin or v_is_owner) then
    raise exception '権限がありません';
  end if;

  select case when coalesce(s.has_previous_employment,false) then count(pe.id)::int else 0 end
    into v_prev
  from public.staff_previous_employment_summary s
  left join public.staff_previous_employments pe on pe.staff_assignment_id=s.staff_assignment_id
  where s.staff_assignment_id=p_assignment_id
  group by s.has_previous_employment;
  v_prev := coalesce(v_prev,0);

  select count(*)::int into v_life
  from public.staff_insurance_entries
  where staff_assignment_id=p_assignment_id
    and insurance_type in ('新生命保険料（一般）','旧生命保険料（一般）','介護医療保険料','新個人年金保険料','旧個人年金保険料');

  select count(*)::int into v_quake
  from public.staff_insurance_entries
  where staff_assignment_id=p_assignment_id
    and insurance_type in ('地震保険料','旧長期損害保険料');

  select count(*)::int into v_social
  from public.staff_insurance_entries
  where staff_assignment_id=p_assignment_id and insurance_type='社会保険料';

  select count(*)::int into v_small
  from public.staff_insurance_entries
  where staff_assignment_id=p_assignment_id and insurance_type='小規模企業共済等掛金';

  select case when coalesce(has_housing_loan,false) then 1 else 0 end
    into v_housing
  from public.staff_housing_loan_info
  where staff_assignment_id=p_assignment_id;
  v_housing := coalesce(v_housing,0);

  -- 必要書類ごとの必要数・登録数を返す。
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', q.category,
    'required_count', q.required_count,
    'uploaded_count', q.uploaded_count,
    'complete', q.uploaded_count >= q.required_count
  ) order by q.ord), '[]'::jsonb)
  into v_result
  from (
    select 1 ord, '前職の源泉徴収票' category, v_prev required_count,
      (select count(*)::int from public.staff_documents d where d.staff_assignment_id=p_assignment_id and d.category='前職の源泉徴収票') uploaded_count
    union all
    select 2, '生命保険料控除証明書', v_life,
      (select count(*)::int from public.staff_documents d where d.staff_assignment_id=p_assignment_id and d.category='生命保険料控除証明書')
    union all
    select 3, '地震保険料控除証明書', v_quake,
      (select count(*)::int from public.staff_documents d where d.staff_assignment_id=p_assignment_id and d.category='地震保険料控除証明書')
    union all
    select 4, '社会保険料控除関係書類', v_social,
      (select count(*)::int from public.staff_documents d where d.staff_assignment_id=p_assignment_id and d.category='社会保険料控除関係書類')
    union all
    select 5, '小規模企業共済等掛金払込証明書', v_small,
      (select count(*)::int from public.staff_documents d where d.staff_assignment_id=p_assignment_id and d.category='小規模企業共済等掛金払込証明書')
    union all
    select 6, '住宅借入金等特別控除関係書類', v_housing,
      (select count(*)::int from public.staff_documents d where d.staff_assignment_id=p_assignment_id and d.category='住宅借入金等特別控除関係書類')
  ) q
  where q.required_count > 0;

  return v_result;
end;
$$;
revoke execute on function public.staff_required_documents(uuid) from public, anon;
grant execute on function public.staff_required_documents(uuid) to authenticated;

-- 提出時にも必須書類をサーバー側で検証する。
create or replace function public.staff_submit_year_adjustment(p_assignment_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_count int;
  v_docs jsonb;
  v_missing int;
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

  v_docs := public.staff_required_documents(p_assignment_id);
  select count(*) into v_missing
  from jsonb_array_elements(v_docs) x
  where coalesce((x->>'complete')::boolean,false)=false;
  if v_missing > 0 then
    raise exception '必須の添付書類が不足しています';
  end if;

  update public.staff_assignments
  set status='提出済み', submitted_at=now(), updated_at=now()
  where id=p_assignment_id and auth_user_id=(select auth.uid());
  return found;
end;
$$;
revoke execute on function public.staff_submit_year_adjustment(uuid) from public, anon;
grant execute on function public.staff_submit_year_adjustment(uuid) to authenticated;
