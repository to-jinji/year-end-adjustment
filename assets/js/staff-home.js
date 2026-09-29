import { supabase } from './supabase.js';
const YEAR=2026;
const {data:{user}}=await supabase.auth.getUser();if(!user)location.href='./login.html';
const [{data:assignment,error},{data:settings}]=await Promise.all([
  supabase.from('staff_assignments').select('id,status,editable_until_override,staff_members!inner(display_name)').eq('auth_user_id',user.id).eq('year',YEAR).single(),
  supabase.from('year_settings').select('default_editable_until').eq('year',YEAR).single()
]);
if(error){document.getElementById('message').textContent='対象データを取得できません。';document.getElementById('message').style.display='block';}
else{
  document.getElementById('status').textContent=assignment.status;
  const deadline=assignment.editable_until_override||settings?.default_editable_until;document.getElementById('deadline').textContent=deadline?`編集期限：${new Date(deadline).toLocaleString('ja-JP')}`:'編集期限：未設定';
  const {data:basic}=await supabase.from('staff_basic_info').select('staff_assignment_id').eq('staff_assignment_id',assignment.id).maybeSingle();document.getElementById('basicState').textContent=basic?'入力済':'未入力';
}
document.getElementById('logout').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='./login.html'});
