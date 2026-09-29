import { supabase, $, show, hide, requireStaffContext, formatDeadline, lockForm, markSectionComplete, bindLogout, yen, saveAndReturn, bindYenInput, parseYenInput } from './staff-common.js';

let ctx;
try { ctx = await requireStaffContext(); }
catch { show($('pageError'),'対象データを取得できません。'); throw new Error('assignment not found'); }

const { assignment, deadline, canEdit } = ctx;
$('deadline').textContent = formatDeadline(deadline);
bindYenInput($('paidAmount'));

const body = $('insuranceBody');
const applicableFields = $('insuranceApplicableFields');
const notApplicable = $('insuranceNotApplicable');
let currentEntries = [];

function esc(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toggleInsurance() {
  const v = $('hasInsurance').value;
  applicableFields.classList.toggle('hidden', v !== 'yes');
  notApplicable.classList.toggle('hidden', v !== 'no');
}
$('hasInsurance').onchange = toggleInsurance;

async function load() {
  const { data, error } = await supabase.from('staff_insurance_entries').select('*').eq('staff_assignment_id',assignment.id).order('created_at');
  if (error) return show($('pageError'),error.message);
  currentEntries = data || [];
  body.innerHTML='';
  for (const r of currentEntries) {
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(r.insurance_type)}</td><td>${esc(r.company_name)}</td><td>${esc(r.policyholder_name)}</td><td>¥${yen(r.paid_amount)}</td><td><button class="btn tiny secondary" data-delete="${r.id}" ${canEdit?'':'disabled'}>削除</button></td>`;
    body.appendChild(tr);
  }
  if (!currentEntries.length) body.innerHTML='<tr><td colspan="5" class="muted">登録なし</td></tr>';
  body.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{
    if(!confirm('この保険料情報を削除しますか？')) return;
    const {error}=await supabase.from('staff_insurance_entries').delete().eq('id',btn.dataset.delete);
    if(error) show($('pageError'),error.message); else await load();
  });
}

await load();
const { data: progress } = await supabase.from('staff_section_progress').select('section_key').eq('staff_assignment_id',assignment.id).eq('section_key','insurance').maybeSingle();
if (currentEntries.length) $('hasInsurance').value='yes';
else if (progress) $('hasInsurance').value='no';
toggleInsurance();

$('insuranceForm').onsubmit = async e => {
  e.preventDefault(); hide($('pageError'));
  if(!canEdit) return show($('pageError'),'現在は編集できません。');
  if ($('hasInsurance').value !== 'yes') return show($('pageError'),'最初の質問で「はい」を選択してください。');
  const payload={
    staff_assignment_id:assignment.id,
    insurance_type:$('insuranceType').value,
    company_name:$('companyName').value.trim(),
    policyholder_name:$('policyholderName').value.trim(),
    beneficiary_name:$('beneficiaryName').value.trim(),
    paid_amount:parseYenInput($('paidAmount').value),
    note:$('insuranceNote').value.trim()
  };
  if(!payload.insurance_type||!payload.company_name||!payload.policyholder_name||!payload.paid_amount)
    return show($('pageError'),'種類・保険会社等・契約者・支払額を入力してください。');
  const {error}=await supabase.from('staff_insurance_entries').insert(payload);
  if(error) return show($('pageError'),error.message);
  $('insuranceForm').reset();
  await load();
};

$('completeInsurance').onclick = async () => {
  hide($('pageError')); hide($('pageSuccess'));
  if(!canEdit) return show($('pageError'),'現在は編集できません。');
  const choice = $('hasInsurance').value;
  if (!choice) return show($('pageError'),'保険料控除の対象となる支払いがあるか選択してください。');
  await load();
  if (choice === 'yes' && !currentEntries.length) return show($('pageError'),'「はい」を選択した場合は、保険料情報を1件以上登録してください。');
  if (choice === 'no' && currentEntries.length) {
    if (!confirm('登録済みの保険料情報があります。「対象外」として完了すると、登録済みの保険料情報を削除します。よろしいですか？')) return;
  }
  try {
    await saveAndReturn($('completeInsurance'), async()=>{
      if (choice === 'no' && currentEntries.length) {
        const {error}=await supabase.from('staff_insurance_entries').delete().eq('staff_assignment_id',assignment.id);
        if (error) throw error;
      }
      await markSectionComplete(assignment.id,'insurance');
    });
  } catch(err) { show($('pageError'),err.message); }
};

if(!canEdit){
  $('hasInsurance').disabled=true;
  lockForm($('insuranceForm'));
  $('completeInsurance').disabled=true;
  $('lockedMessage').classList.remove('hidden');
}
bindLogout();
