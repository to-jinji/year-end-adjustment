import { supabase, YEAR, $, bindLogout, formatDeadline, renderAdminCorrectionNotice } from './staff-common.js';

const { data: { user } } = await supabase.auth.getUser();
if (!user) location.href = './login.html';

const [{ data: assignment, error }, { data: settings }] = await Promise.all([
  supabase.from('staff_assignments').select('id,status,editable_until_override').eq('auth_user_id', user.id).eq('year', YEAR).single(),
  supabase.from('year_settings').select('default_editable_until').eq('year', YEAR).single()
]);

if (error || !assignment) {
  $('message').textContent = '対象データを取得できません。';
  $('message').style.display = 'block';
} else {
  await renderAdminCorrectionNotice(assignment.id,null,document.querySelector('.card'));
  $('status').textContent = assignment.status;
  const deadline = assignment.editable_until_override || settings?.default_editable_until;
  $('deadline').textContent = formatDeadline(deadline);
  const [{ data: progress }, { data: requiredDocs }] = await Promise.all([
    supabase.from('staff_section_progress').select('section_key').eq('staff_assignment_id', assignment.id),
    supabase.rpc('staff_required_documents',{p_assignment_id:assignment.id})
  ]);
  const done = new Set((progress || []).map(x => x.section_key));
  const map = {
    basic: 'basicState',
    income: 'incomeState',
    spouse_dependents: 'spouseState',
    insurance: 'insuranceState',
    previous_employment: 'previousState',
    housing_loan: 'housingState',
    documents: 'documentsState'
  };
  const documentsReady=(requiredDocs||[]).every(r=>r.complete);
  for (const [key, id] of Object.entries(map)) {
    const ok=key==='documents' ? done.has(key)&&documentsReady : done.has(key);
    $(id).textContent = ok ? '入力済' : '未入力';
  }
  if(!documentsReady)$('documentsState').textContent='必須書類あり';
  const allDone = Object.keys(map).every(k => k==='documents' ? done.has(k)&&documentsReady : done.has(k));
  $('reviewState').textContent = allDone ? '確認できます' : '未完了あり';
}
bindLogout();
