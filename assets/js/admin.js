import {supabase} from './supabase.js';
const YEAR=2026;
const {data:{user}}=await supabase.auth.getUser();
if(!user)location.href='./login.html';
const {data:admin}=await supabase.from('admin_users').select('auth_user_id').eq('auth_user_id',user.id).maybeSingle();
if(!admin){await supabase.auth.signOut();location.href='./login.html'}

const $=id=>document.getElementById(id);
const show=(el,msg)=>{el.textContent=msg;el.style.display='block'};
const hide=el=>{el.style.display='none';el.textContent=''};
const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toLocalInput=iso=>{const d=new Date(iso);if(Number.isNaN(d.getTime()))return'';const p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
const localToIso=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))throw new Error('日時を確認してください。');return d.toISOString()};
let commonDeadline='';

async function loadSettings(){
  const {data,error}=await supabase.from('year_settings').select('default_editable_until').eq('year',YEAR).single();
  if(error){show($('settingsError'),'共通編集期限を取得できません。');return;}
  commonDeadline=data.default_editable_until;
  $('commonDeadline').value=toLocalInput(commonDeadline);
}

async function load(){
  const {data,error}=await supabase.from('staff_assignments').select('id,status,password_set,editable_until_override,staff_members!inner(staff_id,display_name)').eq('year',YEAR).order('created_at');
  if(error)return;
  $('rows').innerHTML=data.map(r=>{
    const effective=r.editable_until_override||commonDeadline;
    const deadline=effective?new Date(effective).toLocaleString('ja-JP'):'未設定';
    const overrideBadge=r.editable_until_override?'<span class="mini-badge">個別</span>':'';
    const pwBtn=r.password_set?`<button class="btn tiny reset-pw" data-assignment="${r.id}" data-name="${escapeHtml(r.staff_members.display_name)}">PW再発行</button>`:'<span class="muted">初回設定前</span>';
    return `<tr><td>${escapeHtml(r.staff_members.staff_id)}</td><td>${escapeHtml(r.staff_members.display_name)}</td><td>${escapeHtml(r.status)}</td><td>${r.password_set?'設定済':'未設定'}</td><td><div>${deadline} ${overrideBadge}</div><div class="deadline-actions"><input class="deadline-input" data-assignment="${r.id}" type="datetime-local" value="${r.editable_until_override?toLocalInput(r.editable_until_override):''}" aria-label="個別編集期限"><button class="btn secondary tiny save-deadline" data-assignment="${r.id}">個別設定</button>${r.editable_until_override?`<button class="btn link-btn tiny clear-deadline" data-assignment="${r.id}">共通に戻す</button>`:''}</div></td><td>${pwBtn}</td></tr>`;
  }).join('');
}

$('saveCommonDeadline').onclick=async()=>{
  hide($('settingsSuccess'));hide($('settingsError'));
  try{
    const editable_until=localToIso($('commonDeadline').value);
    const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-update-common-deadline',year:YEAR,editable_until}});
    if(error||!data?.ok)throw new Error(data?.message||error?.message||'保存に失敗しました。');
    commonDeadline=editable_until;show($('settingsSuccess'),'共通編集期限を保存しました。');await load();
  }catch(e){show($('settingsError'),e.message);}
};

$('newStaff').onclick=()=>{$('register').classList.toggle('hidden');$('csvRegister').classList.add('hidden')};
$('csvStaff').onclick=()=>{$('csvRegister').classList.toggle('hidden');$('register').classList.add('hidden')};

$('staffForm').onsubmit=async e=>{
  e.preventDefault();
  const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-register',year:YEAR,staff_id:$('staffId').value.trim(),display_name:$('name').value.trim(),birth_date:$('dob').value}});
  if(error||!data?.ok)return alert(data?.message||error?.message||'登録に失敗しました。');
  e.target.reset();await load();
};

function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else{if(ch==='"')quoted=true;else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=ch;}
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}return rows.filter(r=>r.some(v=>v.trim()!==''));
}

$('downloadTemplate').onclick=()=>{
  const csv='staff_id,display_name,birth_date\r\n"0001","山田 太郎","1990-01-01"\r\n';
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='staff_import_template.csv';a.click();URL.revokeObjectURL(a.href);
};

$('importCsv').onclick=async()=>{
  hide($('csvError'));hide($('csvSuccess'));const file=$('csvFile').files[0];if(!file)return show($('csvError'),'CSVファイルを選択してください。');
  const rows=parseCsv(await file.text());if(rows.length<2)return show($('csvError'),'登録するデータがありません。');
  const header=rows[0].map(v=>v.trim().toLowerCase());const required=['staff_id','display_name','birth_date'];
  if(required.some((h,i)=>header[i]!==h)||header.length!==3)return show($('csvError'),'1行目は staff_id,display_name,birth_date の3列にしてください。');
  const errors=[];const parsedRows=[];$('importCsv').disabled=true;
  for(let i=1;i<rows.length;i++){
    const [staffId='',name='',dob='']=rows[i].map(v=>v.trim());
    try{if(!/^\d{4}$/.test(staffId))throw new Error('スタッフIDは4桁で入力してください');if(!name)throw new Error('氏名が空です');if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))throw new Error('生年月日はYYYY-MM-DDで入力してください');parsedRows.push({row_number:i+1,staff_id:staffId,display_name:name,birth_date:dob});}catch(err){errors.push(`${i+1}行目: ${err.message}`);}
  }
  let success=0;
  if(parsedRows.length){const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-bulk-register',year:YEAR,rows:parsedRows}});if(error)errors.push(`一括登録処理: ${error.message}`);else if(!data?.ok)errors.push(`一括登録処理: ${data?.message||'登録に失敗しました。'}`);else{success=Number(data.success||0);for(const item of data.errors||[])errors.push(`${item.row_number}行目: ${item.message}`);}}
  $('importCsv').disabled=false;await load();if(success)show($('csvSuccess'),`${success}件を登録しました。`);if(errors.length)show($('csvError'),`登録できなかった行があります。\n${errors.join('\n')}`);
};

document.addEventListener('click',async e=>{
  const t=e.target;
  if(!(t instanceof HTMLElement))return;
  if(t.classList.contains('save-deadline')){
    const id=t.dataset.assignment;const input=document.querySelector(`.deadline-input[data-assignment="${id}"]`);
    if(!input?.value)return alert('個別編集期限を入力してください。');
    const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-update-individual-deadline',assignment_id:id,editable_until:localToIso(input.value)}});
    if(error||!data?.ok)return alert(data?.message||error?.message||'変更に失敗しました。');await load();
  }
  if(t.classList.contains('clear-deadline')){
    const id=t.dataset.assignment;const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-update-individual-deadline',assignment_id:id,editable_until:null}});
    if(error||!data?.ok)return alert(data?.message||error?.message||'変更に失敗しました。');await load();
  }
  if(t.classList.contains('reset-pw')){
    if(!confirm(`${t.dataset.name}さんのパスワードを再発行します。現在のパスワードは使用できなくなります。よろしいですか？`))return;
    t.disabled=true;const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-reset-password',assignment_id:t.dataset.assignment}});t.disabled=false;
    if(error||!data?.ok)return alert(data?.message||error?.message||'再発行に失敗しました。');
    $('passwordModalText').textContent=`${data.staff_id} ${data.display_name} さんの新しいパスワードです。`;$('temporaryPassword').textContent=data.temporary_password;$('passwordModal').classList.remove('hidden');
  }
});

$('copyPassword').onclick=async()=>{try{await navigator.clipboard.writeText($('temporaryPassword').textContent);$('copyPassword').textContent='コピー済み';setTimeout(()=>$('copyPassword').textContent='コピー',1500);}catch{alert('コピーできませんでした。');}};
$('closePasswordModal').onclick=()=>{$('temporaryPassword').textContent='';$('passwordModal').classList.add('hidden')};
$('logout').onclick=async()=>{await supabase.auth.signOut();location.href='./login.html'};
await loadSettings();await load();
