import {supabase} from './supabase.js';
const {data:{user}}=await supabase.auth.getUser();
if(!user)location.href='./login.html';
const {data:admin}=await supabase.from('admin_users').select('auth_user_id').eq('auth_user_id',user.id).maybeSingle();
if(!admin){await supabase.auth.signOut();location.href='./login.html'}

const $=id=>document.getElementById(id);
const show=(el,msg)=>{el.textContent=msg;el.style.display='block'};
const hide=el=>{el.style.display='none';el.textContent=''};

async function load(){
  const {data,error}=await supabase.from('staff_assignments').select('status,password_set,editable_until,staff_members!inner(staff_id,display_name)').eq('year',2026).order('created_at');
  if(error)return;
  $('rows').innerHTML=data.map(r=>`<tr><td>${escapeHtml(r.staff_members.staff_id)}</td><td>${escapeHtml(r.staff_members.display_name)}</td><td>${escapeHtml(r.status)}</td><td>${r.password_set?'設定済':'未設定'}</td><td>${new Date(r.editable_until).toLocaleString('ja-JP')}</td></tr>`).join('');
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

$('newStaff').onclick=()=>{$('register').classList.toggle('hidden');$('csvRegister').classList.add('hidden')};
$('csvStaff').onclick=()=>{$('csvRegister').classList.toggle('hidden');$('register').classList.add('hidden')};

$('staffForm').onsubmit=async e=>{
  e.preventDefault();
  const {error}=await supabase.rpc('admin_register_staff',{
    p_staff_id:$('staffId').value,
    p_display_name:$('name').value,
    p_birth_date:$('dob').value,
    p_year:2026,
    p_editable_until:new Date($('deadline').value).toISOString()
  });
  if(error)return alert(error.message);
  e.target.reset();
  await load();
};

function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')quoted=false;
      else field+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===','){row.push(field);field='';}
      else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
      else field+=ch;
    }
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(v=>v.trim()!==''));
}
function normalizeDeadline(v){
  const s=v.trim();
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const [,y,mo,d,h='0',mi='0',sec='0']=m;
    const dt=new Date(Number(y),Number(mo)-1,Number(d),Number(h),Number(mi),Number(sec));
    if(!Number.isNaN(dt.getTime()))return dt.toISOString();
  }
  const dt=new Date(s);
  if(Number.isNaN(dt.getTime()))throw new Error('編集期限の形式が正しくありません');
  return dt.toISOString();
}

$('downloadTemplate').onclick=()=>{
  const csv='staff_id,display_name,birth_date,editable_until\r\n"0001","山田 太郎","1990-01-01","2026-12-15 00:00"\r\n';
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='staff_import_template.csv';a.click();URL.revokeObjectURL(a.href);
};

$('importCsv').onclick=async()=>{
  hide($('csvError'));hide($('csvSuccess'));
  const file=$('csvFile').files[0];
  if(!file)return show($('csvError'),'CSVファイルを選択してください。');
  const rows=parseCsv(await file.text());
  if(rows.length<2)return show($('csvError'),'登録するデータがありません。');
  const header=rows[0].map(v=>v.trim().toLowerCase());
  const required=['staff_id','display_name','birth_date','editable_until'];
  if(required.some((h,i)=>header[i]!==h))return show($('csvError'),'1行目は staff_id,display_name,birth_date,editable_until にしてください。');
  const errors=[];let success=0;const parsedRows=[];
  $('importCsv').disabled=true;
  for(let i=1;i<rows.length;i++){
    const [staffId='',name='',dob='',deadline='']=rows[i].map(v=>v.trim());
    try{
      if(!/^\d{4}$/.test(staffId))throw new Error('スタッフIDは4桁で入力してください');
      if(!name)throw new Error('氏名が空です');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))throw new Error('生年月日はYYYY-MM-DDで入力してください');
      const iso=normalizeDeadline(deadline);
      parsedRows.push({row_number:i+1,staff_id:staffId,display_name:name,birth_date:dob,editable_until:iso});
    }catch(err){errors.push(`${i+1}行目: ${err.message}`);}
  }
  if(parsedRows.length){
    const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-bulk-register',year:2026,rows:parsedRows}});
    if(error){errors.push(`一括登録処理: ${error.message}`);}
    else if(!data?.ok){errors.push(`一括登録処理: ${data?.message||'登録に失敗しました。'}`);}
    else{
      success=Number(data.success||0);
      for(const item of data.errors||[])errors.push(`${item.row_number}行目: ${item.message}`);
    }
  }
  $('importCsv').disabled=false;
  await load();
  if(success)show($('csvSuccess'),`${success}件を登録しました。`);
  if(errors.length)show($('csvError'),`登録できなかった行があります。\n${errors.join('\n')}`);
};

$('logout').onclick=async()=>{await supabase.auth.signOut();location.href='./login.html'};
load();
