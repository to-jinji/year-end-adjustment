import { supabase } from './supabase.js';

const form=document.getElementById('form');
const errorBox=document.getElementById('error');
const enrollPanel=document.getElementById('mfaEnroll');
const challengePanel=document.getElementById('mfaChallenge');
let activeFactorId='';

// 管理画面のフォールバックログアウトから来た場合は、残っているセッションを必ず破棄する。
if(new URLSearchParams(location.search).get('force')==='1'){
  try{await supabase.auth.signOut()}catch{}
  history.replaceState(null,'',location.pathname);
}

const show=(el,msg)=>{el.textContent=msg;el.style.display='block'};
const hide=el=>{el.textContent='';el.style.display='none'};
const codeOk=v=>/^\d{6}$/.test(String(v||'').trim());

async function adminStatus(){
  const {data,error}=await supabase.functions.invoke('staff-auth',{body:{action:'admin-auth-status'}});
  if(error||!data?.ok)throw new Error(data?.message||'管理者権限を確認できません。');
  return data;
}

async function finishIfAal2(){
  const {data,error}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error)throw error;
  if(data?.currentLevel==='aal2'){location.href='./index.html';return true}
  return false;
}

async function beginMfa(){
  if(await finishIfAal2())return;
  const {data:factors,error}=await supabase.auth.mfa.listFactors();
  if(error)throw error;
  const factor=factors?.totp?.[0];
  form.classList.add('hidden');
  if(factor){
    activeFactorId=factor.id;
    challengePanel.classList.remove('hidden');
    enrollPanel.classList.add('hidden');
    document.getElementById('mfaCode').focus();
    return;
  }
  const {data:enrolled,error:enrollError}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'TO株式会社 年末調整管理者'});
  if(enrollError)throw enrollError;
  activeFactorId=enrolled.id;
  document.getElementById('mfaQr').src=enrolled.totp.qr_code;
  document.getElementById('mfaSecret').value=enrolled.totp.secret;
  enrollPanel.classList.remove('hidden');
  challengePanel.classList.add('hidden');
  document.getElementById('mfaEnrollCode').focus();
}

async function challengeAndVerify(code){
  const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:activeFactorId});
  if(challengeError)throw challengeError;
  const {error:verifyError}=await supabase.auth.mfa.verify({factorId:activeFactorId,challengeId:challenge.id,code});
  if(verifyError)throw verifyError;
  const status=await adminStatus();
  if(!status.mfa_verified)throw new Error('2段階認証を確認できませんでした。もう一度お試しください。');
  location.href='./index.html';
}

form.addEventListener('submit',async e=>{
  e.preventDefault();hide(errorBox);
  const button=document.getElementById('loginButton');button.disabled=true;button.textContent='確認中…';
  const {error}=await supabase.auth.signInWithPassword({email:document.getElementById('email').value,password:document.getElementById('password').value});
  if(error){button.disabled=false;button.textContent='ログイン';return show(errorBox,'ログインに失敗しました。')}
  try{
    await adminStatus();
    await beginMfa();
  }catch(err){await supabase.auth.signOut();button.disabled=false;button.textContent='ログイン';show(errorBox,err.message||'管理者認証に失敗しました。')}
});

document.getElementById('mfaEnrollForm').addEventListener('submit',async e=>{
  e.preventDefault();const box=document.getElementById('mfaEnrollError');hide(box);const code=document.getElementById('mfaEnrollCode').value.trim();if(!codeOk(code))return show(box,'6桁の認証コードを入力してください。');const btn=document.getElementById('mfaEnrollButton');btn.disabled=true;btn.textContent='確認中…';try{await challengeAndVerify(code)}catch(err){btn.disabled=false;btn.textContent='設定を完了';show(box,'認証コードを確認できませんでした。コードを確認して再度お試しください。')}});

document.getElementById('mfaChallengeForm').addEventListener('submit',async e=>{
  e.preventDefault();const box=document.getElementById('mfaError');hide(box);const code=document.getElementById('mfaCode').value.trim();if(!codeOk(code))return show(box,'6桁の認証コードを入力してください。');const btn=document.getElementById('mfaButton');btn.disabled=true;btn.textContent='確認中…';try{await challengeAndVerify(code)}catch(err){btn.disabled=false;btn.textContent='認証して管理画面へ';show(box,'認証コードが正しくありません。')}});

// AAL2の有効な管理者セッションが残っている場合はそのまま管理画面へ。
(async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session)return;try{const status=await adminStatus();if(status.mfa_verified){location.href='./index.html';return}await beginMfa()}catch{await supabase.auth.signOut()}})();
