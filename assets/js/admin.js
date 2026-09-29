import {supabase} from './supabase.js';
const YEAR=2026;
const $=id=>document.getElementById(id);

// ログアウトは最優先で有効化する。認証初期化が失敗してもこのボタンは動作する。
$('logout').onclick=async()=>{
  try{await supabase.auth.signOut()}catch{}
  location.replace('./login.html?force=1');
};

const delayReject=(ms,message)=>new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms));
const withTimeout=(promise,ms=10000,message='認証確認がタイムアウトしました。')=>Promise.race([promise,delayReject(ms,message)]);
let adminReady=false;

async function ensureAdminAuth(){
  try{
    let {data:{session}}=await withTimeout(supabase.auth.getSession(),8000,'ログイン状態の確認がタイムアウトしました。');
    if(!session){location.replace('./login.html');return false}
    // MFA完了後のAAL2 JWTをPostgREST/RLSでも確実に使うためセッションを更新する。
    const {data:refreshed,error:refreshError}=await withTimeout(supabase.auth.refreshSession(),10000,'セッション更新がタイムアウトしました。');
    if(refreshError)throw refreshError;
    session=refreshed?.session||session;
    const {data:aal,error:aalError}=await withTimeout(supabase.auth.mfa.getAuthenticatorAssuranceLevel(),8000,'2段階認証状態の確認がタイムアウトしました。');
    if(aalError)throw aalError;
    if(aal?.currentLevel!=='aal2'){location.replace('./login.html');return false}
    const {data:authStatus,error:authStatusError}=await withTimeout(
      supabase.functions.invoke('staff-auth',{body:{action:'admin-auth-status'}}),
      10000,
      '管理者権限の確認がタイムアウトしました。'
    );
    if(authStatusError||!authStatus?.ok){
      try{await supabase.auth.signOut()}catch{}
      location.replace('./login.html?force=1');
      return false;
    }
    if(!authStatus.mfa_verified){location.replace('./login.html');return false}
    adminReady=true;
    return true;
  }catch(err){
    console.error('admin auth init failed',err);
    const box=$('adminInitError');
    if(box){box.textContent='管理者認証の確認に失敗しました。再ログインしてください。';box.style.display='block'}
    return false;
  }
}

const show=(el,msg)=>{el.textContent=msg;el.style.display='block'};
const hide=el=>{el.style.display='none';el.textContent=''};
const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toLocalInput=iso=>{const d=new Date(iso);if(Number.isNaN(d.getTime()))return'';const p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
const localToIso=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))throw new Error('日時を確認してください。');return d.toISOString()};
const yen=v=>Number(v||0).toLocaleString('ja-JP');
let commonDeadline='';
let currentAdjustmentId='';
let staffRows=[];

async function loadSettings(){
  const {data,error}=await supabase.from('year_settings').select('default_editable_until').eq('year',YEAR).single();
  if(error){show($('settingsError'),'共通編集期限を取得できません。');return;}
  commonDeadline=data.default_editable_until;$('commonDeadline').value=toLocalInput(commonDeadline);
}

const payrollOf=r=>Array.isArray(r.staff_payroll_totals)?r.staff_payroll_totals[0]:r.staff_payroll_totals;
const effectiveDeadline=r=>r.editable_until_override||commonDeadline||'';
function renderRows(rows){
  $('rows').innerHTML=rows.map(r=>{
    const effective=effectiveDeadline(r);const deadline=effective?new Date(effective).toLocaleString('ja-JP'):'未設定';const overrideBadge=r.editable_until_override?'<span class="mini-badge">個別</span>':'';
    const pwBtn=r.password_set?`<button class="btn tiny reset-pw" data-assignment="${r.id}" data-name="${escapeHtml(r.staff_members.display_name)}">PW再発行</button>`:'<span class="muted">初回設定前</span>';
    const calculated=!!payrollOf(r)?.calculated_at;const calcBadge=calculated?'<div class="mini-badge" style="margin-bottom:6px">計算済み</div>':'<div class="muted" style="font-size:12px;margin-bottom:6px">未計算</div>';
    return `<tr><td><input class="adjustment-select" type="checkbox" data-assignment="${r.id}" data-staff-id="${escapeHtml(r.staff_members.staff_id)}" data-name="${escapeHtml(r.staff_members.display_name)}" aria-label="${escapeHtml(r.staff_members.display_name)}を選択"></td><td>${escapeHtml(r.staff_members.staff_id)}</td><td>${escapeHtml(r.staff_members.display_name)}</td><td>${escapeHtml(r.status)}</td><td>${r.password_set?'設定済':'未設定'}</td><td><div>${deadline} ${overrideBadge}</div><div class="deadline-actions"><input class="deadline-input" data-assignment="${r.id}" type="datetime-local" value="${r.editable_until_override?toLocalInput(r.editable_until_override):''}" aria-label="個別編集期限"><button class="btn secondary tiny save-deadline" data-assignment="${r.id}">個別設定</button>${r.editable_until_override?`<button class="btn link-btn tiny clear-deadline" data-assignment="${r.id}">共通に戻す</button>`:''}</div></td><td>${calcBadge}<button class="btn tiny adjustment-btn" data-assignment="${r.id}" data-staff-id="${escapeHtml(r.staff_members.staff_id)}" data-name="${escapeHtml(r.staff_members.display_name)}">給与・計算</button></td><td><div class="action-stack">${pwBtn}<a class="btn secondary tiny" href="./staff-edit.html?id=${r.id}">回答修正</a><button class="btn danger tiny delete-staff" data-assignment="${r.id}" data-staff-id="${escapeHtml(r.staff_members.staff_id)}" data-name="${escapeHtml(r.staff_members.display_name)}">削除</button></div></td></tr>`;
  }).join('');
  if(!rows.length)$('rows').innerHTML='<tr><td colspan="8" class="muted">条件に一致するスタッフはいません。</td></tr>';
  updateSelectionCount();
}

function applyListControls(){
  document.querySelectorAll('.adjustment-select').forEach(cb=>cb.checked=false);
  const q=($('staffSearch').value||'').trim().toLowerCase();
  const status=$('statusFilter').value;const pw=$('passwordFilter').value;const adj=$('adjustmentFilter').value;
  let rows=staffRows.filter(r=>{
    const sid=String(r.staff_members.staff_id||'').toLowerCase();const name=String(r.staff_members.display_name||'').toLowerCase();
    if(q&&!sid.includes(q)&&!name.includes(q))return false;
    if(status&&r.status!==status)return false;
    if(pw==='set'&&!r.password_set)return false;if(pw==='unset'&&r.password_set)return false;
    const calculated=!!payrollOf(r)?.calculated_at;if(adj==='calculated'&&!calculated)return false;if(adj==='uncalculated'&&calculated)return false;
    return true;
  });
  const sort=$('staffSort').value;const deadlineValue=r=>{const v=effectiveDeadline(r);const t=v?new Date(v).getTime():Number.MAX_SAFE_INTEGER;return Number.isNaN(t)?Number.MAX_SAFE_INTEGER:t};
  rows.sort((a,b)=>{
    if(sort==='id_desc')return String(b.staff_members.staff_id).localeCompare(String(a.staff_members.staff_id),'ja',{numeric:true});
    if(sort==='name_asc')return String(a.staff_members.display_name).localeCompare(String(b.staff_members.display_name),'ja');
    if(sort==='name_desc')return String(b.staff_members.display_name).localeCompare(String(a.staff_members.display_name),'ja');
    if(sort==='status_asc')return String(a.status).localeCompare(String(b.status),'ja')||String(a.staff_members.staff_id).localeCompare(String(b.staff_members.staff_id),'ja',{numeric:true});
    if(sort==='deadline_asc')return deadlineValue(a)-deadlineValue(b);
    if(sort==='deadline_desc')return deadlineValue(b)-deadlineValue(a);
    if(sort==='calculated_first')return Number(!!payrollOf(b)?.calculated_at)-Number(!!payrollOf(a)?.calculated_at)||String(a.staff_members.staff_id).localeCompare(String(b.staff_members.staff_id),'ja',{numeric:true});
    return String(a.staff_members.staff_id).localeCompare(String(b.staff_members.staff_id),'ja',{numeric:true});
  });
  renderRows(rows);
}

async function load(){
  let {data,error}=await supabase.from('staff_assignments').select('id,status,password_set,editable_until_override,staff_members!inner(staff_id,display_name),staff_payroll_totals(calculated_at)').eq('year',YEAR);
  if(error){show($('bulkAdjustmentError'),'スタッフ一覧を取得できません。再ログインしてお試しください。');return;}
  // RLSは権限不足時に0件を返すことがあるため、AAL2なのに0件なら一度だけJWTを更新して再取得する。
  if((data||[]).length===0){
    try{
      const {data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(aal?.currentLevel==='aal2'){
        await supabase.auth.refreshSession();
        const retry=await supabase.from('staff_assignments').select('id,status,password_set,editable_until_override,staff_members!inner(staff_id,display_name),staff_payroll_totals(calculated_at)').eq('year',YEAR);
        data=retry.data;error=retry.error;
      }
    }catch{}
  }
  if(error){show($('bulkAdjustmentError'),'スタッフ一覧を取得できません。再ログインしてお試しください。');return;}
  staffRows=data||[];
  const current=$('statusFilter').value;const statuses=[...new Set(staffRows.map(r=>r.status).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
  $('statusFilter').innerHTML='<option value="">すべて</option>'+statuses.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if(statuses.includes(current))$('statusFilter').value=current;
  applyListControls();
}

function selectedAdjustmentRows(){return [...document.querySelectorAll('.adjustment-select:checked')].map(el=>({assignment_id:el.dataset.assignment,staff_id:el.dataset.staffId,name:el.dataset.name}))}
function updateSelectionCount(){const all=[...document.querySelectorAll('.adjustment-select')];const selected=all.filter(el=>el.checked);if($('selectedCount'))$('selectedCount').textContent=`${selected.length}名選択中`;if($('selectAllAdjustments')){$('selectAllAdjustments').checked=all.length>0&&selected.length===all.length;$('selectAllAdjustments').indeterminate=selected.length>0&&selected.length<all.length}}

$('saveCommonDeadline').onclick=async()=>{hide($('settingsSuccess'));hide($('settingsError'));try{const editable_until=localToIso($('commonDeadline').value);const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-update-common-deadline',year:YEAR,editable_until}});if(error||!data?.ok)throw new Error(data?.message||error?.message||'保存に失敗しました。');commonDeadline=editable_until;show($('settingsSuccess'),'共通編集期限を保存しました。');await load();}catch(e){show($('settingsError'),e.message)}};
$('newStaff').onclick=()=>{$('register').classList.toggle('hidden');$('csvRegister').classList.add('hidden');$('payrollCsvRegister').classList.add('hidden')};
$('csvStaff').onclick=()=>{$('csvRegister').classList.toggle('hidden');$('register').classList.add('hidden');$('payrollCsvRegister').classList.add('hidden')};
$('csvPayroll').onclick=()=>{$('payrollCsvRegister').classList.toggle('hidden');$('register').classList.add('hidden');$('csvRegister').classList.add('hidden')};
$('staffForm').onsubmit=async e=>{e.preventDefault();const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-register',year:YEAR,staff_id:$('staffId').value.trim(),display_name:$('name').value.trim(),birth_date:$('dob').value}});if(error||!data?.ok)return alert(data?.message||error?.message||'登録に失敗しました。');e.target.reset();await load()};

function parseCsv(text){const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++}else if(ch==='"')quoted=false;else field+=ch}else{if(ch==='"')quoted=true;else if(ch===','){row.push(field);field=''}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}else field+=ch}}if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row)}return rows.filter(r=>r.some(v=>v.trim()!==''))}
$('downloadTemplate').onclick=()=>{const csv='staff_id,display_name,birth_date\r\n"0001","山田 太郎","1990-01-01"\r\n';const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='staff_import_template.csv';a.click();URL.revokeObjectURL(a.href)};
$('importCsv').onclick=async()=>{hide($('csvError'));hide($('csvSuccess'));const file=$('csvFile').files[0];if(!file)return show($('csvError'),'CSVファイルを選択してください。');const rows=parseCsv(await file.text());if(rows.length<2)return show($('csvError'),'登録するデータがありません。');const header=rows[0].map(v=>v.trim().toLowerCase());const required=['staff_id','display_name','birth_date'];if(required.some((h,i)=>header[i]!==h)||header.length!==3)return show($('csvError'),'1行目は staff_id,display_name,birth_date の3列にしてください。');const errors=[];const parsedRows=[];$('importCsv').disabled=true;for(let i=1;i<rows.length;i++){const [staffId='',name='',dob='']=rows[i].map(v=>v.trim());try{if(!/^\d{4}$/.test(staffId))throw new Error('スタッフIDは4桁で入力してください');if(!name)throw new Error('氏名が空です');if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))throw new Error('生年月日はYYYY-MM-DDで入力してください');parsedRows.push({row_number:i+1,staff_id:staffId,display_name:name,birth_date:dob})}catch(err){errors.push(`${i+1}行目: ${err.message}`)}}let success=0;if(parsedRows.length){const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-bulk-register',year:YEAR,rows:parsedRows}});if(error)errors.push(`一括登録処理: ${error.message}`);else if(!data?.ok)errors.push(`一括登録処理: ${data?.message||'登録に失敗しました。'}`);else{success=Number(data.success||0);for(const item of data.errors||[])errors.push(`${item.row_number}行目: ${item.message}`)}}$('importCsv').disabled=false;await load();if(success)show($('csvSuccess'),`${success}件を登録しました。`);if(errors.length)show($('csvError'),`登録できなかった行があります。\n${errors.join('\n')}`)};

const parseYenCsv=v=>{const raw=String(v??'').trim().replace(/,/g,'');if(raw==='')return 0;if(!/^\d+$/.test(raw))throw new Error('金額は0以上の整数で入力してください');const num=Number(raw);if(!Number.isSafeInteger(num)||num<0)throw new Error('金額を確認してください');return num};
$('downloadPayrollTemplate').onclick=()=>{const csv='staff_id,taxable_salary_total,social_insurance_total,withheld_income_tax_total\r\n"0001","3500000","520000","85000"\r\n';const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='payroll_import_template_2026.csv';a.click();URL.revokeObjectURL(a.href)};
$('importPayrollCsv').onclick=async()=>{hide($('payrollCsvError'));hide($('payrollCsvSuccess'));const file=$('payrollCsvFile').files[0];if(!file)return show($('payrollCsvError'),'CSVファイルを選択してください。');const rows=parseCsv(await file.text());if(rows.length<2)return show($('payrollCsvError'),'登録するデータがありません。');const header=rows[0].map(v=>v.trim().toLowerCase());const required=['staff_id','taxable_salary_total','social_insurance_total','withheld_income_tax_total'];if(required.some((h,i)=>header[i]!==h)||header.length!==4)return show($('payrollCsvError'),'1行目は staff_id,taxable_salary_total,social_insurance_total,withheld_income_tax_total の4列にしてください。');const errors=[];const parsedRows=[];$('importPayrollCsv').disabled=true;for(let i=1;i<rows.length;i++){const [staffId='',salary='',social='',tax='']=rows[i].map(v=>v.trim());try{if(!/^\d{4}$/.test(staffId))throw new Error('スタッフIDは4桁で入力してください');parsedRows.push({row_number:i+1,staff_id:staffId,taxable_salary_total:parseYenCsv(salary),social_insurance_total:parseYenCsv(social),withheld_income_tax_total:parseYenCsv(tax)})}catch(err){errors.push(`${i+1}行目: ${err.message}`)}}let success=0;if(parsedRows.length){const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-bulk-payroll',year:YEAR,rows:parsedRows}});if(error)errors.push(`一括登録処理: ${error.message}`);else if(!data?.ok)errors.push(`一括登録処理: ${data?.message||'登録に失敗しました。'}`);else{success=Number(data.success||0);for(const item of data.errors||[])errors.push(`${item.row_number}行目: ${item.message}`)}}$('importPayrollCsv').disabled=false;if(success)show($('payrollCsvSuccess'),`${success}件の給与情報を登録しました。`);if(errors.length)show($('payrollCsvError'),`登録できなかった行があります。\n${errors.join('\n')}`)};


$('staffSearch').oninput=applyListControls;
$('statusFilter').onchange=applyListControls;
$('passwordFilter').onchange=applyListControls;
$('adjustmentFilter').onchange=applyListControls;
$('staffSort').onchange=applyListControls;
$('resetStaffFilters').onclick=()=>{$('staffSearch').value='';$('statusFilter').value='';$('passwordFilter').value='';$('adjustmentFilter').value='';$('staffSort').value='id_asc';applyListControls()};

$('selectAllAdjustments').onchange=e=>{document.querySelectorAll('.adjustment-select').forEach(cb=>cb.checked=e.target.checked);updateSelectionCount()};
$('calculateSelected').onclick=async()=>{hide($('bulkAdjustmentError'));const rows=selectedAdjustmentRows();if(!rows.length)return show($('bulkAdjustmentError'),'計算するスタッフを選択してください。');if(!confirm(`選択した${rows.length}名の年末調整をまとめて計算します。よろしいですか？`))return;const btn=$('calculateSelected');btn.disabled=true;const status=$('bulkAdjustmentStatus');status.classList.remove('hidden');const errors=[];let success=0;for(let i=0;i<rows.length;i++){const row=rows[i];status.textContent=`計算中… ${i+1}/${rows.length}（${row.staff_id} ${row.name}）`;const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-calculate-adjustment',assignment_id:row.assignment_id}});if(error||!data?.ok){errors.push(`${row.staff_id} ${row.name}: ${data?.message||error?.message||'計算に失敗しました。'}`)}else success++}status.textContent=`一括計算が完了しました。成功 ${success}名 / ${rows.length}名`;btn.disabled=false;if(errors.length)show($('bulkAdjustmentError'),`計算できなかったスタッフがあります。
${errors.join('
')}`)};

async function openAdjustment(id,staffId,name){currentAdjustmentId=id;hide($('adjustmentError'));hide($('adjustmentSuccess'));$('adjustmentResult').classList.add('hidden');$('adjustmentTitle').textContent='給与年間集計・年末調整';$('adjustmentMeta').textContent=`${staffId} ${name}`;const {data}=await supabase.from('staff_payroll_totals').select('*').eq('staff_assignment_id',id).maybeSingle();$('taxableSalaryTotal').value=data?.taxable_salary_total??0;$('socialInsuranceTotal').value=data?.social_insurance_total??0;$('withheldIncomeTaxTotal').value=data?.withheld_income_tax_total??0;if(data?.adjustment_result)renderAdjustment(data.adjustment_result);$('adjustmentModal').classList.remove('hidden')}
function renderAdjustment(r){const items=[['給与等の総額（前職含む）',r.gross_salary],['給与所得控除後',r.salary_income_before_adjustment],['所得金額調整控除',r.income_adjustment],['基礎控除',r.basic_deduction],['社会保険料控除',r.social_insurance_deduction],['生命保険料控除',r.life_insurance_deduction],['地震保険料控除',r.earthquake_insurance_deduction],['配偶者控除等',r.spouse_deduction],['扶養控除',r.dependent_deduction],['特定親族特別控除',r.specific_relative_special_deduction],['所得控除合計',r.total_deductions],['差引課税給与所得金額',r.taxable_income],['算出所得税額',r.calculated_income_tax],['住宅ローン控除',r.housing_loan_deduction],['年調年税額',r.annual_tax],['源泉徴収済税額',r.withheld_tax_total]];$('adjustmentResultGrid').innerHTML=items.map(([k,v])=>`<div class="result-item"><span>${escapeHtml(k)}</span><strong>¥${yen(v)}</strong></div>`).join('')+`<div class="result-item result-primary"><span>${escapeHtml(r.settlement_type)}</span><strong>¥${yen(r.settlement_amount)}</strong></div>`;$('adjustmentResult').classList.remove('hidden');const warnings=r.warnings||[];if(r.manual_review_required)warnings.unshift('この計算には要確認項目があります。最終確定前に証明書・申告書と照合してください。');if(warnings.length){$('adjustmentWarnings').textContent=warnings.join('\n');$('adjustmentWarnings').classList.remove('hidden')}else $('adjustmentWarnings').classList.add('hidden')}
$('savePayrollTotals').onclick=async()=>{if(!currentAdjustmentId)return;hide($('adjustmentError'));hide($('adjustmentSuccess'));const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-save-payroll',assignment_id:currentAdjustmentId,taxable_salary_total:Number($('taxableSalaryTotal').value||0),social_insurance_total:Number($('socialInsuranceTotal').value||0),withheld_income_tax_total:Number($('withheldIncomeTaxTotal').value||0)}});if(error||!data?.ok)return show($('adjustmentError'),data?.message||error?.message||'保存に失敗しました。');show($('adjustmentSuccess'),'年間集計を保存しました。')};
$('calculateAdjustment').onclick=async()=>{if(!currentAdjustmentId)return;hide($('adjustmentError'));hide($('adjustmentSuccess'));$('calculateAdjustment').disabled=true;await $('savePayrollTotals').onclick();const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-calculate-adjustment',assignment_id:currentAdjustmentId}});$('calculateAdjustment').disabled=false;if(error||!data?.ok)return show($('adjustmentError'),data?.message||error?.message||'計算に失敗しました。');renderAdjustment(data.result);show($('adjustmentSuccess'),'2026年分として計算しました。最終確定前に申告内容・証明書と照合してください。')};
$('closeAdjustmentModal').onclick=()=>{$('adjustmentModal').classList.add('hidden');currentAdjustmentId=''};

document.addEventListener('change',e=>{const t=e.target;if(t instanceof HTMLElement&&t.classList.contains('adjustment-select'))updateSelectionCount()});
document.addEventListener('click',async e=>{const t=e.target;if(!(t instanceof HTMLElement))return;
  if(t.classList.contains('save-deadline')){const id=t.dataset.assignment;const input=document.querySelector(`.deadline-input[data-assignment="${id}"]`);if(!input?.value)return alert('個別編集期限を入力してください。');const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-update-individual-deadline',assignment_id:id,editable_until:localToIso(input.value)}});if(error||!data?.ok)return alert(data?.message||error?.message||'変更に失敗しました。');await load()}
  if(t.classList.contains('clear-deadline')){const id=t.dataset.assignment;const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-update-individual-deadline',assignment_id:id,editable_until:null}});if(error||!data?.ok)return alert(data?.message||error?.message||'変更に失敗しました。');await load()}
  if(t.classList.contains('reset-pw')){if(!confirm(`${t.dataset.name}さんのパスワードを再発行します。現在のパスワードは使用できなくなります。よろしいですか？`))return;t.disabled=true;const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-reset-password',assignment_id:t.dataset.assignment}});t.disabled=false;if(error||!data?.ok)return alert(data?.message||error?.message||'再発行に失敗しました。');$('passwordModalText').textContent=`${data.staff_id} ${data.display_name} さんの新しいパスワードです。`;$('temporaryPassword').textContent=data.temporary_password;$('passwordModal').classList.remove('hidden')}
  if(t.classList.contains('adjustment-btn'))await openAdjustment(t.dataset.assignment,t.dataset.staffId,t.dataset.name);
  if(t.classList.contains('delete-staff')){const label=`${t.dataset.staffId} ${t.dataset.name}`;if(!confirm(`${label} を削除します。\n年末調整の回答、添付書類、ログインアカウントも削除されます。\nこの操作は元に戻せません。よろしいですか？`))return;const typed=prompt(`確認のためスタッフID「${t.dataset.staffId}」を入力してください。`);if(typed!==t.dataset.staffId)return alert('スタッフIDが一致しないため削除を中止しました。');t.disabled=true;const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-delete-staff',assignment_id:t.dataset.assignment}});t.disabled=false;if(error||!data?.ok)return alert(data?.message||error?.message||'削除に失敗しました。');alert(`${label} を削除しました。`);await load()}
});
$('copyPassword').onclick=async()=>{try{await navigator.clipboard.writeText($('temporaryPassword').textContent);$('copyPassword').textContent='コピー済み';setTimeout(()=>$('copyPassword').textContent='コピー',1500)}catch{alert('コピーできませんでした。')}};
$('closePasswordModal').onclick=()=>{$('temporaryPassword').textContent='';$('passwordModal').classList.add('hidden')};
(async()=>{
  const ok=await ensureAdminAuth();
  if(!ok)return;
  await loadSettings();
  await load();
})().catch(err=>{
  console.error('admin init failed',err);
  const box=$('adminInitError');
  if(box){box.textContent='管理画面の初期化に失敗しました。ページを再読み込みするか、ログアウトして再度ログインしてください。';box.style.display='block'}
});
