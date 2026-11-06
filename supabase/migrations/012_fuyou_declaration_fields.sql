-- v0.11.0: 令和8年分 扶養控除等（異動）申告書の追加項目
-- 個人番号は本サイトでは収集しない。

alter table public.staff_income_info
  add column if not exists secondary_dependent_declaration_submitted boolean not null default false,
  add column if not exists disability_student_detail text not null default '';

alter table public.staff_spouse_info
  add column if not exists livelihood_support_amount bigint not null default 0 check (livelihood_support_amount >= 0),
  add column if not exists change_date date,
  add column if not exists change_reason text not null default '',
  add column if not exists has_retirement_income boolean not null default false,
  add column if not exists retirement_income_estimate bigint not null default 0 check (retirement_income_estimate >= 0);

alter table public.staff_dependents
  add column if not exists nonresident_reason text not null default '該当なし'
    check (nonresident_reason in ('該当なし','16歳以上30歳未満又は70歳以上','留学','障害者','38万円以上の支払')),
  add column if not exists livelihood_support_amount bigint not null default 0 check (livelihood_support_amount >= 0),
  add column if not exists change_date date,
  add column if not exists change_reason text not null default '',
  add column if not exists other_income_earner_claims boolean not null default false,
  add column if not exists other_income_earner_name text not null default '',
  add column if not exists other_income_earner_relationship text not null default '',
  add column if not exists other_income_earner_address text not null default '',
  add column if not exists resident_tax_excluded_foreign_dependent boolean not null default false,
  add column if not exists has_retirement_income boolean not null default false,
  add column if not exists retirement_income_estimate bigint not null default 0 check (retirement_income_estimate >= 0);
