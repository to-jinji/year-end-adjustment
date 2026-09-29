import { supabase } from './supabase.js';
import { TARGET_YEAR } from './config.js';

export { supabase };
export const YEAR = TARGET_YEAR || 2026;
export const $ = id => document.getElementById(id);
export const show = (el, msg) => { if (!el) return; el.textContent = msg; el.style.display = 'block'; };
export const hide = el => { if (!el) return; el.style.display = 'none'; el.textContent = ''; };

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

export function bindLogout() {
  const el = $('logout');
  if (!el) return;
  el.onclick = async () => { await supabase.auth.signOut(); location.href = './login.html'; };
}

export function yen(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString('ja-JP') : '0';
}
