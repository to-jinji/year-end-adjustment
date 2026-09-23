import { supabase } from './supabase.js';
const {data:{user}}=await supabase.auth.getUser();if(!user)location.href='./login.html';
const {data,error}=await supabase.from('staff_assignments').select('status,editable_until,staff_members!inner(display_name)').eq('auth_user_id',user.id).eq('year',2026).single();
if(error){document.getElementById('message').textContent='対象データを取得できません。';document.getElementById('message').style.display='block';}else{document.getElementById('status').textContent=data.status;document.getElementById('deadline').textContent=`編集期限：${new Date(data.editable_until).toLocaleString('ja-JP')}`;}
document.getElementById('logout').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='./login.html'});
