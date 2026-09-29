import { supabase } from './supabase.js';
import { TARGET_YEAR } from './config.js';

export { supabase };
export const YEAR = TARGET_YEAR || 2026;
export const $ = id => document.getElementById(id);
export const show = (el, msg) => { if (!el) return; el.textContent = msg; el.style.display = 'block'; };
export const hide = el => { if (!el) return; el.style.display = 'none'; el.textContent = ''; };

const sectionByPath = () => {
  const name = location.pathname.split('/').pop() || 'index.html';
  return ({
    'basic.html':'basic',
    'income.html':'income',
    'spouse.html':'spouse_dependents',
    'insurance.html':'insurance',
    'previous.html':'previous_employment',
    'housing.html':'housing_loan'
  })[name] || null;
};
const sectionLabels = {
  basic:'基本情報', income:'本人・所得情報', spouse_dependents:'配偶者・扶養',
  insurance:'保険料控除', previous_employment:'前職・源泉徴収票', housing_loan:'住宅ローン控除'
};

export async function renderAdminCorrectionNotice(assignmentId, sectionKey = null, container = null) {
  let q = supabase.from('staff_admin_changes').select('section_key,summary,created_at').eq('staff_assignment_id', assignmentId).order('created_at',{ascending:false}).limit(sectionKey ? 5 : 10);
  if (sectionKey) q = q.eq('section_key', sectionKey);
  const { data, error } = await q;
  if (error || !data?.length) return;
  const host = container || document.querySelector('.card');
  if (!host) return;
  const box = document.createElement('div');
  box.className = 'admin-change-notice';
  box.innerHTML = `<strong>管理者による修正があります</strong><ul>${data.map(r=>`<li><span>${sectionLabels[r.section_key]||r.section_key}</span>：${escapeHtml(r.summary)} <small>${new Date(r.created_at).toLocaleString('ja-JP')}</small></li>`).join('')}</ul>`;
  host.insertBefore(box, host.firstChild);
}

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export async function requireStaffContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    location.href = './login.html';
    throw new Error('not signed in');
  }
  const [{ data: assignment, error }, { data: settings }] = await Promise.all([
    supabase.from('staff_assignments')
      .select('id,status,editable_until_override,staff_members!inner(display_name,birth_date)')
      .eq('auth_user_id', user.id).eq('year', YEAR).single(),
    supabase.from('year_settings').select('default_editable_until').eq('year', YEAR).single()
  ]);
  if (error || !assignment) throw new Error('assignment not found');
  const deadline = assignment.editable_until_override || settings?.default_editable_until || null;
  const canEdit = !!deadline && new Date() <= new Date(deadline) && ['入力中','修正依頼'].includes(assignment.status);
  await renderAdminCorrectionNotice(assignment.id, sectionByPath());
  return { user, assignment, deadline, canEdit };
}

export function formatDeadline(deadline) {
  return deadline ? `編集期限：${new Date(deadline).toLocaleString('ja-JP')}` : '編集期限：未設定';
}

export function lockForm(form) {
  if (!form) return;
  for (const el of form.querySelectorAll('input:not([readonly]),select,textarea,button[type="submit"],button[data-edit-action]')) el.disabled = true;
}

export async function markSectionComplete(staffAssignmentId, sectionKey) {
  const { error } = await supabase.from('staff_section_progress').upsert({
    staff_assignment_id: staffAssignmentId,
    section_key: sectionKey,
    completed_at: new Date().toISOString()
  }, { onConflict: 'staff_assignment_id,section_key' });
  if (error) throw error;
}

export async function markSectionIncomplete(staffAssignmentId, sectionKey) {
  const { error } = await supabase.from('staff_section_progress').delete().eq('staff_assignment_id',staffAssignmentId).eq('section_key',sectionKey);
  if (error) throw error;
}

export async function saveAndReturn(button, task, savingText='保存中…') {
  const original = button?.textContent || '';
  if (button) { button.disabled = true; button.textContent = savingText; }
  try {
    await task();
    if (button) button.textContent = '保存完了';
    setTimeout(()=>{ location.href='./index.html'; }, 450);
  } catch (e) {
    if (button) { button.disabled = false; button.textContent = original; }
    throw e;
  }
}

export function bindLogout() {
  const el = $('logout');
  if (!el) return;
  el.onclick = async () => { await supabase.auth.signOut(); location.href = './login.html'; };
}

export function yen(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString('ja-JP') : '0';
}

export function parseYenInput(value) {
  const raw = String(value ?? '').replace(/[\s,，￥¥]/g, '').replace(/[^0-9]/g, '');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export function formatYenInputValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return Math.trunc(n).toLocaleString('ja-JP');
}

export function setYenInput(input, value) {
  if (!input) return;
  input.value = formatYenInputValue(value);
}

export function bindYenInput(input) {
  if (!input) return;
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  const format = () => {
    const digits = String(input.value || '').replace(/[^0-9]/g, '');
    input.value = digits ? Number(digits).toLocaleString('ja-JP') : '';
  };
  input.addEventListener('input', format);
  input.addEventListener('blur', format);
  format();
}
