import { supabase, YEAR, $, bindLogout, formatDeadline, renderAdminCorrectionNotice } from './staff-common.js';
import { APP_VERSION } from './version.js';

bindLogout();
const versionEl=$('appVersion');if(versionEl)versionEl.textContent=APP_VERSION;
try {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) location.href = './login.html';

  const [{ data: assignment, error }, { data: settings }] = await Promise.all([
    supabase.from('staff_assignments').select('id,status,editable_until_override,submitted_at,post_submit_editing,password_change_required').eq('auth_user_id', user.id).eq('year', YEAR).single(),
    supabase.from('year_settings').select('default_editable_until').eq('year', YEAR).single()
  ]);

  if (assignment?.password_change_required) { location.replace('./password.html?required=1'); }
  if (error || !assignment) {
    $('message').textContent = '対象データを取得できません。';
    $('message').style.display = 'block';
  } else {
    await renderAdminCorrectionNotice(assignment.id,null,document.querySelector('.card'));
    const submitted=['提出済み','確認中'].includes(assignment.status);
    const editing=submitted && assignment.post_submit_editing === true;
    $('status').textContent = editing ? '修正中' : assignment.status;
    $('status').classList.toggle('status-submitted', submitted && !editing);
    $('status').classList.toggle('status-editing', editing);

    const deadline = assignment.editable_until_override || settings?.default_editable_until;
    $('deadline').textContent = formatDeadline(deadline);
    const expired=!!deadline && new Date()>new Date(deadline);
    if(expired){
      $('deadlineNotice').innerHTML='<div class="notice"><strong>編集期限を過ぎています。</strong><br>修正が必要な場合は、修正内容を <a href="mailto:jinji@to-job.com">jinji@to-job.com</a> へメールで送信してください。</div>';
    }

    const [{ data: progress }, { data: requiredDocs }] = await Promise.all([
      supabase.from('staff_section_progress').select('section_key').eq('staff_assignment_id', assignment.id),
      supabase.rpc('staff_required_documents',{p_assignment_id:assignment.id})
    ]);
    const done = new Set((progress || []).map(x => x.section_key));
    const map = {
      basic: 'basicState', income: 'incomeState', spouse_dependents: 'spouseState', insurance: 'insuranceState',
      previous_employment: 'previousState', housing_loan: 'housingState', documents: 'documentsState'
    };
    const documentsReady=(requiredDocs||[]).every(r=>r.complete);
    for (const [key, id] of Object.entries(map)) {
      const ok=key==='documents' ? done.has(key)&&documentsReady : done.has(key);
      $(id).textContent = ok ? '入力済' : '未入力';
    }
    if(!documentsReady)$('documentsState').textContent='必須書類あり';
    const allDone = Object.keys(map).every(k => k==='documents' ? done.has(k)&&documentsReady : done.has(k));

    const sectionLinks=[...document.querySelectorAll('[data-section-link]')];
    const sectionEditable=!expired && (!submitted || editing);
    for(const link of sectionLinks){
      link.classList.toggle('disabled-link', !sectionEditable);
      link.setAttribute('aria-disabled', sectionEditable ? 'false' : 'true');
      link.style.pointerEvents=sectionEditable?'auto':'none';
      link.tabIndex=sectionEditable?0:-1;
    }

    const reviewLink = $('reviewLink');
    if(submitted){
      $('reviewLabel').textContent=editing?'入力内容の確認・再提出':'入力内容の確認';
      $('reviewState').textContent=editing?'再提出できます':'確認できます';
    }else{
      $('reviewLabel').textContent='入力内容の確認・提出';
      $('reviewState').textContent = allDone ? '確認・提出へ' : '未完了あり';
    }
    const canOpen=submitted||allDone;
    if (reviewLink) {
      reviewLink.setAttribute('aria-disabled', canOpen ? 'false' : 'true');
      reviewLink.style.pointerEvents = canOpen ? 'auto' : 'none';
      reviewLink.style.opacity = canOpen ? '1' : '.55';
      reviewLink.tabIndex = canOpen ? 0 : -1;
    }
  }
} finally {
  document.body.classList.remove('page-loading');
  const loading=$('pageLoading');if(loading)loading.remove();
}
