import { supabase, $, show, hide, requireStaffContext, formatDeadline, lockForm, markSectionComplete, bindLogout, yen, saveAndReturn, bindYenInput, setYenInput, parseYenInput } from './staff-common.js';
let ctx;
try { ctx = await requireStaffContext(); } catch { show($('pageError'),'対象データを取得できません。'); throw new Error('assignment not found'); }
const { assignment, deadline, canEdit } = ctx;
$('deadline').textContent = formatDeadline(deadline);
bindYenInput($('spouseIncome')); bindYenInput($('depIncome'));
const spouseFields = $('spouseFields');
const dependentsBody = $('dependentsBody');

function toggleSpouseFields(){ spouseFields.classList.toggle('hidden',$('hasSpouse').value!=='yes'); }
$('hasSpouse').onchange = toggleSpouseFields;

const { data: spouse } = await supabase.from('staff_spouse_info').select('*').eq('staff_assignment_id',assignment.id).maybeSingle();
if (spouse) {
  $('hasSpouse').value = spouse.has_spouse ? 'yes' : 'no';
  $('spouseName').value = spouse.spouse_name || ''; $('spouseKana').value = spouse.spouse_name_kana || '';
  $('spouseBirth').value = spouse.birth_date || ''; setYenInput($('spouseIncome'), spouse.estimated_income);
  $('spouseLiving').checked = !!spouse.living_together; $('spouseNonresident').checked = !!spouse.nonresident;
  $('spouseAddress').value = spouse.address || '';
}
toggleSpouseFields();

async function loadDependents(){
  const { data, error } = await supabase.from('staff_dependents').select('*').eq('staff_assignment_id',assignment.id).order('birth_date',{ascending:true});
  if(error) return show($('pageError'),error.message);
  dependentsBody.innerHTML='';
  for(const d of data||[]){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.relationship)}</td><td>${escapeHtml(d.birth_date||'')}</td><td>¥${yen(d.estimated_income)}</td><td><button class="btn tiny secondary" data-delete="${d.id}" ${canEdit?'':'disabled'}>削除</button></td>`;
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
  const payload={staff_assignment_id:assignment.id,name:$('depName').value.trim(),name_kana:$('depKana').value.trim(),birth_date:$('depBirth').value,relationship:$('depRelationship').value.trim(),estimated_income:parseYenInput($('depIncome').value),living_together:$('depLiving').checked,address:$('depAddress').value.trim(),nonresident:$('depNonresident').checked,disability_category:$('depDisability').value};
  if(!payload.name||!payload.birth_date||!payload.relationship)return show($('pageError'),'扶養親族の氏名・生年月日・続柄を入力してください。');
  const {error}=await supabase.from('staff_dependents').insert(payload);if(error)return show($('pageError'),error.message);
  $('addDependentForm').reset();$('depLiving').checked=true;await loadDependents();
};

$('saveSpouse').onclick=async()=>{
  hide($('pageError'));hide($('pageSuccess'));if(!canEdit)return show($('pageError'),'現在は編集できません。');
  const has=$('hasSpouse').value==='yes';
  const payload={staff_assignment_id:assignment.id,has_spouse:has,spouse_name:has?$('spouseName').value.trim():'',spouse_name_kana:has?$('spouseKana').value.trim():'',birth_date:has?($('spouseBirth').value||null):null,estimated_income:has?parseYenInput($('spouseIncome').value):0,living_together:has?$('spouseLiving').checked:false,address:has?$('spouseAddress').value.trim():'',nonresident:has?$('spouseNonresident').checked:false,updated_at:new Date().toISOString()};
  if(has&&(!payload.spouse_name||!payload.birth_date))return show($('pageError'),'配偶者の氏名と生年月日を入力してください。');
  try{await saveAndReturn($('saveSpouse'),async()=>{const {error}=await supabase.from('staff_spouse_info').upsert(payload,{onConflict:'staff_assignment_id'});if(error)throw error;await markSectionComplete(assignment.id,'spouse_dependents');});}catch(err){show($('pageError'),err.message);}
};
if(!canEdit){lockForm($('spouseForm'));lockForm($('addDependentForm'));$('saveSpouse').disabled=true;$('lockedMessage').classList.remove('hidden');}
bindLogout();
