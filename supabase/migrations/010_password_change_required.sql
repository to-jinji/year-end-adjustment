alter table public.staff_assignments
  add column if not exists password_change_required boolean not null default false;

update public.staff_assignments
set password_change_required = false
where password_change_required is null;
