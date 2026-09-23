import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const normalizeDOB=(v:string)=>/^\d{8}$/.test(v)?`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`:''
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,'0')).join('')
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});try{const supabaseUrl=Deno.env.get('SUPABASE_URL')!;const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const db=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});const body=await req.json();
 if(body.action==='verify'){
   const staffId=String(body.staff_id||'');const dob=normalizeDOB(String(body.birth_date||''));const year=Number(body.year||0);if(!/^\d{4}$/.test(staffId)||!dob||year!==2026)return json({ok:false,message:'入力内容を確認してください。'},400);
   const {data:limit}=await db.from('staff_auth_limits').select('failed_count,locked_until').eq('staff_id',staffId).maybeSingle();
   if(limit?.locked_until && new Date(limit.locked_until)>new Date())return json({ok:false,message:'本人確認に複数回失敗したため、一時的に利用できません。時間をおいて再度お試しください。'},429);
   const {data,error}=await db.from('staff_assignments').select('id,password_set,auth_user_id,editable_until,staff_members!inner(staff_id,birth_date)').eq('year',year).eq('staff_members.staff_id',staffId).eq('staff_members.birth_date',dob).maybeSingle();
   if(error||!data){const next=(limit?.failed_count||0)+1;await db.from('staff_auth_limits').upsert({staff_id:staffId,failed_count:next,locked_until:next>=5?new Date(Date.now()+30*60*1000).toISOString():null,updated_at:new Date().toISOString()});return json({ok:false,message:'スタッフIDまたは生年月日が一致しません。'},401);}
   await db.from('staff_auth_limits').upsert({staff_id:staffId,failed_count:0,locked_until:null,updated_at:new Date().toISOString()});
   const raw=crypto.randomUUID()+crypto.randomUUID();const tokenHash=await hash(raw);await db.from('staff_verification_tokens').insert({token_hash:tokenHash,staff_assignment_id:data.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
   return json({ok:true,needs_password_setup:!data.password_set,verification_token:raw,login_email:data.password_set?`${staffId}.2026@staff.invalid`:null});
 }
 if(body.action==='admin-bulk-register'){
   const authHeader=req.headers.get('Authorization')||'';
   const jwt=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
   if(!jwt)return json({ok:false,message:'管理者としてログインし直してください。'},401);
   const {data:userData,error:userError}=await db.auth.getUser(jwt);
   const adminUser=userData?.user;
   if(userError||!adminUser)return json({ok:false,message:'管理者セッションを確認できません。ログインし直してください。'},401);
   const {data:admin}=await db.from('admin_users').select('auth_user_id').eq('auth_user_id',adminUser.id).maybeSingle();
   if(!admin)return json({ok:false,message:'管理者権限がありません。'},403);
   const year=Number(body.year||0);
   const rows=Array.isArray(body.rows)?body.rows:[];
   if(year!==2026||!rows.length)return json({ok:false,message:'登録データがありません。'},400);
   if(rows.length>500)return json({ok:false,message:'CSVは1回500件まで登録できます。'},400);
   let success=0;const errors=[] as Array<{row_number:number,message:string}>;
   for(const r of rows){
     const rowNumber=Number(r?.row_number||0);
     const staffId=String(r?.staff_id||'').trim();
     const displayName=String(r?.display_name||'').trim();
     const birthDate=String(r?.birth_date||'').trim();
     const editableUntil=String(r?.editable_until||'').trim();
     try{
       if(!/^\d{4}$/.test(staffId))throw new Error('スタッフIDは4桁で入力してください。');
       if(!displayName)throw new Error('氏名が空です。');
       if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))throw new Error('生年月日はYYYY-MM-DDで入力してください。');
       if(!editableUntil||Number.isNaN(new Date(editableUntil).getTime()))throw new Error('編集期限の形式が正しくありません。');
       const {data:member,error:memberError}=await db.from('staff_members').upsert({staff_id:staffId,display_name:displayName,birth_date:birthDate,updated_at:new Date().toISOString()},{onConflict:'staff_id'}).select('id').single();
       if(memberError||!member)throw new Error(memberError?.message||'スタッフ情報を登録できませんでした。');
       const {error:assignmentError}=await db.from('staff_assignments').upsert({staff_member_id:member.id,year,editable_until:editableUntil,updated_at:new Date().toISOString()},{onConflict:'staff_member_id,year'});
       if(assignmentError)throw new Error(assignmentError.message);
       success++;
     }catch(e){errors.push({row_number:rowNumber,message:e instanceof Error?e.message:'登録に失敗しました。'});}
   }
   return json({ok:true,success,errors});
 }
 if(body.action==='set-password'){
   const token=String(body.verification_token||'');const password=String(body.password||'');if(password.length<8)return json({ok:false,message:'パスワードは8文字以上で設定してください。'},400);const tokenHash=await hash(token);
   const {data:t}=await db.from('staff_verification_tokens').select('staff_assignment_id,expires_at,used_at').eq('token_hash',tokenHash).maybeSingle();if(!t||t.used_at||new Date(t.expires_at)<=new Date())return json({ok:false,message:'本人確認の有効期限が切れました。最初からやり直してください。'},401);
   const {data:a}=await db.from('staff_assignments').select('id,password_set,staff_members!inner(staff_id)').eq('id',t.staff_assignment_id).single();if(!a||a.password_set)return json({ok:false,message:'すでにパスワード設定済みです。'},409);const staffId=(a.staff_members as any).staff_id;const email=`${staffId}.2026@staff.invalid`;
   const {data:u,error:uerr}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{kind:'staff',staff_id:staffId,year:2026}});if(uerr||!u.user)return json({ok:false,message:'アカウント作成に失敗しました。'},500);
   await db.from('staff_assignments').update({auth_user_id:u.user.id,password_set:true,status:'入力中',updated_at:new Date().toISOString()}).eq('id',a.id);await db.from('staff_verification_tokens').update({used_at:new Date().toISOString()}).eq('token_hash',tokenHash);return json({ok:true,login_email:email});
 }
 return json({ok:false,message:'invalid action'},400);
}catch(_){return json({ok:false,message:'処理に失敗しました。'},500)}})
