-- v0.4.0: 管理者によるスタッフ削除・給与年間集計・年末調整計算結果

create table if not exists public.staff_payroll_totals (
  staff_assignment_id uuid primary key references public.staff_assignments(id) on delete cascade,
  taxable_salary_total bigint not null default 0 check (taxable_salary_total >= 0),
  social_insurance_total bigint not null default 0 check (social_insurance_total >= 0),
  withheld_income_tax_total bigint not null default 0 check (withheld_income_tax_total >= 0),
  adjustment_result jsonb,
  manual_review_required boolean not null default false,
  calculated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.staff_payroll_totals enable row level security;
revoke all on public.staff_payroll_totals from anon, authenticated;
grant select on public.staff_payroll_totals to authenticated;

create policy "admin read payroll totals"
on public.staff_payroll_totals for select to authenticated
using ((select private.is_admin()));

-- 住宅ローン控除は証明書等に記載された年末調整用控除額を入力して計算に利用する。
alter table public.staff_housing_loan_info
  add column if not exists deduction_amount bigint not null default 0 check (deduction_amount >= 0);
