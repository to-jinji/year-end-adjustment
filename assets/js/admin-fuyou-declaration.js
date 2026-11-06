import {supabase} from './supabase.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>Number(v||0).toLocaleString('ja-JP');
const id=new URLSearchParams(location.search).get('id');
if(!id)location.replace('./index.html');

const {data:{user}}=await supabase.auth.getUser();
if(!user)location.replace('./login.html');
const {data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if(aal?.currentLevel!=='aal2')location.replace('./login.html');
const {data:admin}=await supabase.from('admin_users').select('auth_user_id').eq('auth_user_id',user.id).maybeSingle();
if(!admin){await supabase.auth.signOut();location.replace('./login.html')}

$('logout').onclick=async()=>{await supabase.auth.signOut();location.replace('./login.html?force=1')};

const [{data:a,error:ae},{data:basic},{data:income},{data:spouse},{data:deps},{data:confirmation}]=await Promise.all([
  supabase.from('staff_assignments').select('id,status,staff_members!inner(staff_id,display_name,birth_date)').eq('id',id).single(),
  supabase.from('staff_basic_info').select('*').eq('staff_assignment_id',id).maybeSingle(),
  supabase.from('staff_income_info').select('*').eq('staff_assignment_id',id).maybeSingle(),
  supabase.from('staff_spouse_info').select('*').eq('staff_assignment_id',id).maybeSingle(),
  supabase.from('staff_dependents').select('*').eq('staff_assignment_id',id).order('birth_date'),
  supabase.from('staff_fuyou_declaration_confirmations').select('confirmed_at').eq('staff_assignment_id',id).maybeSingle()
]);
if(ae){$('pageError').textContent=ae.message;$('pageError').style.display='block';throw ae}

$('staffMeta').textContent=`${a.staff_members.staff_id} ${a.staff_members.display_name} / ${a.status}`;
$('confirmedAt').textContent=confirmation?.confirmed_at?`最終確認：${new Date(confirmation.confirmed_at).toLocaleString('ja-JP')}`:'扶養控除等申告書はまだ確認されていません。';

const spouseText=spouse?.has_spouse
 ? `${spouse.spouse_name||''} / ${spouse.birth_date||''} / 所得見積 ${yen(spouse.estimated_income)}円`
 : 'なし';

const depHtml=(deps||[]).length?(deps||[]).map(d=>`<div class="dep-view"><strong>${esc(d.name)}</strong>（${esc(d.relationship)}）<br>
生年月日：${esc(d.birth_date||'')} / 所得見積：${yen(d.estimated_income)}円 / 障害者区分：${esc(d.disability_category||'なし')} / 扶養親族区分：${esc(d.dependent_category||'該当なし')}<br>
${d.nonresident?`非居住者：${esc(d.nonresident_reason||'')} / 送金額等 ${yen(d.livelihood_support_amount)}円<br>`:''}
${d.other_income_earner_claims?`他の所得者が控除：${esc(d.other_income_earner_name||'')} / ${esc(d.other_income_earner_relationship||'')}<br>`:''}
${d.has_retirement_income?`退職手当等あり / 退職所得を除く所得見積 ${yen(d.retirement_income_estimate)}円 / 障害者区分 ${esc(d.retirement_disability_category||'なし')} / 寡婦・ひとり親 ${esc(d.retirement_widow_single_parent||'なし')}<br>`:''}
${d.change_date?`異動：${esc(d.change_date)} ${esc(d.change_reason||'')}`:''}</div>`).join(''):'<p class="muted">扶養親族なし</p>';

$('declarationView').innerHTML=`
<section><h2>本人情報</h2><dl class="kv">
<dt>氏名</dt><dd>${esc(a.staff_members.display_name)}</dd>
<dt>生年月日</dt><dd>${esc(a.staff_members.birth_date||'')}</dd>
<dt>フリガナ</dt><dd>${esc(basic?.name_kana||'')}</dd>
<dt>住所</dt><dd>${esc((basic?.postal_code?basic.postal_code+' ':'')+(basic?.address||''))}</dd>
<dt>世帯主</dt><dd>${esc(basic?.household_head_name||'')} / 続柄 ${esc(basic?.relationship_to_household_head||'')}</dd>
</dl></section>
<section><h2>本人の申告事項</h2><dl class="kv">
<dt>障害者区分</dt><dd>${esc(income?.disability_category||'なし')}</dd>
<dt>寡婦・ひとり親</dt><dd>${esc(income?.widow_single_parent||'なし')}</dd>
<dt>勤労学生</dt><dd>${income?.working_student?'該当':'該当なし'}</dd>
<dt>障害者・勤労学生の内容</dt><dd>${esc(income?.disability_student_detail||'')}</dd><dt>本人の異動</dt><dd>${esc(income?.self_change_date||'')} ${esc(income?.self_change_reason||'')}</dd>
</dl></section>
<section><h2>配偶者</h2><p>${esc(spouseText)}</p>
${spouse?.has_spouse?`<dl class="kv"><dt>障害者区分</dt><dd>${esc(spouse.disability_category||'なし')}</dd><dt>非居住者</dt><dd>${spouse.nonresident?'該当':'該当なし'}</dd><dt>送金額等</dt><dd>${yen(spouse.livelihood_support_amount)}円</dd><dt>異動</dt><dd>${esc(spouse.change_date||'')} ${esc(spouse.change_reason||'')}</dd><dt>退職手当等</dt><dd>${spouse.has_retirement_income?'あり':'なし'}${spouse.has_retirement_income?` / 障害者区分 ${esc(spouse.retirement_disability_category||'なし')} / 寡婦・ひとり親 ${esc(spouse.retirement_widow_single_parent||'なし')}`:''}</dd></dl>`:''}
</section>
<section><h2>扶養親族</h2>${depHtml}</section>`;
