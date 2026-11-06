
alter table public.staff_income_info
  add column if not exists self_change_date date,
  add column if not exists self_change_reason text not null default '';

alter table public.staff_spouse_info
  add column if not exists disability_category text not null default 'なし',
  add column if not exists retirement_disability_category text not null default 'なし',
  add column if not exists retirement_widow_single_parent text not null default 'なし';

alter table public.staff_dependents
  add column if not exists dependent_category text not null default '該当なし',
  add column if not exists retirement_disability_category text not null default 'なし',
  add column if not exists retirement_widow_single_parent text not null default 'なし';

create or replace function public.save_staff_fuyou_declaration(
  p_assignment_id uuid,
  p_basic jsonb,
  p_income jsonb,
  p_spouse jsonb,
  p_dependents jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_dep jsonb;
begin
  if v_uid is null then
    raise exception 'ログインが必要です。' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.staff_assignments sa
    where sa.id = p_assignment_id
      and sa.auth_user_id = v_uid
      and sa.year = 2026
  ) then
    raise exception '対象スタッフを確認できません。' using errcode = '42501';
  end if;

  insert into public.staff_basic_info (
    staff_assignment_id,name_kana,postal_code,address,
    household_head_name,relationship_to_household_head,updated_at
  )
  values (
    p_assignment_id,
    coalesce(p_basic->>'name_kana',''),
    coalesce(p_basic->>'postal_code',''),
    coalesce(p_basic->>'address',''),
    coalesce(p_basic->>'household_head_name',''),
    coalesce(p_basic->>'relationship_to_household_head',''),
    now()
  )
  on conflict (staff_assignment_id) do update set
    name_kana=excluded.name_kana,
    postal_code=excluded.postal_code,
    address=excluded.address,
    household_head_name=excluded.household_head_name,
    relationship_to_household_head=excluded.relationship_to_household_head,
    updated_at=now();

  insert into public.staff_income_info (
    staff_assignment_id,disability_category,widow_single_parent,working_student,
    secondary_dependent_declaration_submitted,disability_student_detail,
    self_change_date,self_change_reason,updated_at
  )
  values (
    p_assignment_id,
    coalesce(nullif(p_income->>'disability_category',''),'なし'),
    coalesce(nullif(p_income->>'widow_single_parent',''),'なし'),
    coalesce((p_income->>'working_student')::boolean,false),
    false,
    coalesce(p_income->>'disability_student_detail',''),
    nullif(p_income->>'self_change_date','')::date,
    coalesce(p_income->>'self_change_reason',''),
    now()
  )
  on conflict (staff_assignment_id) do update set
    disability_category=excluded.disability_category,
    widow_single_parent=excluded.widow_single_parent,
    working_student=excluded.working_student,
    secondary_dependent_declaration_submitted=false,
    disability_student_detail=excluded.disability_student_detail,
    self_change_date=excluded.self_change_date,
    self_change_reason=excluded.self_change_reason,
    updated_at=now();

  insert into public.staff_spouse_info (
    staff_assignment_id,has_spouse,spouse_name,spouse_name_kana,birth_date,
    estimated_income,living_together,address,nonresident,disability_category,
    livelihood_support_amount,change_date,change_reason,has_retirement_income,
    retirement_income_estimate,retirement_disability_category,
    retirement_widow_single_parent,updated_at
  )
  values (
    p_assignment_id,
    coalesce((p_spouse->>'has_spouse')::boolean,false),
    coalesce(p_spouse->>'spouse_name',''),
    coalesce(p_spouse->>'spouse_name_kana',''),
    nullif(p_spouse->>'birth_date','')::date,
    coalesce(nullif(p_spouse->>'estimated_income','')::bigint,0),
    coalesce((p_spouse->>'living_together')::boolean,false),
    coalesce(p_spouse->>'address',''),
    coalesce((p_spouse->>'nonresident')::boolean,false),
    coalesce(nullif(p_spouse->>'disability_category',''),'なし'),
    coalesce(nullif(p_spouse->>'livelihood_support_amount','')::bigint,0),
    nullif(p_spouse->>'change_date','')::date,
    coalesce(p_spouse->>'change_reason',''),
    coalesce((p_spouse->>'has_retirement_income')::boolean,false),
    coalesce(nullif(p_spouse->>'retirement_income_estimate','')::bigint,0),
    coalesce(nullif(p_spouse->>'retirement_disability_category',''),'なし'),
    coalesce(nullif(p_spouse->>'retirement_widow_single_parent',''),'なし'),
    now()
  )
  on conflict (staff_assignment_id) do update set
    has_spouse=excluded.has_spouse,
    spouse_name=excluded.spouse_name,
    spouse_name_kana=excluded.spouse_name_kana,
    birth_date=excluded.birth_date,
    estimated_income=excluded.estimated_income,
    living_together=excluded.living_together,
    address=excluded.address,
    nonresident=excluded.nonresident,
    disability_category=excluded.disability_category,
    livelihood_support_amount=excluded.livelihood_support_amount,
    change_date=excluded.change_date,
    change_reason=excluded.change_reason,
    has_retirement_income=excluded.has_retirement_income,
    retirement_income_estimate=excluded.retirement_income_estimate,
    retirement_disability_category=excluded.retirement_disability_category,
    retirement_widow_single_parent=excluded.retirement_widow_single_parent,
    updated_at=now();

  delete from public.staff_dependents where staff_assignment_id=p_assignment_id;

  for v_dep in
    select value from jsonb_array_elements(coalesce(p_dependents,'[]'::jsonb))
  loop
    insert into public.staff_dependents (
      staff_assignment_id,name,name_kana,birth_date,relationship,estimated_income,
      living_together,address,nonresident,disability_category,dependent_category,
      nonresident_reason,livelihood_support_amount,change_date,change_reason,
      other_income_earner_claims,other_income_earner_name,
      other_income_earner_relationship,other_income_earner_address,
      resident_tax_excluded_foreign_dependent,has_retirement_income,
      retirement_income_estimate,retirement_disability_category,
      retirement_widow_single_parent,updated_at
    )
    values (
      p_assignment_id,
      coalesce(v_dep->>'name',''),
      coalesce(v_dep->>'name_kana',''),
      nullif(v_dep->>'birth_date','')::date,
      coalesce(v_dep->>'relationship',''),
      coalesce(nullif(v_dep->>'estimated_income','')::bigint,0),
      coalesce((v_dep->>'living_together')::boolean,true),
      coalesce(v_dep->>'address',''),
      coalesce((v_dep->>'nonresident')::boolean,false),
      coalesce(nullif(v_dep->>'disability_category',''),'なし'),
      coalesce(nullif(v_dep->>'dependent_category',''),'該当なし'),
      coalesce(nullif(v_dep->>'nonresident_reason',''),'該当なし'),
      coalesce(nullif(v_dep->>'livelihood_support_amount','')::bigint,0),
      nullif(v_dep->>'change_date','')::date,
      coalesce(v_dep->>'change_reason',''),
      coalesce((v_dep->>'other_income_earner_claims')::boolean,false),
      coalesce(v_dep->>'other_income_earner_name',''),
      coalesce(v_dep->>'other_income_earner_relationship',''),
      coalesce(v_dep->>'other_income_earner_address',''),
      coalesce((v_dep->>'resident_tax_excluded_foreign_dependent')::boolean,false),
      coalesce((v_dep->>'has_retirement_income')::boolean,false),
      coalesce(nullif(v_dep->>'retirement_income_estimate','')::bigint,0),
      coalesce(nullif(v_dep->>'retirement_disability_category',''),'なし'),
      coalesce(nullif(v_dep->>'retirement_widow_single_parent',''),'なし'),
      now()
    );
  end loop;

  insert into public.staff_section_progress(staff_assignment_id,section_key,completed_at)
  values
    (p_assignment_id,'basic',now()),
    (p_assignment_id,'spouse_dependents',now())
  on conflict (staff_assignment_id,section_key)
  do update set completed_at=excluded.completed_at;

  insert into public.staff_fuyou_declaration_confirmations(
    staff_assignment_id,confirmed_at,updated_at
  )
  values (p_assignment_id,now(),now())
  on conflict (staff_assignment_id) do update set
    confirmed_at=excluded.confirmed_at,
    updated_at=excluded.updated_at;
end;
$$;

revoke all on function public.save_staff_fuyou_declaration(uuid,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_staff_fuyou_declaration(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
