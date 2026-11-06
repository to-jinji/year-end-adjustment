import { supabase, $, show, hide, requireStaffContext, formatDeadline, lockForm, markSectionComplete, bindLogout, yen, saveAndReturn, bindYenInput, setYenInput, parseYenInput, runAddAction, finishPageLoading } from './staff-common.js?v=0.13.1';
try {
let ctx;
try { ctx = await requireStaffContext(); } catch { show($('pageError'),'対象データを取得できません。'); throw new Error('assignment not found'); }
const { assignment, deadline, canEdit } = ctx;
$('deadline').textContent = formatDeadline(deadline);
bindYenInput($('spouseIncome')); bindYenInput($('depIncome')); bindYenInput($('spouseLivelihoodSupport')); bindYenInput($('spouseRetirementIncome')); bindYenInput($('depLivelihoodSupport')); bindYenInput($('depRetirementIncome'));
const spouseFields = $('spouseFields');
const dependentsBody = $('dependentsBody');

function toggleSpouseFields(){ spouseFields.classList.toggle('hidden',$('hasSpouse').value!=='yes'); }
$('hasSpouse').onchange = toggleSpouseFields;
function toggleSpouseNonresident(){ $('spouseNonresidentFields').classList.toggle('hidden',!$('spouseNonresident').checked); }
function toggleSpouseRetirement(){ $('spouseRetirementFields').classList.toggle('hidden',!$('spouseHasRetirementIncome').checked); }
$('spouseNonresident').onchange=toggleSpouseNonresident;
$('spouseHasRetirementIncome').onchange=toggleSpouseRetirement;

const { data: spouse } = await supabase.from('staff_spouse_info').select('*').eq('staff_assignment_id',assignment.id).maybeSingle();
if (spouse) {
  $('hasSpouse').value = spouse.has_spouse ? 'yes' : 'no';
  $('spouseName').value = spouse.spouse_name || ''; $('spouseKana').value = spouse.spouse_name_kana || '';
  $('spouseBirth').value = spouse.birth_date || ''; setYenInput($('spouseIncome'), spouse.estimated_income);
  $('spouseLiving').checked = !!spouse.living_together; $('spouseNonresident').checked = !!spouse.nonresident;
  $('spouseAddress').value = spouse.address || '';$('spouseDisability').value=spouse.disability_category||'なし';
  setYenInput($('spouseLivelihoodSupport'),spouse.livelihood_support_amount);
  $('spouseChangeDate').value=spouse.change_date||''; $('spouseChangeReason').value=spouse.change_reason||'';
  $('spouseHasRetirementIncome').checked=!!spouse.has_retirement_income; setYenInput($('spouseRetirementIncome'),spouse.retirement_income_estimate);$('spouseRetirementDisability').value=spouse.retirement_disability_category||'なし';$('spouseRetirementWidow').value=spouse.retirement_widow_single_parent||'なし';
}
toggleSpouseFields(); toggleSpouseNonresident(); toggleSpouseRetirement();

function toggleDepNonresident(){ $('depNonresidentFields').classList.toggle('hidden',!$('depNonresident').checked); }
function toggleDepOtherIncomeEarner(){ $('depOtherIncomeEarnerFields').classList.toggle('hidden',!$('depOtherIncomeEarnerClaims').checked); }
function toggleDepRetirement(){ $('depRetirementFields').classList.toggle('hidden',!$('depHasRetirementIncome').checked); }
$('depNonresident').onchange=toggleDepNonresident;
$('depOtherIncomeEarnerClaims').onchange=toggleDepOtherIncomeEarner;
$('depHasRetirementIncome').onchange=toggleDepRetirement;
toggleDepNonresident(); toggleDepOtherIncomeEarner(); toggleDepRetirement();

async function loadDependents(){
  const { data, error } = await supabase.from('staff_dependents').select('*').eq('staff_assignment_id',assignment.id).order('birth_date',{ascending:true});
  if(error) return show($('pageError'),error.message);
  dependentsBody.innerHTML='';
  for(const d of data||[]){
    const tr=document.createElement('tr');
    const flags=[d.nonresident?'非居住者':'',d.other_income_earner_claims?'他の所得者が控除':'',d.has_retirement_income?'退職手当等あり':''].filter(Boolean).join(' / ');
    tr.innerHTML=`<td>${escapeHtml(d.name)}${flags?`<div class="field-help">${escapeHtml(flags)}</div>`:''}</td><td>${escapeHtml(d.relationship)}</td><td>${escapeHtml(d.birth_date||'')}</td><td>¥${yen(d.estimated_income)}</td><td><button class="btn tiny secondary" data-delete="${d.id}" ${canEdit?'':'disabled'}>削除</button></td>`;
    dependentsBody.appendChild(tr);
  }
  if(!(data||[]).length) dependentsBody.innerHTML='<tr><td colspan="5" class="muted">登録なし</td></tr>';
  dependentsBody.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{
    if(!confirm('この扶養親族を削除しますか？')) return;
    const {error}=await supabase.from('staff_dependents').delete().eq('id',btn.dataset.delete);
    if(error)show($('pageError'),error.message);else loadDependents();
  });
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
await loadDependents();

$('addDependentForm').onsubmit=async e=>{
  e.preventDefault();hide($('pageError'));if(!canEdit)return show($('pageError'),'現在は編集できません。');
  const payload={staff_assignment_id:assignment.id,name:$('depName').value.trim(),name_kana:$('depKana').value.trim(),birth_date:$('depBirth').value,relationship:$('depRelationship').value.trim(),estimated_income:parseYenInput($('depIncome').value),living_together:$('depLiving').checked,address:$('depAddress').value.trim(),nonresident:$('depNonresident').checked,disability_category:$('depDisability').value,dependent_category:under16($('depBirth').value)?'該当なし':$('depCategory').value,nonresident_reason:$('depNonresident').checked?$('depNonresidentReason').value:'該当なし',livelihood_support_amount:$('depNonresident').checked?parseYenInput($('depLivelihoodSupport').value):0,change_date:$('depChangeDate').value||null,change_reason:$('depChangeReason').value.trim(),other_income_earner_claims:$('depOtherIncomeEarnerClaims').checked,other_income_earner_name:$('depOtherIncomeEarnerClaims').checked?$('depOtherIncomeEarnerName').value.trim():'',other_income_earner_relationship:$('depOtherIncomeEarnerClaims').checked?$('depOtherIncomeEarnerRelationship').value.trim():'',other_income_earner_address:$('depOtherIncomeEarnerClaims').checked?$('depOtherIncomeEarnerAddress').value.trim():'',resident_tax_excluded_foreign_dependent:$('depNonresident').checked&&$('depResidentTaxExcludedForeign').checked,has_retirement_income:$('depHasRetirementIncome').checked,retirement_income_estimate:$('depHasRetirementIncome').checked?parseYenInput($('depRetirementIncome').value):0,retirement_disability_category:$('depHasRetirementIncome').checked?$('depRetirementDisability').value:'なし',retirement_widow_single_parent:$('depHasRetirementIncome').checked?$('depRetirementWidow').value:'なし'};
  if(!payload.name||!payload.birth_date||!payload.relationship)return show($('pageError'),'扶養親族の氏名・生年月日・続柄を入力してください。');
  const btn=e.submitter||$('addDependentForm').querySelector('button[type="submit"]');
  try {
    await runAddAction(btn, async()=>{
      const {error}=await supabase.from('staff_dependents').insert(payload);if(error)throw error;
      $('addDependentForm').reset();$('depLiving').checked=true;toggleDepNonresident();toggleDepOtherIncomeEarner();toggleDepRetirement();await loadDependents();
    }, { toastText:'扶養親族を追加しました。' });
  } catch(err) { show($('pageError'),err.message); }
};

$('saveSpouse').onclick=async()=>{
  hide($('pageError'));hide($('pageSuccess'));if(!canEdit)return show($('pageError'),'現在は編集できません。');
  const has=$('hasSpouse').value==='yes';
  const payload={staff_assignment_id:assignment.id,has_spouse:has,spouse_name:has?$('spouseName').value.trim():'',spouse_name_kana:has?$('spouseKana').value.trim():'',birth_date:has?($('spouseBirth').value||null):null,estimated_income:has?parseYenInput($('spouseIncome').value):0,living_together:has?$('spouseLiving').checked:false,address:has?$('spouseAddress').value.trim():'',nonresident:has?$('spouseNonresident').checked:false,disability_category:has?$('spouseDisability').value:'なし',livelihood_support_amount:has&&$('spouseNonresident').checked?parseYenInput($('spouseLivelihoodSupport').value):0,change_date:has?($('spouseChangeDate').value||null):null,change_reason:has?$('spouseChangeReason').value.trim():'',has_retirement_income:has?$('spouseHasRetirementIncome').checked:false,retirement_income_estimate:has&&$('spouseHasRetirementIncome').checked?parseYenInput($('spouseRetirementIncome').value):0,retirement_disability_category:has&&$('spouseHasRetirementIncome').checked?$('spouseRetirementDisability').value:'なし',retirement_widow_single_parent:has&&$('spouseHasRetirementIncome').checked?$('spouseRetirementWidow').value:'なし',updated_at:new Date().toISOString()};
  if(has&&(!payload.spouse_name||!payload.birth_date))return show($('pageError'),'配偶者の氏名と生年月日を入力してください。');
  try{await saveAndReturn($('saveSpouse'),async()=>{const {error}=await supabase.from('staff_spouse_info').upsert(payload,{onConflict:'staff_assignment_id'});if(error)throw error;await markSectionComplete(assignment.id,'spouse_dependents');});}catch(err){show($('pageError'),err.message);}
};
if(!canEdit){lockForm($('spouseForm'));lockForm($('addDependentForm'));$('saveSpouse').disabled=true;$('lockedMessage').classList.remove('hidden');}
bindLogout();
} finally { finishPageLoading(); }
