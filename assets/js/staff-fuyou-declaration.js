import { supabase, $, show, hide, requireStaffContext, bindLogout, bindYenInput, setYenInput, parseYenInput, markSectionComplete, finishPageLoading } from './staff-common.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ctx, dependents=[], deletedDependentIds=[];

function depDefaults(){
  return {
    id:null,_key:crypto.randomUUID(),name:'',name_kana:'',birth_date:'',relationship:'',
    estimated_income:0,living_together:true,address:'',nonresident:false,disability_category:'なし',
    nonresident_reason:'該当なし',livelihood_support_amount:0,change_date:null,change_reason:'',
    other_income_earner_claims:false,other_income_earner_name:'',other_income_earner_relationship:'',
    other_income_earner_address:'',resident_tax_excluded_foreign_dependent:false,
    has_retirement_income:false,retirement_income_estimate:0
  };
}

function renderDependents(){
  const host=$('dependentsContainer');
  if(!dependents.length){
    host.innerHTML='<p class="muted">扶養親族の登録はありません。</p>';
    return;
  }
  host.innerHTML=dependents.map((d,i)=>`
    <div class="dependent-declaration-card" data-dep-key="${d._key||d.id}">
      <div class="dependent-card-head"><strong>扶養親族 ${i+1}</strong><button type="button" class="btn tiny secondary" data-remove-dep="${d._key||d.id}">削除</button></div>
      <input type="hidden" data-f="id" value="${esc(d.id||'')}">
      <div class="declaration-grid">
        <div class="field"><label>氏名 <span class="field-badge required">必須</span></label><input data-f="name" value="${esc(d.name)}"></div>
        <div class="field"><label>フリガナ</label><input data-f="name_kana" value="${esc(d.name_kana)}"></div>
        <div class="field"><label>生年月日 <span class="field-badge required">必須</span></label><input data-f="birth_date" type="date" value="${esc(d.birth_date||'')}"></div>
        <div class="field"><label>続柄 <span class="field-badge required">必須</span></label><input data-f="relationship" value="${esc(d.relationship)}"></div>
        <div class="field"><label>所得見積額（円）</label><input data-f="estimated_income" class="dep-yen" type="text" inputmode="numeric" value="${Number(d.estimated_income||0)>0?Number(d.estimated_income).toLocaleString('ja-JP'):''}"></div>
        <div class="field"><label>障害者区分</label><select data-f="disability_category"><option ${d.disability_category==='なし'?'selected':''}>なし</option><option ${d.disability_category==='一般障害者'?'selected':''}>一般障害者</option><option ${d.disability_category==='特別障害者'?'selected':''}>特別障害者</option></select></div>
      </div>
      <label class="inline-check"><input data-f="living_together" type="checkbox" ${d.living_together?'checked':''}> 同居している</label>
      <label class="inline-check"><input data-f="nonresident" type="checkbox" ${d.nonresident?'checked':''}> 非居住者に該当する</label>
      <div class="field"><label>別居の場合の住所</label><textarea data-f="address" rows="2">${esc(d.address)}</textarea></div>
      <div class="declaration-grid">
        <div class="field"><label>非居住者区分</label><select data-f="nonresident_reason">
          ${['該当なし','16歳以上30歳未満又は70歳以上','留学','障害者','38万円以上の支払'].map(x=>`<option ${d.nonresident_reason===x?'selected':''}>${x}</option>`).join('')}
        </select></div>
        <div class="field"><label>生計を一にする事実（送金額等・円）</label><input data-f="livelihood_support_amount" class="dep-yen" type="text" inputmode="numeric" value="${Number(d.livelihood_support_amount||0)>0?Number(d.livelihood_support_amount).toLocaleString('ja-JP'):''}"></div>
        <div class="field"><label>異動年月日</label><input data-f="change_date" type="date" value="${esc(d.change_date||'')}"></div>
        <div class="field"><label>異動事由</label><input data-f="change_reason" value="${esc(d.change_reason)}"></div>
      </div>
      <label class="inline-check"><input data-f="other_income_earner_claims" type="checkbox" ${d.other_income_earner_claims?'checked':''}> この親族について他の所得者が控除を受ける</label>
      <div class="declaration-grid">
        <div class="field"><label>他の所得者の氏名</label><input data-f="other_income_earner_name" value="${esc(d.other_income_earner_name)}"></div>
        <div class="field"><label>あなたとの続柄</label><input data-f="other_income_earner_relationship" value="${esc(d.other_income_earner_relationship)}"></div>
      </div>
      <div class="field"><label>他の所得者の住所又は居所</label><textarea data-f="other_income_earner_address" rows="2">${esc(d.other_income_earner_address)}</textarea></div>
      <label class="inline-check"><input data-f="resident_tax_excluded_foreign_dependent" type="checkbox" ${d.resident_tax_excluded_foreign_dependent?'checked':''}> 16歳未満の控除対象外国外扶養親族に該当する</label>
      <label class="inline-check"><input data-f="has_retirement_income" type="checkbox" ${d.has_retirement_income?'checked':''}> 令和8年中に退職手当等を有する</label>
      <div class="field"><label>退職所得を除く所得見積額（円）</label><input data-f="retirement_income_estimate" class="dep-yen" type="text" inputmode="numeric" value="${Number(d.retirement_income_estimate||0)>0?Number(d.retirement_income_estimate).toLocaleString('ja-JP'):''}"></div>
    </div>`).join('');
  host.querySelectorAll('.dep-yen').forEach(bindYenInput);
  if(!ctx.canEdit){
    host.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
  }
}

function readDependentCards(){
  return [...document.querySelectorAll('[data-dep-key]')].map(card=>{
    const get=f=>card.querySelector(`[data-f="${f}"]`);
    const checked=f=>!!get(f)?.checked;
    return {
      id:get('id')?.value||null,
      name:get('name').value.trim(),
      name_kana:get('name_kana').value.trim(),
      birth_date:get('birth_date').value,
      relationship:get('relationship').value.trim(),
      estimated_income:parseYenInput(get('estimated_income').value),
      living_together:checked('living_together'),
      address:get('address').value.trim(),
      nonresident:checked('nonresident'),
      disability_category:get('disability_category').value,
      nonresident_reason:checked('nonresident')?get('nonresident_reason').value:'該当なし',
      livelihood_support_amount:checked('nonresident')?parseYenInput(get('livelihood_support_amount').value):0,
      change_date:get('change_date').value||null,
      change_reason:get('change_reason').value.trim(),
      other_income_earner_claims:checked('other_income_earner_claims'),
      other_income_earner_name:checked('other_income_earner_claims')?get('other_income_earner_name').value.trim():'',
      other_income_earner_relationship:checked('other_income_earner_claims')?get('other_income_earner_relationship').value.trim():'',
      other_income_earner_address:checked('other_income_earner_claims')?get('other_income_earner_address').value.trim():'',
      resident_tax_excluded_foreign_dependent:checked('nonresident')&&checked('resident_tax_excluded_foreign_dependent'),
      has_retirement_income:checked('has_retirement_income'),
      retirement_income_estimate:checked('has_retirement_income')?parseYenInput(get('retirement_income_estimate').value):0
    };
  });
}

function toggleSpouse(){
  const has=$('hasSpouse').value==='yes';
  $('spouseFields').classList.toggle('hidden',!has);
}
function toggleSpouseConditional(){
  $('spouseNonresidentFields').classList.toggle('hidden',!$('spouseNonresident').checked);
  $('spouseRetirementFields').classList.toggle('hidden',!$('spouseHasRetirementIncome').checked);
}

async function recordConfirmation(){
  const now=new Date().toISOString();
  const {error}=await supabase.from('staff_fuyou_declaration_confirmations').upsert({
    staff_assignment_id:ctx.assignment.id,confirmed_at:now,updated_at:now
  },{onConflict:'staff_assignment_id'});
  if(error)throw error;
}

try{
  ctx=await requireStaffContext();
  const {assignment,canEdit}=ctx;
  $('displayName').value=assignment.staff_members.display_name||'';
  $('birthDate').value=assignment.staff_members.birth_date||'';
  bindYenInput($('spouseIncome'));
  bindYenInput($('spouseLivelihoodSupport'));
  bindYenInput($('spouseRetirementIncome'));

  const [{data:basic,error:basicError},{data:income,error:incomeError},{data:spouse,error:spouseError},{data:deps,error:depsError},{data:confirmation}]=await Promise.all([
    supabase.from('staff_basic_info').select('*').eq('staff_assignment_id',assignment.id).maybeSingle(),
    supabase.from('staff_income_info').select('*').eq('staff_assignment_id',assignment.id).maybeSingle(),
    supabase.from('staff_spouse_info').select('*').eq('staff_assignment_id',assignment.id).maybeSingle(),
    supabase.from('staff_dependents').select('*').eq('staff_assignment_id',assignment.id).order('birth_date'),
    supabase.from('staff_fuyou_declaration_confirmations').select('confirmed_at').eq('staff_assignment_id',assignment.id).maybeSingle()
  ]);
  if(basicError||incomeError||spouseError||depsError)throw basicError||incomeError||spouseError||depsError;

  if(basic){
    $('nameKana').value=basic.name_kana||'';
    $('postalCode').value=basic.postal_code||'';
    $('address').value=basic.address||'';
    $('householdHeadName').value=basic.household_head_name||'';
    $('relationship').value=basic.relationship_to_household_head||'';
  }
  if(income){
    $('selfDisability').value=income.disability_category||'なし';
    $('widowSingleParent').value=income.widow_single_parent||'なし';
    $('workingStudent').checked=!!income.working_student;
    $('secondaryDependentDeclarationSubmitted').checked=!!income.secondary_dependent_declaration_submitted;
    $('disabilityStudentDetail').value=income.disability_student_detail||'';
  }
  if(spouse){
    $('hasSpouse').value=spouse.has_spouse?'yes':'no';
    $('spouseName').value=spouse.spouse_name||'';
    $('spouseKana').value=spouse.spouse_name_kana||'';
    $('spouseBirth').value=spouse.birth_date||'';
    setYenInput($('spouseIncome'),spouse.estimated_income);
    $('spouseLiving').checked=!!spouse.living_together;
    $('spouseNonresident').checked=!!spouse.nonresident;
    $('spouseAddress').value=spouse.address||'';
    setYenInput($('spouseLivelihoodSupport'),spouse.livelihood_support_amount);
    $('spouseChangeDate').value=spouse.change_date||'';
    $('spouseChangeReason').value=spouse.change_reason||'';
    $('spouseHasRetirementIncome').checked=!!spouse.has_retirement_income;
    setYenInput($('spouseRetirementIncome'),spouse.retirement_income_estimate);
  }
  dependents=(deps||[]).map(d=>({...d,_key:d.id}));
  renderDependents();
  toggleSpouse();toggleSpouseConditional();
  if(confirmation?.confirmed_at)$('confirmedInfo').textContent=`前回確認：${new Date(confirmation.confirmed_at).toLocaleString('ja-JP')}`;

  $('hasSpouse').onchange=toggleSpouse;
  $('spouseNonresident').onchange=toggleSpouseConditional;
  $('spouseHasRetirementIncome').onchange=toggleSpouseConditional;

  $('addDependent').onclick=()=>{
    if(!ctx.canEdit)return;
    dependents.push(depDefaults());
    renderDependents();
    document.querySelector('[data-dep-key]:last-child')?.scrollIntoView({behavior:'smooth',block:'center'});
  };

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-remove-dep]');
    if(!btn||!ctx.canEdit)return;
    const key=btn.dataset.removeDep;
    const row=dependents.find(d=>(d._key||d.id)===key);
    if(row?.id)deletedDependentIds.push(row.id);
    dependents=dependents.filter(d=>(d._key||d.id)!==key);
    renderDependents();
  });

  if(!canEdit){
    $('readonlyNotice').classList.remove('hidden');
    $('declarationForm').querySelectorAll('input:not([readonly]),select,textarea').forEach(el=>el.disabled=true);
    $('addDependent').disabled=true;
    $('saveDeclaration').textContent='内容を確認して年末調整へ';
  }

  $('declarationForm').onsubmit=async e=>{
    e.preventDefault();hide($('pageError'));
    const btn=$('saveDeclaration'),original=btn.textContent;
    btn.disabled=true;btn.textContent=ctx.canEdit?'保存中…':'確認中…';
    try{
      if(ctx.canEdit){
        const postal=$('postalCode').value.replace(/-/g,'').trim();
        if(!/^\d{7}$/.test(postal))throw new Error('郵便番号は7桁の数字で入力してください。');
        const basicPayload={
          staff_assignment_id:assignment.id,
          name_kana:$('nameKana').value.trim(),
          postal_code:postal,address:$('address').value.trim(),
          household_head_name:$('householdHeadName').value.trim(),
          relationship_to_household_head:$('relationship').value.trim(),
          updated_at:new Date().toISOString()
        };
        if(!basicPayload.name_kana||!basicPayload.address||!basicPayload.household_head_name||!basicPayload.relationship_to_household_head){
          throw new Error('本人情報の必須項目を入力してください。');
        }
        const hasSpouse=$('hasSpouse').value==='yes';
        if(hasSpouse&&(!$('spouseName').value.trim()||!$('spouseBirth').value))throw new Error('配偶者の氏名と生年月日を入力してください。');

        const depRows=readDependentCards();
        for(const d of depRows){
          if(!d.name||!d.birth_date||!d.relationship)throw new Error('扶養親族の氏名・生年月日・続柄を入力してください。');
        }

        const incomePayload={
          staff_assignment_id:assignment.id,
          disability_category:$('selfDisability').value,
          widow_single_parent:$('widowSingleParent').value,
          working_student:$('workingStudent').checked,
          secondary_dependent_declaration_submitted:$('secondaryDependentDeclarationSubmitted').checked,
          disability_student_detail:$('disabilityStudentDetail').value.trim(),
          updated_at:new Date().toISOString()
        };
        const spousePayload={
          staff_assignment_id:assignment.id,has_spouse:hasSpouse,
          spouse_name:hasSpouse?$('spouseName').value.trim():'',
          spouse_name_kana:hasSpouse?$('spouseKana').value.trim():'',
          birth_date:hasSpouse?($('spouseBirth').value||null):null,
          estimated_income:hasSpouse?parseYenInput($('spouseIncome').value):0,
          living_together:hasSpouse?$('spouseLiving').checked:false,
          address:hasSpouse?$('spouseAddress').value.trim():'',
          nonresident:hasSpouse?$('spouseNonresident').checked:false,
          livelihood_support_amount:hasSpouse&&$('spouseNonresident').checked?parseYenInput($('spouseLivelihoodSupport').value):0,
          change_date:hasSpouse?($('spouseChangeDate').value||null):null,
          change_reason:hasSpouse?$('spouseChangeReason').value.trim():'',
          has_retirement_income:hasSpouse?$('spouseHasRetirementIncome').checked:false,
          retirement_income_estimate:hasSpouse&&$('spouseHasRetirementIncome').checked?parseYenInput($('spouseRetirementIncome').value):0,
          updated_at:new Date().toISOString()
        };

        const [{error:be},{error:ie},{error:se}]=await Promise.all([
          supabase.from('staff_basic_info').upsert(basicPayload,{onConflict:'staff_assignment_id'}),
          supabase.from('staff_income_info').upsert(incomePayload,{onConflict:'staff_assignment_id'}),
          supabase.from('staff_spouse_info').upsert(spousePayload,{onConflict:'staff_assignment_id'})
        ]);
        if(be||ie||se)throw be||ie||se;

        for(const depId of deletedDependentIds){
          const {error}=await supabase.from('staff_dependents').delete().eq('id',depId);
          if(error)throw error;
        }
        for(const d of depRows){
          const payload={...d,staff_assignment_id:assignment.id,updated_at:new Date().toISOString()};
          delete payload.id;
          if(d.id){
            const {error}=await supabase.from('staff_dependents').update(payload).eq('id',d.id);
            if(error)throw error;
          }else{
            const {error}=await supabase.from('staff_dependents').insert(payload);
            if(error)throw error;
          }
        }
        await Promise.all([
          markSectionComplete(assignment.id,'basic'),
          markSectionComplete(assignment.id,'spouse_dependents')
        ]);
      }
      await recordConfirmation();
      location.replace('./index.html');
    }catch(err){
      show($('pageError'),err.message||'保存に失敗しました。');
      btn.disabled=false;btn.textContent=original;
    }
  };
  bindLogout();
}catch(err){
  console.error(err);
  show($('pageError'),err.message||'扶養控除等申告書を読み込めませんでした。');
}finally{
  finishPageLoading();
}
