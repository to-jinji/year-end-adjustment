import { supabase, $, show, hide, requireStaffContext, formatDeadline, lockForm, markSectionComplete, bindLogout, saveAndReturn } from './staff-common.js';

let ctx;
try { ctx = await requireStaffContext(); } catch { show($('pageError'),'対象データを取得できません。'); $('basicForm').classList.add('hidden'); throw new Error('assignment not found'); }
const { assignment, deadline, canEdit } = ctx;
$('deadline').textContent = formatDeadline(deadline);
$('displayName').value = assignment.staff_members.display_name || '';
$('birthDate').value = assignment.staff_members.birth_date ? new Date(`${assignment.staff_members.birth_date}T00:00:00`).toLocaleDateString('ja-JP') : '';

const { data: basic } = await supabase.from('staff_basic_info').select('name_kana,postal_code,address,household_head_name,relationship_to_household_head').eq('staff_assignment_id',assignment.id).maybeSingle();
if (basic) {
  $('nameKana').value = basic.name_kana || '';
  $('postalCode').value = basic.postal_code || '';
  $('address').value = basic.address || '';
  $('householdHeadName').value = basic.household_head_name || '';
  $('relationship').value = basic.relationship_to_household_head || '';
}

if (!canEdit) { lockForm($('basicForm')); $('lockedMessage').classList.remove('hidden'); }

async function lookupAddress() {
  hide($('pageError'));
  const postal = $('postalCode').value.replace(/-/g,'').trim();
  if (!/^\d{7}$/.test(postal)) return show($('pageError'),'郵便番号は7桁の数字で入力してください。');
  const btn = $('lookupPostal');
  btn.disabled = true; btn.textContent = '検索中…';
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${encodeURIComponent(postal)}`);
    if (!res.ok) throw new Error('postal lookup failed');
    const json = await res.json();
    const row = json.results?.[0];
    if (!row) return show($('pageError'),'郵便番号に該当する住所が見つかりませんでした。');
    $('address').value = `${row.address1 || ''}${row.address2 || ''}${row.address3 || ''}`;
    $('address').focus();
  } catch {
    show($('pageError'),'住所を自動取得できませんでした。住所は手入力できます。');
  } finally { btn.disabled = !canEdit; btn.textContent = '郵便番号から住所を検索'; }
}
$('lookupPostal').onclick = lookupAddress;
$('postalCode').addEventListener('input', () => {
  const postal = $('postalCode').value.replace(/-/g,'').trim();
  if (postal.length === 7 && /^\d{7}$/.test(postal) && canEdit) lookupAddress();
});

$('basicForm').onsubmit = async e => {
  e.preventDefault(); hide($('pageError')); hide($('pageSuccess'));
  if (!canEdit) return show($('pageError'),'現在は編集できません。');
  const postal = $('postalCode').value.replace(/-/g,'').trim();
  if (!/^\d{7}$/.test(postal)) return show($('pageError'),'郵便番号は7桁の数字で入力してください。');
  const payload = {
    staff_assignment_id: assignment.id,
    name_kana: $('nameKana').value.trim(), postal_code: postal, address: $('address').value.trim(),
    household_head_name: $('householdHeadName').value.trim(), relationship_to_household_head: $('relationship').value.trim(),
    updated_at: new Date().toISOString()
  };
  if ([payload.name_kana,payload.address,payload.household_head_name,payload.relationship_to_household_head].some(v => !v)) return show($('pageError'),'未入力の項目があります。');
  try {
    await saveAndReturn($('saveBasic'), async()=>{
      const { error } = await supabase.from('staff_basic_info').upsert(payload,{onConflict:'staff_assignment_id'});
      if (error) throw error;
      await markSectionComplete(assignment.id,'basic');
    });
  } catch (err) { show($('pageError'),err.message); }
};
bindLogout();
