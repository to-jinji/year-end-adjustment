-- v0.8.0 提出後編集・修正通知確認・本人確認ロック解除

-- 編集期限内は提出後もスタッフ本人が修正できるようにする。
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
      and sa.status in ('入力中','提出済み','確認中','修正依頼')
  );
$$;
revoke execute on function private.can_edit_assignment(uuid) from public;
grant execute on function private.can_edit_assignment(uuid) to authenticated;

-- basic_info は初期migrationで独自条件だったため、共通判定へ揃える。
drop policy if exists "staff insert self basic info" on public.staff_basic_info;
create policy "staff insert self basic info"
on public.staff_basic_info for insert to authenticated
with check ((select private.can_edit_assignment(staff_assignment_id)));

drop policy if exists "staff update self basic info" on public.staff_basic_info;
create policy "staff update self basic info"
on public.staff_basic_info for update to authenticated
using ((select private.can_edit_assignment(staff_assignment_id)))
with check ((select private.can_edit_assignment(staff_assignment_id)));

-- 添付書類も同じ編集期限ルールへ統一。
drop policy if exists "staff upload own year end docs" on storage.objects;
create policy "staff upload own year end docs"
on storage.objects for insert to authenticated
with check (
  bucket_id='year-end-adjustment-documents'
  and (select private.can_edit_assignment(((storage.foldername(name))[1])::uuid))
);

drop policy if exists "staff delete own year end docs" on storage.objects;
create policy "staff delete own year end docs"
on storage.objects for delete to authenticated
using (
  bucket_id='year-end-adjustment-documents'
  and (select private.can_edit_assignment(((storage.foldername(name))[1])::uuid))
);

-- 初回提出後に再提出された場合だけ、管理者への「修正あり」通知を自動作成する。
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
  set status='提出済み', submitted_at=now(), updated_at=now()
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

-- 管理者は承認ではなく確認のみ。スタッフの状態は変更しない。
create or replace function public.admin_confirm_correction_notice(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only';
  end if;

  update public.staff_correction_requests
  set status='completed', approved_at=now(), approved_by=(select auth.uid()), updated_at=now()
  where id=p_request_id and status='pending';

  if not found then
    raise exception '対象のお知らせが見つからないか、すでに確認済みです';
  end if;

  return true;
end;
$$;
revoke execute on function public.admin_confirm_correction_notice(uuid) from public, anon;
grant execute on function public.admin_confirm_correction_notice(uuid) to authenticated;

-- スタッフID単位の本人確認ロックを管理者から解除する。
-- IP単位ロックは攻撃対策のため個別解除せず、30分で自動解除する。
create or replace function public.admin_unlock_staff_auth(p_staff_id text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only';
  end if;
  if p_staff_id !~ '^[0-9]{4}$' then
    raise exception 'スタッフIDが不正です';
  end if;

  delete from public.staff_auth_limits where staff_id=p_staff_id;
  return true;
end;
$$;
revoke execute on function public.admin_unlock_staff_auth(text) from public, anon;
grant execute on function public.admin_unlock_staff_auth(text) to authenticated;
