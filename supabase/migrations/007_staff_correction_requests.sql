-- v0.7.0 スタッフからの修正依頼ワークフロー

create table if not exists public.staff_correction_requests (
  id uuid primary key default gen_random_uuid(),
  staff_assignment_id uuid not null references public.staff_assignments(id) on delete cascade,
  section_key text not null check (section_key in ('basic','income','spouse_dependents','insurance','previous_employment','housing_loan','documents','other')),
  current_content text not null,
  requested_content text not null,
  status text not null default 'pending' check (status in ('pending','approved','completed','rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists staff_correction_requests_assignment_idx
  on public.staff_correction_requests(staff_assignment_id, requested_at desc);
create index if not exists staff_correction_requests_status_idx
  on public.staff_correction_requests(status, requested_at desc);

alter table public.staff_correction_requests enable row level security;

-- 直接の書き込みは許可せず、下記RPC経由に限定する。
revoke insert, update, delete on public.staff_correction_requests from anon, authenticated;
grant select on public.staff_correction_requests to authenticated;

drop policy if exists "staff can read own correction requests" on public.staff_correction_requests;
create policy "staff can read own correction requests"
on public.staff_correction_requests for select to authenticated
using (
  exists (
    select 1 from public.staff_assignments sa
    where sa.id = staff_assignment_id
      and sa.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "admin can read correction requests" on public.staff_correction_requests;
create policy "admin can read correction requests"
on public.staff_correction_requests for select to authenticated
using (private.is_admin());

create or replace function public.staff_create_correction_request(
  p_assignment_id uuid,
  p_section_key text,
  p_current_content text,
  p_requested_content text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_status text;
begin
  select sa.status into v_status
  from public.staff_assignments sa
  where sa.id = p_assignment_id
    and sa.auth_user_id = (select auth.uid());

  if v_status is null then
    raise exception '対象データを確認できません';
  end if;

  if v_status not in ('提出済み','確認中') then
    raise exception '現在の状態では修正依頼を送信できません';
  end if;

  if p_section_key not in ('basic','income','spouse_dependents','insurance','previous_employment','housing_loan','documents','other') then
    raise exception '修正したい項目を選択してください';
  end if;
  if length(trim(coalesce(p_current_content,''))) = 0 then
    raise exception '現在の内容を入力してください';
  end if;
  if length(trim(coalesce(p_requested_content,''))) = 0 then
    raise exception '修正後の内容を入力してください';
  end if;
  if length(p_current_content) > 2000 or length(p_requested_content) > 2000 then
    raise exception '入力内容が長すぎます';
  end if;

  insert into public.staff_correction_requests(
    staff_assignment_id, section_key, current_content, requested_content
  ) values (
    p_assignment_id, p_section_key, trim(p_current_content), trim(p_requested_content)
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.staff_create_correction_request(uuid,text,text,text) from public, anon;
grant execute on function public.staff_create_correction_request(uuid,text,text,text) to authenticated;

create or replace function public.admin_approve_correction_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment_id uuid;
begin
  if not private.is_admin() then
    raise exception 'admin only';
  end if;

  update public.staff_correction_requests
  set status='approved', approved_at=now(), approved_by=(select auth.uid()), updated_at=now()
  where id=p_request_id and status='pending'
  returning staff_assignment_id into v_assignment_id;

  if v_assignment_id is null then
    raise exception '対象の修正依頼が見つからないか、すでに処理されています';
  end if;

  update public.staff_assignments
  set status='修正依頼', updated_at=now()
  where id=v_assignment_id;

  return true;
end;
$$;
revoke execute on function public.admin_approve_correction_request(uuid) from public, anon;
grant execute on function public.admin_approve_correction_request(uuid) to authenticated;

-- 再提出時に、承認済みの修正依頼を完了扱いにする。
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

  if not found then
    return false;
  end if;

  update public.staff_correction_requests
  set status='completed', updated_at=now()
  where staff_assignment_id=p_assignment_id and status='approved';

  return true;
end;
$$;
revoke execute on function public.staff_submit_year_adjustment(uuid) from public, anon;
grant execute on function public.staff_submit_year_adjustment(uuid) to authenticated;
