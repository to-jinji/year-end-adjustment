import { supabase } from './supabase.js';
const YEAR=2026,$=id=>document.getElementById(id);const show=(el,msg)=>{el.textContent=msg;el.style.display='block'};const hide=el=>{el.style.display='none';el.textContent=''};
const {data:{user}}=await supabase.auth.getUser();if(!user)location.href='./login.html';
const [{data:assignment,error:aError},{data:settings}]=await Promise.all([
  supabase.from('staff_assignments').select('id,status,editable_until_override,staff_members!inner(display_name,birth_date)').eq('auth_user_id',user.id).eq('year',YEAR).single(),
  supabase.from('year_settings').select('default_editable_until').eq('year',YEAR).single()
]);
if(aError||!assignment){show($('pageError'),'対象データを取得できません。');$('basicForm').classList.add('hidden');throw new Error('assignment not found');}
const deadline=assignment.editable_until_override||settings?.default_editable_until;const canEdit=!!deadline&&new Date()<=new Date(deadline)&&['入力中','修正依頼'].includes(assignment.status);
$('deadline').textContent=deadline?`編集期限：${new Date(deadline).toLocaleString('ja-JP')}`:'編集期限：未設定';$('displayName').value=assignment.staff_members.display_name||'';$('birthDate').value=assignment.staff_members.birth_date?new Date(`${assignment.staff_members.birth_date}T00:00:00`).toLocaleDateString('ja-JP'):'';
const {data:basic}=await supabase.from('staff_basic_info').select('name_kana,postal_code,address,household_head_name,relationship_to_household_head').eq('staff_assignment_id',assignment.id).maybeSingle();
if(basic){$('nameKana').value=basic.name_kana||'';$('postalCode').value=basic.postal_code||'';$('address').value=basic.address||'';$('householdHeadName').value=basic.household_head_name||'';$('relationship').value=basic.relationship_to_household_head||'';}
if(!canEdit){for(const el of $('basicForm').querySelectorAll('input:not([readonly]),textarea,button[type="submit"]'))el.disabled=true;$('lockedMessage').classList.remove('hidden');}
$('basicForm').onsubmit=async e=>{e.preventDefault();hide($('pageError'));hide($('pageSuccess'));if(!canEdit)return show($('pageError'),'現在は編集できません。');const postal=$('postalCode').value.replace(/-/g,'').trim();if(!/^\d{7}$/.test(postal))return show($('pageError'),'郵便番号は7桁の数字で入力してください。');const payload={staff_assignment_id:assignment.id,name_kana:$('nameKana').value.trim(),postal_code:postal,address:$('address').value.trim(),household_head_name:$('householdHeadName').value.trim(),relationship_to_household_head:$('relationship').value.trim(),updated_at:new Date().toISOString()};if(Object.values(payload).slice(1,6).some(v=>!v))return show($('pageError'),'未入力の項目があります。');const {error}=await supabase.from('staff_basic_info').upsert(payload,{onConflict:'staff_assignment_id'});if(error)return show($('pageError'),error.message);show($('pageSuccess'),'基本情報を保存しました。');};
$('logout').onclick=async()=>{await supabase.auth.signOut();location.href='./login.html'};
