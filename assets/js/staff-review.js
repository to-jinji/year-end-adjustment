import { supabase, $, show, hide, requireStaffContext, formatDeadline, formatDateTime, bindLogout, yen } from './staff-common.js';
let ctx;try{ctx=await requireStaffContext();}catch{show($('pageError'),'対象データを取得できません。');throw new Error('assignment not found');}
const {assignment,deadline,canEdit,withinDeadline}=ctx;
$('deadline').textContent=formatDeadline(deadline);
const submitted=['提出済み','確認中'].includes(assignment.status);
const editing=submitted && assignment.post_submit_editing===true;
$('status').textContent=editing?'修正中':assignment.status;
$('status').classList.toggle('status-submitted',submitted&&!editing);
$('status').classList.toggle('status-editing',editing);
const sections=['basic','income','spouse_dependents','insurance','previous_employment','housing_loan','documents'];
const [{data:progress},{data:requiredDocs}]=await Promise.all([
  supabase.from('staff_section_progress').select('section_key').eq('staff_assignment_id',assignment.id),
  supabase.rpc('staff_required_documents',{p_assignment_id:assignment.id})
]);
const done=new Set((progress||[]).map(x=>x.section_key));const documentsReady=(requiredDocs||[]).every(r=>r.complete);
const allDone=sections.every(k=>k==='documents'?done.has(k)&&documentsReady:done.has(k));
if (!allDone && !submitted) {location.replace('./index.html');throw new Error('incomplete sections');}
const [{data:basic},{data:income},{data:spouse},{count:deps},{count:insurance},{data:prevSummary},{count:previous},{data:housing},{count:documents}]=await Promise.all([
  supabase.from('staff_basic_info').select('name_kana,postal_code,address,household_head_name,relationship_to_household_head').eq('staff_assignment_id',assignment.id).maybeSingle(),
  supabase.from('staff_income_info').select('other_salary_income,other_income,disability_category,widow_single_parent,working_student').eq('staff_assignment_id',assignment.id).maybeSingle(),
  supabase.from('staff_spouse_info').select('has_spouse,spouse_name,estimated_income').eq('staff_assignment_id',assignment.id).maybeSingle(),
  supabase.from('staff_dependents').select('id',{count:'exact',head:true}).eq('staff_assignment_id',assignment.id),
  supabase.from('staff_insurance_entries').select('id',{count:'exact',head:true}).eq('staff_assignment_id',assignment.id),
  supabase.from('staff_previous_employment_summary').select('has_previous_employment').eq('staff_assignment_id',assignment.id).maybeSingle(),
  supabase.from('staff_previous_employments').select('id',{count:'exact',head:true}).eq('staff_assignment_id',assignment.id),
  supabase.from('staff_housing_loan_info').select('has_housing_loan,year_end_balance').eq('staff_assignment_id',assignment.id).maybeSingle(),
  supabase.from('staff_documents').select('id',{count:'exact',head:true}).eq('staff_assignment_id',assignment.id)
]);
$('summary').innerHTML=`<dl class="summary-list"><div><dt>住所</dt><dd>${basic?`${basic.postal_code} ${basic.address}`:'未入力'}</dd></div><div><dt>給与以外の所得等</dt><dd>${income?`他社給与 ¥${yen(income.other_salary_income)} / その他所得 ¥${yen(income.other_income)}`:'未入力'}</dd></div><div><dt>配偶者</dt><dd>${spouse?(spouse.has_spouse?`${spouse.spouse_name || 'あり'}（見込所得 ¥${yen(spouse.estimated_income)}）`:'なし'):'未入力'}</dd></div><div><dt>扶養親族</dt><dd>${deps||0}人</dd></div><div><dt>保険料登録</dt><dd>${insurance||0}件</dd></div><div><dt>前職</dt><dd>${prevSummary?(prevSummary.has_previous_employment?`${previous||0}件登録`:'なし'):'未入力'}</dd></div><div><dt>住宅ローン控除</dt><dd>${housing?(housing.has_housing_loan?`あり（年末残高 ¥${yen(housing.year_end_balance)}）`:'なし'):'未入力'}</dd></div><div><dt>書類</dt><dd>${documents||0}件</dd></div></dl>`;

const expired=!!deadline&&new Date()>new Date(deadline);
if(submitted){
  $('pageTitle').textContent='入力内容の確認';
  $('submittedNotice').classList.remove('hidden');
  $('submittedNotice').textContent=`${formatDateTime(assignment.submitted_at)}　提出済みです。`;
}
if(expired){
  $('deadlineNotice').innerHTML='<div class="notice"><strong>編集期限を過ぎています。</strong><br>修正が必要な場合は、修正内容を <a href="mailto:jinji@to-job.com">jinji@to-job.com</a> へメールで送信してください。</div>';
  $('submitBtn').classList.add('hidden');
  $('submitHint').textContent='';
}else if(!allDone){
  $('submitBtn').disabled=true;$('submitHint').textContent='未完了の入力項目があります。すべて完了してから提出してください。';
}else if(submitted && !editing){
  $('submitBtn').textContent='内容を修正する';
  $('submitHint').textContent='内容の修正がある場合、「内容を修正する」を押してください。';
}else if(submitted && editing){
  $('submitBtn').textContent='再提出する';
  $('submitHint').textContent='修正が完了したら「再提出する」を押してください。';
}else if(!canEdit){
  $('submitBtn').disabled=true;$('submitHint').textContent='現在は提出操作ができません。';
}

$('submitBtn').onclick=async()=>{
  hide($('pageError'));hide($('pageSuccess'));
  const btn=$('submitBtn');
  if(submitted && !editing){
    if(!withinDeadline)return;
    btn.disabled=true;btn.textContent='修正モードに切替中…';
    const {error}=await supabase.rpc('staff_begin_post_submit_edit',{p_assignment_id:assignment.id});
    if(error){btn.disabled=false;btn.textContent='内容を修正する';return show($('pageError'),error.message);}
    location.href='./index.html';
    return;
  }
  if(!allDone||!canEdit)return;
  const isResubmit=submitted&&editing;
  if(!confirm(isResubmit?'修正した内容を再提出します。よろしいですか？':'入力内容を提出します。よろしいですか？'))return;
  btn.disabled=true;btn.textContent=isResubmit?'再提出中…':'提出中…';
  const{error}=await supabase.rpc('staff_submit_year_adjustment',{p_assignment_id:assignment.id});
  if(error){btn.disabled=false;btn.textContent=isResubmit?'再提出する':'年末調整を提出する';return show($('pageError'),error.message);}
  show($('pageSuccess'),isResubmit?'再提出しました。':'提出しました。');
  $('status').textContent='提出済み';
  setTimeout(()=>location.href='./index.html',700);
};
bindLogout();
