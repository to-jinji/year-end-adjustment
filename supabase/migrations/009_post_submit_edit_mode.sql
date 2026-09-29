-- v0.9.0 提出後は明示的に「内容を修正する」を押した場合のみ編集可能にする

alter table public.staff_assignments
  add column if not exists post_submit_editing boolean not null default false;

-- 既存の提出済みデータは通常モード（編集不可）へ揃える。
update public.staff_assignments
set post_submit_editing=false
where status in ('提出済み','確認中');

create or replace function private.can_edit_assignment(p_assignment_id uuid)
returns boolean
language sql
security definer
set search_path=''
stable
as $$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.year_settings ys on ys.year = sa.year
    where sa.id = p_assignment_id
      and sa.auth_user_id = (select auth.uid())
      and now() <= coalesce(sa.editable_until_override, ys.default_editable_until)
      and (
        sa.status in ('入力中','修正依頼')
        or (sa.status in ('提出済み','確認中') and sa.post_submit_editing=true)
      )
  );
$$;
revoke execute on function private.can_edit_assignment(uuid) from public;
grant execute on function private.can_edit_assignment(uuid) to authenticated;

create or replace function public.staff_begin_post_submit_edit(p_assignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_deadline timestamptz;
begin
  select coalesce(sa.editable_until_override,ys.default_editable_until)
  into v_deadline
  from public.staff_assignments sa
  join public.year_settings ys on ys.year=sa.year
  where sa.id=p_assignment_id
    and sa.auth_user_id=(select auth.uid())
    and sa.status in ('提出済み','確認中');

  if not found then
    raise exception '提出済みの年末調整が見つかりません';
  end if;
  if v_deadline is null or now()>v_deadline then
    raise exception '編集期限を過ぎています';
  end if;

  update public.staff_assignments
  set post_submit_editing=true, updated_at=now()
  where id=p_assignment_id and auth_user_id=(select auth.uid());

  return true;
end;
$$;
revoke execute on function public.staff_begin_post_submit_edit(uuid) from public, anon;
grant execute on function public.staff_begin_post_submit_edit(uuid) to authenticated;

create or replace function public.staff_submit_year_adjustment(p_assignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count int;
  v_docs jsonb;
  v_missing int;
  v_previous_submitted_at timestamptz;
begin
  if not private.can_edit_assignment(p_assignment_id) then
    raise exception '現在は提出できません';
  end if;

  select sa.submitted_at into v_previous_submitted_at
  from public.staff_assignments sa
  where sa.id=p_assignment_id
    and sa.auth_user_id=(select auth.uid());

  if not found then
    return false;
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
  set status='提出済み', submitted_at=now(), post_submit_editing=false, updated_at=now()
  where id=p_assignment_id and auth_user_id=(select auth.uid());

  if v_previous_submitted_at is not null then
    insert into public.staff_correction_requests(
      staff_assignment_id, section_key, current_content, requested_content, status
    ) values (
      p_assignment_id,
      'other',
      '',
      'スタッフが提出後に内容を修正し、再提出しました。',
      'pending'
    );
  end if;

  return true;
end;
$$;
revoke execute on function public.staff_submit_year_adjustment(uuid) from public, anon;
grant execute on function public.staff_submit_year_adjustment(uuid) to authenticated;
