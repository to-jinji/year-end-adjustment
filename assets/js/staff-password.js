import { supabase } from './supabase.js';
import { STAFF_AUTH_FUNCTION, TARGET_YEAR } from './config.js';

const $=id=>document.getElementById(id);
const show=(el,msg)=>{el.textContent=msg;el.style.display='block';el.classList.remove('hidden')};
const hide=el=>{el.textContent='';el.style.display='none';el.classList.add('hidden')};


async function destinationAfterPasswordChange(){
  const {data:{user:currentUser}}=await supabase.auth.getUser();
  if(!currentUser)return './login.html';
  const {data:assignment,error:assignmentError}=await supabase
    .from('staff_assignments')
    .select('id')
    .eq('auth_user_id',currentUser.id)
    .eq('year',TARGET_YEAR)
    .single();
  if(assignmentError||!assignment)throw new Error('スタッフ情報を確認できません。');
  const {data:confirmation,error:confirmationError}=await supabase
    .from('staff_fuyou_declaration_confirmations')
    .select('staff_assignment_id')
    .eq('staff_assignment_id',assignment.id)
    .maybeSingle();
  if(confirmationError)throw confirmationError;
  return confirmation?'./index.html':'./fuyou-declaration.html?v=0.13.0';
}

const {data:{user}}=await supabase.auth.getUser();
if(!user)location.replace('./login.html');
if(new URLSearchParams(location.search).get('required')==='1')$('requiredNotice').classList.remove('hidden');

$('logout').onclick=async()=>{try{await supabase.auth.signOut()}catch{}location.replace('./login.html')};

document.querySelectorAll('[data-password-toggle]').forEach(button=>{
  button.addEventListener('click',()=>{
    const input=document.getElementById(button.dataset.passwordToggle);if(!input)return;
    const visible=input.type==='password';input.type=visible?'text':'password';button.classList.toggle('is-visible',visible);
    const label=visible?'パスワードを隠す':'パスワードを表示';button.setAttribute('aria-label',label);button.setAttribute('title',label);
  });
});

$('passwordChangeForm').addEventListener('submit',async e=>{
  e.preventDefault();hide($('passwordChangeError'));hide($('passwordChangeSuccess'));
  const password=$('newPassword').value,confirm=$('newPasswordConfirm').value;
  if(!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password))return show($('passwordChangeError'),'パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含めてください。');
  if(password!==confirm)return show($('passwordChangeError'),'確認用パスワードが一致しません。');
  const btn=$('passwordChangeSubmit');btn.disabled=true;btn.textContent='変更中…';
  try{
    const {data,error}=await supabase.functions.invoke(STAFF_AUTH_FUNCTION,{body:{action:'change-password',password}});
    if(error||!data?.ok)throw new Error(data?.message||error?.message||'パスワードを変更できませんでした。');
    // 管理APIでパスワードを更新すると既存セッションが無効になることがあるため、
    // 新しいパスワードで即時にサインインし直してからTOPへ遷移する。
    const loginEmail=user.email;
    if(!loginEmail)throw new Error('ログイン情報を確認できません。');
    const {error:signInError}=await supabase.auth.signInWithPassword({email:loginEmail,password});
    if(signInError)throw new Error('パスワードは変更されましたが、自動ログインに失敗しました。もう一度ログインしてください。');
    show($('passwordChangeSuccess'),'パスワードを変更しました。');
    $('newPassword').value='';$('newPasswordConfirm').value='';
    const destination=await destinationAfterPasswordChange();
    setTimeout(()=>location.replace(destination),500);
  }catch(err){show($('passwordChangeError'),err instanceof Error?err.message:'パスワードを変更できませんでした。')}
  finally{btn.disabled=false;btn.textContent='パスワードを変更'}
});
