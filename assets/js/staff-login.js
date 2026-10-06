import { supabase } from './supabase.js';
import { STAFF_AUTH_FUNCTION, TARGET_YEAR } from './config.js';
let verificationToken='', loginEmail='', needsSetup=false, lockTimer=null;
const verifyForm=document.getElementById('verifyForm'), passwordPanel=document.getElementById('passwordPanel');
const errorBox=document.getElementById('error'), passwordError=document.getElementById('passwordError');
const show=(el,msg)=>{el.textContent=msg;el.style.display='block'}; const hide=el=>{el.style.display='none';el.textContent=''};
const stopLockTimer=()=>{if(lockTimer){clearInterval(lockTimer);lockTimer=null}};
const formatRemaining=(lockedUntil)=>{
  const ms=Math.max(0,new Date(lockedUntil).getTime()-Date.now());
  const totalMinutes=Math.ceil(ms/60000);
  const hours=Math.floor(totalMinutes/60);
  const minutes=totalMinutes%60;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
};
const showLock=(data)=>{
  stopLockTimer();
  const render=()=>{
    if(!data?.locked_until){show(errorBox,'ロックされています。');return}
    const left=new Date(data.locked_until).getTime()-Date.now();
    if(left<=0){stopLockTimer();show(errorBox,'ロック時間が終了しました。再度本人確認を行ってください。');return}
    const suffix=data.lock_type==='staff'?'\n急ぎの場合、または登録されている生年月日を確認したい場合は jinji@to-job.com へメールでお問い合わせください。':'';
    show(errorBox,`ロックされています　残り時間 ${formatRemaining(data.locked_until)}${suffix}`);
  };
  render();lockTimer=setInterval(render,1000);
};

verifyForm.addEventListener('submit',async(e)=>{
  e.preventDefault();stopLockTimer();hide(errorBox);
  const staff_id=document.getElementById('staffId').value.trim();
  const birth_date=document.getElementById('birthDate').value.trim();
  if(!/^\d{4}$/.test(staff_id)||!/^\d{8}$/.test(birth_date))return show(errorBox,'社員番号は4桁、生年月日は8桁の数字で入力してください。');
  const {data,error}=await supabase.functions.invoke(STAFF_AUTH_FUNCTION,{body:{action:'verify',staff_id,birth_date,year:TARGET_YEAR}});
  if(error||!data?.ok){
    if(data?.locked)return showLock(data);
    if(Number.isInteger(data?.failed_count)&&data?.max_attempts)return show(errorBox,`本人確認に失敗しました。（${data.failed_count}/${data.max_attempts}）`);
    return show(errorBox,data?.message||'本人確認に失敗しました。');
  }
  verificationToken=data.verification_token;loginEmail=data.login_email||'';needsSetup=!!data.needs_password_setup;
  verifyForm.classList.add('hidden');passwordPanel.classList.remove('hidden');
  document.getElementById('passwordTitle').textContent=needsSetup?'初回パスワード設定':'パスワード入力';
  document.getElementById('passwordLabel').textContent=needsSetup?'新しいパスワード':'設定済みパスワード';
  document.getElementById('passwordSubmit').textContent=needsSetup?'設定してログイン':'ログイン';
  document.getElementById('confirmField').classList.toggle('hidden',!needsSetup);
  document.getElementById('password').autocomplete=needsSetup?'new-password':'current-password';
  document.getElementById('passwordHint').classList.toggle('hidden',!needsSetup);
});

document.querySelectorAll('[data-password-toggle]').forEach(button=>{
  button.addEventListener('click',()=>{
    const input=document.getElementById(button.dataset.passwordToggle);
    if(!input)return;
    const showPassword=input.type==='password';
    input.type=showPassword?'text':'password';
    button.classList.toggle('is-visible',showPassword);
    const label=showPassword?'パスワードを隠す':'パスワードを表示';
    button.setAttribute('aria-label',label);
    button.setAttribute('title',label);
  });
});

document.getElementById('passwordForm').addEventListener('submit',async(e)=>{
  e.preventDefault();hide(passwordError);
  const password=document.getElementById('password').value;
  if(needsSetup&&!(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)))return show(passwordError,'パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含めてください。');
  if(needsSetup){
    const confirm=document.getElementById('passwordConfirm').value;
    if(password!==confirm)return show(passwordError,'確認用パスワードが一致しません。');
    const {data,error}=await supabase.functions.invoke(STAFF_AUTH_FUNCTION,{body:{action:'set-password',verification_token:verificationToken,password}});
    if(error||!data?.ok)return show(passwordError,data?.message||'パスワード設定に失敗しました。');
    loginEmail=data.login_email;
  }
  const {error:signInError}=await supabase.auth.signInWithPassword({email:loginEmail,password});
  if(signInError)return show(passwordError,'パスワードが正しくありません。');
  const {data:pwStatus,error:pwStatusError}=await supabase.functions.invoke(STAFF_AUTH_FUNCTION,{body:{action:'staff-password-status'}});
  if(pwStatusError||!pwStatus?.ok)return show(passwordError,pwStatus?.message||'ログイン後の状態確認に失敗しました。');
  location.href=pwStatus.password_change_required?'./password.html?required=1':'./index.html';
});
