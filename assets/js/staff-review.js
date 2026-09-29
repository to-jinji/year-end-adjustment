import { supabase, $, show, hide, requireStaffContext, formatDeadline, bindLogout, yen } from './staff-common.js';
let ctx;try{ctx=await requireStaffContext();}catch{show($('pageError'),'対象データを取得できません。');throw new Error('assignment not found');}
const {assignment,deadline,canEdit}=ctx;$('deadline').textContent=formatDeadline(deadline);$('status').textContent=assignment.status;
const sections=['basic','income','spouse_dependents','insurance','previous_employment','housing_loan','documents'];
const [{data:progress},{data:requiredDocs}]=await Promise.all([supabase.from('staff_section_progress').select('section_key').eq('staff_assignment_id',assignment.id),supabase.rpc('staff_required_documents',{p_assignment_id:assignment.id})]);const done=new Set((progress||[]).map(x=>x.section_key));const documentsReady=(requiredDocs||[]).every(r=>r.complete);
const labels={basic:'基本情報',income:'本人・所得情報',spouse_dependents:'配偶者・扶養',insurance:'保険料控除',previous_employment:'前職・源泉徴収票',housing_loan:'住宅ローン控除',documents:'必要書類',other:'その他'};
const allDone=sections.every(k=>k==='documents'?done.has(k)&&documentsReady:done.has(k));
if (!allDone && !['提出済み','確認中','修正依頼'].includes(assignment.status)) {
  location.replace('./index.html');
  throw new Error('incomplete sections');
}
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

const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const statusLabels={pending:'承認待ち',approved:'承認済み',completed:'再提出済み',rejected:'却下'};
async function loadCorrectionHistory(){
  const {data,error}=await supabase.from('staff_correction_requests').select('id,section_key,current_content,requested_content,status,requested_at,approved_at').eq('staff_assignment_id',assignment.id).order('requested_at',{ascending:false}).limit(20);
  if(error||!data?.length){$('correctionHistoryWrap').classList.add('hidden');return}
  $('correctionHistoryWrap').classList.remove('hidden');
  $('correctionHistory').innerHTML=data.map(r=>`<div class="subcard" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><strong>${escapeHtml(labels[r.section_key]||r.section_key)}</strong><span class="mini-badge">${escapeHtml(statusLabels[r.status]||r.status)}</span></div><p class="muted" style="margin:6px 0">${new Date(r.requested_at).toLocaleString('ja-JP')}</p><dl class="summary-list"><div><dt>現在の内容</dt><dd>${escapeHtml(r.current_content)}</dd></div><div><dt>修正後の内容</dt><dd>${escapeHtml(r.requested_content)}</dd></div></dl></div>`).join('');
}
await loadCorrectionHistory();

const submitted=['提出済み','確認中'].includes(assignment.status);
if(submitted){
  $('submittedNotice').classList.remove('hidden');
  $('correctionArea').classList.remove('hidden');
  $('submitHint').textContent='提出済みです。修正が必要な場合は管理者へ修正依頼を送信してください。';
  $('submitBtn').disabled=true;
}else if(assignment.status==='修正依頼'){
  $('editingNotice').classList.remove('hidden');
  if(!allDone){$('submitHint').textContent='未完了の入力項目があります。修正後、すべて完了してから再提出してください。';$('submitBtn').disabled=true;}
  else if(!canEdit){$('submitHint').textContent='現在は再提出できません。編集期限を確認してください。';$('submitBtn').disabled=true;}
}else if(!allDone){$('submitHint').textContent='未完了の入力項目があります。すべて完了すると提出できます。';$('submitBtn').disabled=true;}
else if(!canEdit){$('submitHint').textContent='現在は提出操作ができません。';$('submitBtn').disabled=true;}

$('openCorrectionRequest').onclick=()=>{$('correctionForm').classList.remove('hidden');$('openCorrectionRequest').classList.add('hidden')};
$('cancelCorrectionRequest').onclick=()=>{$('correctionForm').classList.add('hidden');$('openCorrectionRequest').classList.remove('hidden');hide($('correctionError'));hide($('correctionSuccess'))};
$('sendCorrectionRequest').onclick=async()=>{
  hide($('correctionError'));hide($('correctionSuccess'));
  const section=$('correctionSection').value;const current=$('correctionCurrent').value.trim();const requested=$('correctionRequested').value.trim();
  if(!section)return show($('correctionError'),'修正したい項目を選択してください。');
  if(!current)return show($('correctionError'),'現在の内容を入力してください。');
  if(!requested)return show($('correctionError'),'修正後の内容を入力してください。');
  const btn=$('sendCorrectionRequest');btn.disabled=true;btn.textContent='送信中…';
  const {error}=await supabase.rpc('staff_create_correction_request',{p_assignment_id:assignment.id,p_section_key:section,p_current_content:current,p_requested_content:requested});
  btn.disabled=false;btn.textContent='修正依頼を送信';
  if(error)return show($('correctionError'),error.message);
  show($('correctionSuccess'),'修正依頼を送信しました。管理者の承認をお待ちください。');
  $('correctionSection').value='';$('correctionCurrent').value='';$('correctionRequested').value='';
  await loadCorrectionHistory();
};

$('submitBtn').onclick=async()=>{hide($('pageError'));hide($('pageSuccess'));if(!allDone||!canEdit)return; if(!confirm(assignment.status==='修正依頼'?'修正内容を再提出します。よろしいですか？':'入力内容を提出します。提出後は原則として編集できません。よろしいですか？'))return;const{error}=await supabase.rpc('staff_submit_year_adjustment',{p_assignment_id:assignment.id});if(error)return show($('pageError'),error.message);show($('pageSuccess'),assignment.status==='修正依頼'?'修正内容を再提出しました。':'提出しました。');$('submitBtn').disabled=true;$('status').textContent='提出済み';setTimeout(()=>location.reload(),800);};
bindLogout();
