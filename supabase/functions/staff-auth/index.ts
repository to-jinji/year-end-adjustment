import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const normalizeDOB=(v:string)=>/^\d{8}$/.test(v)?`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`:''
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,'0')).join('')
const randomPassword=()=>{const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';const out:string[]=[];const max=256-(256%chars.length);while(out.length<8){const buf=new Uint8Array(16);crypto.getRandomValues(buf);for(const b of buf){if(b<max){out.push(chars[b%chars.length]);if(out.length===8)break;}}}return out.join('')}
const n=(v:any)=>Math.max(0,Number(v)||0)

const ageAtEndOfYear=(birth:string|null,year=2026)=>{if(!birth)return null;const d=new Date(`${birth}T00:00:00Z`);if(Number.isNaN(d.getTime()))return null;return year-d.getUTCFullYear()}

// 令和8年分の年末調整用。給与所得控除後の給与等の金額の表に対応する主要レンジ。
const salaryIncome2026=(salary:number)=>{
  const s=Math.max(0,Math.floor(salary));
  if(s<741000)return 0;
  if(s<2191000)return s-740000;
  if(s<2193000)return 1451000;
  if(s<2196000)return 1453000;
  if(s<2200000)return 1456000;
  if(s<3600000){const a=Math.floor(s/4000)*1000;return Math.floor(a*2.8-80000)}
  if(s<6600000){const a=Math.floor(s/4000)*1000;return Math.floor(a*3.2-440000)}
  if(s<8500000)return Math.floor(s*0.9-1100000)
  return s-1950000
}
const basicDeduction2026=(income:number)=>income<=1320000?950000:income<=3360000?880000:income<=4890000?680000:income<=6550000?630000:income<=23500000?580000:income<=24000000?480000:income<=24500000?320000:income<=25000000?160000:0
const taxOnTaxableIncome=(x:number)=>{const v=Math.max(0,Math.floor(x/1000)*1000);if(v<=1950000)return Math.floor(v*.05);if(v<=3300000)return Math.floor(v*.10-97500);if(v<=6950000)return Math.floor(v*.20-427500);if(v<=9000000)return Math.floor(v*.23-636000);if(v<=18000000)return Math.floor(v*.33-1536000);if(v<=40000000)return Math.floor(v*.40-2796000);return Math.floor(v*.45-4796000)}
const newLifeDeduction=(paid:number,specialYoung=false)=>{const p=n(paid);if(specialYoung){if(p<=30000)return p;if(p<=60000)return Math.floor(p*.5+15000);if(p<=120000)return Math.floor(p*.25+30000);return 60000}if(p<=20000)return p;if(p<=40000)return Math.floor(p*.5+10000);if(p<=80000)return Math.floor(p*.25+20000);return 40000}
const oldLifeDeduction=(paid:number)=>{const p=n(paid);if(p<=25000)return p;if(p<=50000)return Math.floor(p*.5+12500);if(p<=100000)return Math.floor(p*.25+25000);return 50000}
const mixedLifeDeduction=(newPaid:number,oldPaid:number,specialYoung=false)=>{
  const nd=newLifeDeduction(newPaid,specialYoung), od=oldLifeDeduction(oldPaid), limit=specialYoung?60000:40000;
  return Math.max(nd,od,Math.min(limit,nd+od));
}
const quakeDeduction=(quake:number,oldLong:number)=>{const q=Math.min(n(quake),50000);const o=n(oldLong)<=10000?n(oldLong):n(oldLong)<=20000?Math.floor(n(oldLong)*.5+5000):15000;return Math.min(50000,q+o)}
const spouseDeduction2026=(selfIncome:number,spouseIncome:number,spouseAge:number|null)=>{
  if(selfIncome>10000000)return 0;
  const col=selfIncome<=9000000?0:selfIncome<=9500000?1:2;
  if(spouseIncome<=620000){const general=[380000,260000,130000][col];const elderly=[480000,320000,160000][col];return spouseAge!==null&&spouseAge>=70?elderly:general}
  const rows:any[]=[
    [950000,[380000,260000,130000]],[1000000,[360000,240000,120000]],[1050000,[310000,210000,110000]],
    [1100000,[260000,180000,90000]],[1150000,[210000,140000,70000]],[1200000,[160000,110000,60000]],
    [1250000,[110000,80000,40000]],[1300000,[60000,40000,20000]],[1330000,[30000,20000,10000]]
  ];
  for(const [limit,vals] of rows)if(spouseIncome<=limit)return vals[col];return 0
}
const specificRelativeSpecialDeduction=(income:number)=>income<=850000?630000:income<=900000?610000:income<=950000?510000:income<=1000000?410000:income<=1050000?310000:income<=1100000?210000:income<=1150000?110000:income<=1200000?60000:income<=1230000?30000:0

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 try{
  const supabaseUrl=Deno.env.get('SUPABASE_URL')!;const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});const body=await req.json();
  const requireAdmin=async()=>{const authHeader=req.headers.get('Authorization')||'';const jwt=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';if(!jwt)return {error:json({ok:false,message:'管理者としてログインし直してください。'},401)};const {data:userData,error:userError}=await db.auth.getUser(jwt);const adminUser=userData?.user;if(userError||!adminUser)return {error:json({ok:false,message:'管理者セッションを確認できません。ログインし直してください。'},401)};const {data:admin}=await db.from('admin_users').select('auth_user_id').eq('auth_user_id',adminUser.id).maybeSingle();if(!admin)return {error:json({ok:false,message:'管理者権限がありません。'},403)};return {user:adminUser}}
  const getDefaultDeadline=async(year:number)=>{const {data,error}=await db.from('year_settings').select('default_editable_until').eq('year',year).single();if(error||!data)throw new Error('共通編集期限が設定されていません。');return data.default_editable_until as string}

  if(body.action==='verify'){
   const staffId=String(body.staff_id||'');const dob=normalizeDOB(String(body.birth_date||''));const year=Number(body.year||0);if(!/^\d{4}$/.test(staffId)||!dob||year!==2026)return json({ok:false,message:'入力内容を確認してください。'},400);
   const {data:limit}=await db.from('staff_auth_limits').select('failed_count,locked_until').eq('staff_id',staffId).maybeSingle();if(limit?.locked_until&&new Date(limit.locked_until)>new Date())return json({ok:false,message:'本人確認に複数回失敗したため、一時的に利用できません。時間をおいて再度お試しください。'},429);
   const {data,error}=await db.from('staff_assignments').select('id,password_set,auth_user_id,staff_members!inner(staff_id,birth_date)').eq('year',year).eq('staff_members.staff_id',staffId).eq('staff_members.birth_date',dob).maybeSingle();
   if(error||!data){const next=(limit?.failed_count||0)+1;await db.from('staff_auth_limits').upsert({staff_id:staffId,failed_count:next,locked_until:next>=5?new Date(Date.now()+30*60*1000).toISOString():null,updated_at:new Date().toISOString()});return json({ok:false,message:'スタッフIDまたは生年月日が一致しません。'},401)}
   await db.from('staff_auth_limits').upsert({staff_id:staffId,failed_count:0,locked_until:null,updated_at:new Date().toISOString()});const raw=crypto.randomUUID()+crypto.randomUUID();const tokenHash=await hash(raw);await db.from('staff_verification_tokens').insert({token_hash:tokenHash,staff_assignment_id:data.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()});return json({ok:true,needs_password_setup:!data.password_set,verification_token:raw,login_email:data.password_set?`${staffId}.2026@staff.invalid`:null})
  }
  if(body.action==='admin-update-common-deadline'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const year=Number(body.year||0);const editableUntil=String(body.editable_until||'');if(year!==2026||!editableUntil||Number.isNaN(new Date(editableUntil).getTime()))return json({ok:false,message:'編集期限を確認してください。'},400);const {error}=await db.from('year_settings').upsert({year,default_editable_until:editableUntil,updated_at:new Date().toISOString()},{onConflict:'year'});if(error)return json({ok:false,message:error.message},500);return json({ok:true})
  }
  if(body.action==='admin-register'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const year=Number(body.year||0);const staffId=String(body.staff_id||'').trim();const displayName=String(body.display_name||'').trim();const birthDate=String(body.birth_date||'').trim();if(year!==2026||!/^\d{4}$/.test(staffId)||!displayName||!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return json({ok:false,message:'登録内容を確認してください。'},400);const deadline=await getDefaultDeadline(year);const {data:member,error:memberError}=await db.from('staff_members').upsert({staff_id:staffId,display_name:displayName,birth_date:birthDate,updated_at:new Date().toISOString()},{onConflict:'staff_id'}).select('id').single();if(memberError||!member)return json({ok:false,message:memberError?.message||'スタッフ情報を登録できませんでした。'},500);const {error:assignmentError}=await db.from('staff_assignments').upsert({staff_member_id:member.id,year,editable_until:deadline,updated_at:new Date().toISOString()},{onConflict:'staff_member_id,year'});if(assignmentError)return json({ok:false,message:assignmentError.message},500);return json({ok:true})
  }
  if(body.action==='admin-bulk-register'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const year=Number(body.year||0);const rows=Array.isArray(body.rows)?body.rows:[];if(year!==2026||!rows.length)return json({ok:false,message:'登録データがありません。'},400);if(rows.length>500)return json({ok:false,message:'CSVは1回500件まで登録できます。'},400);const deadline=await getDefaultDeadline(year);let success=0;const errors=[] as Array<{row_number:number,message:string}>;
   for(const r of rows){const rowNumber=Number(r?.row_number||0);const staffId=String(r?.staff_id||'').trim();const displayName=String(r?.display_name||'').trim();const birthDate=String(r?.birth_date||'').trim();try{if(!/^\d{4}$/.test(staffId))throw new Error('スタッフIDは4桁で入力してください。');if(!displayName)throw new Error('氏名が空です。');if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))throw new Error('生年月日はYYYY-MM-DDで入力してください。');const {data:member,error:memberError}=await db.from('staff_members').upsert({staff_id:staffId,display_name:displayName,birth_date:birthDate,updated_at:new Date().toISOString()},{onConflict:'staff_id'}).select('id').single();if(memberError||!member)throw new Error(memberError?.message||'スタッフ情報を登録できませんでした。');const {error:assignmentError}=await db.from('staff_assignments').upsert({staff_member_id:member.id,year,editable_until:deadline,updated_at:new Date().toISOString()},{onConflict:'staff_member_id,year'});if(assignmentError)throw new Error(assignmentError.message);success++}catch(e){errors.push({row_number:rowNumber,message:e instanceof Error?e.message:'登録に失敗しました。'})}}
   return json({ok:true,success,errors})
  }
  if(body.action==='admin-update-individual-deadline'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const assignmentId=String(body.assignment_id||'');const editableUntil=body.editable_until===null?null:String(body.editable_until||'');if(!assignmentId)return json({ok:false,message:'対象スタッフを確認できません。'},400);if(editableUntil&&Number.isNaN(new Date(editableUntil).getTime()))return json({ok:false,message:'編集期限を確認してください。'},400);const {error}=await db.from('staff_assignments').update({editable_until_override:editableUntil,updated_at:new Date().toISOString()}).eq('id',assignmentId);if(error)return json({ok:false,message:error.message},500);return json({ok:true})
  }
  if(body.action==='admin-reset-password'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const assignmentId=String(body.assignment_id||'');const {data:a,error}=await db.from('staff_assignments').select('auth_user_id,password_set,staff_members!inner(staff_id,display_name)').eq('id',assignmentId).maybeSingle();if(error||!a)return json({ok:false,message:'対象スタッフが見つかりません。'},404);if(!a.password_set||!a.auth_user_id)return json({ok:false,message:'このスタッフはまだ初回パスワード設定をしていません。'},409);const temporaryPassword=randomPassword();const {error:updateError}=await db.auth.admin.updateUserById(a.auth_user_id,{password:temporaryPassword});if(updateError)return json({ok:false,message:'パスワードを再発行できませんでした。'},500);return json({ok:true,temporary_password:temporaryPassword,staff_id:(a.staff_members as any).staff_id,display_name:(a.staff_members as any).display_name})
  }
  if(body.action==='admin-delete-staff'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const assignmentId=String(body.assignment_id||'');const {data:a,error}=await db.from('staff_assignments').select('id,staff_member_id,auth_user_id,staff_members!inner(staff_id,display_name)').eq('id',assignmentId).maybeSingle();if(error||!a)return json({ok:false,message:'対象スタッフが見つかりません。'},404);
   const {data:objects}=await db.storage.from('year-end-adjustment-documents').list(assignmentId,{limit:1000});if(objects?.length){await db.storage.from('year-end-adjustment-documents').remove(objects.map(o=>`${assignmentId}/${o.name}`))}
   if(a.auth_user_id){const {error:authErr}=await db.auth.admin.deleteUser(a.auth_user_id);if(authErr)return json({ok:false,message:'スタッフの認証アカウントを削除できませんでした。'},500)}
   const {error:delErr}=await db.from('staff_assignments').delete().eq('id',assignmentId);if(delErr)return json({ok:false,message:delErr.message},500);
   const {count}=await db.from('staff_assignments').select('id',{count:'exact',head:true}).eq('staff_member_id',a.staff_member_id);if(!count)await db.from('staff_members').delete().eq('id',a.staff_member_id);
   await db.from('staff_auth_limits').delete().eq('staff_id',(a.staff_members as any).staff_id);
   return json({ok:true,staff_id:(a.staff_members as any).staff_id,display_name:(a.staff_members as any).display_name})
  }
  if(body.action==='admin-save-payroll'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const assignmentId=String(body.assignment_id||'');if(!assignmentId)return json({ok:false,message:'対象スタッフを確認できません。'},400);
   const payload={staff_assignment_id:assignmentId,taxable_salary_total:Math.floor(n(body.taxable_salary_total)),social_insurance_total:Math.floor(n(body.social_insurance_total)),withheld_income_tax_total:Math.floor(n(body.withheld_income_tax_total)),updated_at:new Date().toISOString()};
   const {error}=await db.from('staff_payroll_totals').upsert(payload,{onConflict:'staff_assignment_id'});if(error)return json({ok:false,message:error.message},500);return json({ok:true})
  }
  if(body.action==='admin-calculate-adjustment'){
   const auth=await requireAdmin();if(auth.error)return auth.error;const assignmentId=String(body.assignment_id||'');if(!assignmentId)return json({ok:false,message:'対象スタッフを確認できません。'},400);
   const {data:a,error:aErr}=await db.from('staff_assignments').select('id,year,status,staff_members!inner(staff_id,display_name,birth_date)').eq('id',assignmentId).maybeSingle();if(aErr||!a)return json({ok:false,message:'対象スタッフが見つかりません。'},404);
   const {data:pay}=await db.from('staff_payroll_totals').select('*').eq('staff_assignment_id',assignmentId).maybeSingle();if(!pay)return json({ok:false,message:'先に課税支給額・社会保険料・所得税の年間合計を保存してください。'},400);
   const [incomeQ,spouseQ,depsQ,insuranceQ,prevQ,housingQ]=await Promise.all([
    db.from('staff_income_info').select('*').eq('staff_assignment_id',assignmentId).maybeSingle(),
    db.from('staff_spouse_info').select('*').eq('staff_assignment_id',assignmentId).maybeSingle(),
    db.from('staff_dependents').select('*').eq('staff_assignment_id',assignmentId),
    db.from('staff_insurance_entries').select('*').eq('staff_assignment_id',assignmentId),
    db.from('staff_previous_employments').select('*').eq('staff_assignment_id',assignmentId),
    db.from('staff_housing_loan_info').select('*').eq('staff_assignment_id',assignmentId).maybeSingle()
   ]);
   const income=incomeQ.data||{} as any, spouse=spouseQ.data as any, deps=depsQ.data||[], ins=insuranceQ.data||[], prev=prevQ.data||[], housing=housingQ.data as any;
   const prevSalary=prev.reduce((s:any,r:any)=>s+n(r.payment_amount),0), prevTax=prev.reduce((s:any,r:any)=>s+n(r.withholding_tax),0), prevSocial=prev.reduce((s:any,r:any)=>s+n(r.social_insurance),0);
   const grossSalary=n(pay.taxable_salary_total)+prevSalary;const withheld=n(pay.withheld_income_tax_total)+prevTax;
   const sideSalary=n(income.other_salary_income);const otherIncome=n(income.other_income);
   const salaryIncomeForAdjustment=salaryIncome2026(grossSalary);const totalIncomeEstimate=salaryIncome2026(grossSalary+sideSalary)+otherIncome;
   const warnings:string[]=[];let manual=false;if(grossSalary>20000000){manual=true;warnings.push('給与等の総額が2,000万円を超える場合は原則として年末調整の対象外です。')}
   if(sideSalary>0)warnings.push('他の勤務先からの給与は年末調整の給与総額には加算せず、本人の合計所得金額の見積りにのみ反映しています。');
   const depDetails:any[]=[];let dependentDeduction=0,dependentDisability=0,specialRelativeDeduction=0;let hasYoungDependent=false,hasSpecialDisability=false;
   for(const d of deps as any[]){const age=ageAtEndOfYear(d.birth_date);const inc=n(d.estimated_income);if(d.nonresident){manual=true;warnings.push(`${d.name}さんは非居住者として登録されているため、扶養控除要件の書類・送金要件等を確認してください。`)}if(age!==null&&age<23&&inc<=620000)hasYoungDependent=true;if(d.disability_category==='特別障害者')hasSpecialDisability=true;
    let deduction=0,special=0;if(age!==null&&age>=16&&inc<=620000){if(age>=19&&age<23)deduction=630000;else if(age>=70){const rel=String(d.relationship||'');const direct=/父|母|祖父|祖母/.test(rel);deduction=direct&&d.living_together?580000:480000}else deduction=380000}else if(age!==null&&age>=19&&age<23&&inc>620000&&inc<=1230000){special=specificRelativeSpecialDeduction(inc)}
    dependentDeduction+=deduction;specialRelativeDeduction+=special;if(d.disability_category==='一般障害者')dependentDisability+=270000;else if(d.disability_category==='特別障害者')dependentDisability+=d.living_together?750000:400000;depDetails.push({name:d.name,age,income:inc,deduction,special_relative_deduction:special});
   }
   let selfD=income.disability_category==='一般障害者'?270000:income.disability_category==='特別障害者'?400000:0;if(income.disability_category==='特別障害者')hasSpecialDisability=true;
   const widowD=income.widow_single_parent==='寡婦'?270000:income.widow_single_parent==='ひとり親'?350000:0;const studentD=income.working_student?270000:0;
   let spouseD=0;if(spouse?.has_spouse){if(spouse.nonresident){manual=true;warnings.push('配偶者が非居住者として登録されているため、親族関係書類・送金関係書類等を確認してください。')}spouseD=spouseDeduction2026(totalIncomeEstimate,n(spouse.estimated_income),ageAtEndOfYear(spouse.birth_date))}
   const sums:Record<string,number>={};for(const i of ins as any[])sums[i.insurance_type]=(sums[i.insurance_type]||0)+n(i.paid_amount);
   if(sums['生命保険料（一般）']){manual=true;warnings.push('旧バージョンで「生命保険料（一般）」として登録された保険があります。新契約・旧契約の区分を選び直してください。')}
   if(sums['個人年金保険料']){manual=true;warnings.push('旧バージョンで「個人年金保険料」として登録された保険があります。新契約・旧契約の区分を選び直してください。')}
   const generalLife=mixedLifeDeduction(sums['新生命保険料（一般）']||0,sums['旧生命保険料（一般）']||0,hasYoungDependent);const care=newLifeDeduction(sums['介護医療保険料']||0,false);const pension=mixedLifeDeduction(sums['新個人年金保険料']||0,sums['旧個人年金保険料']||0,false);const lifeDeduction=Math.min(120000,generalLife+care+pension);const earthquake=quakeDeduction(sums['地震保険料']||0,sums['旧長期損害保険料']||0);
   const directSocial=sums['社会保険料']||0,smallBusiness=sums['小規模企業共済等掛金']||0;const socialTotal=n(pay.social_insurance_total)+prevSocial+directSocial;
   const incomeAdjustment=(grossSalary>8500000&&(hasYoungDependent||hasSpecialDisability))?Math.min(150000,Math.floor((grossSalary-8500000)*.1)):0;
   const basic=basicDeduction2026(totalIncomeEstimate);const totalDeductions=basic+socialTotal+smallBusiness+lifeDeduction+earthquake+spouseD+dependentDeduction+specialRelativeDeduction+selfD+dependentDisability+widowD+studentD;
   const adjustedSalaryIncome=Math.max(0,salaryIncomeForAdjustment-incomeAdjustment);const taxable=Math.max(0,Math.floor((adjustedSalaryIncome-totalDeductions)/1000)*1000);const calculatedTax=taxOnTaxableIncome(taxable);const housingDeduction=housing?.has_housing_loan?Math.floor(n(housing.deduction_amount)):0;if(housing?.has_housing_loan&&housing?.first_year){manual=true;warnings.push('住宅ローン控除の初年度は通常、年末調整ではなく確定申告が必要です。')}
   const annualIncomeTax=Math.max(0,calculatedTax-Math.min(calculatedTax,housingDeduction));const annualTax=Math.floor((annualIncomeTax*1.021)/100)*100;const difference=withheld-annualTax;
   const result={year:2026,gross_salary:grossSalary,previous_salary:prevSalary,salary_income_before_adjustment:salaryIncomeForAdjustment,income_adjustment:incomeAdjustment,salary_income_after_adjustment:adjustedSalaryIncome,total_income_estimate:totalIncomeEstimate,basic_deduction:basic,social_insurance_deduction:socialTotal,small_business_mutual_aid_deduction:smallBusiness,life_insurance_deduction:lifeDeduction,earthquake_insurance_deduction:earthquake,spouse_deduction:spouseD,dependent_deduction:dependentDeduction,specific_relative_special_deduction:specialRelativeDeduction,disability_deduction:selfD+dependentDisability,widow_single_parent_deduction:widowD,working_student_deduction:studentD,total_deductions:totalDeductions,taxable_income:taxable,calculated_income_tax:calculatedTax,housing_loan_deduction:housingDeduction,annual_income_tax_before_reconstruction:annualIncomeTax,annual_tax:annualTax,withheld_tax_total:withheld,difference,settlement_type:difference>0?'還付':difference<0?'追加徴収':'過不足なし',settlement_amount:Math.abs(difference),dependent_details:depDetails,warnings,manual_review_required:manual};
   const {error:saveErr}=await db.from('staff_payroll_totals').update({adjustment_result:result,manual_review_required:manual,calculated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('staff_assignment_id',assignmentId);if(saveErr)return json({ok:false,message:saveErr.message},500);return json({ok:true,result})
  }
  if(body.action==='set-password'){
   const token=String(body.verification_token||'');const password=String(body.password||'');if(password.length<8)return json({ok:false,message:'パスワードは8文字以上で設定してください。'},400);const tokenHash=await hash(token);const {data:t}=await db.from('staff_verification_tokens').select('staff_assignment_id,expires_at,used_at').eq('token_hash',tokenHash).maybeSingle();if(!t||t.used_at||new Date(t.expires_at)<=new Date())return json({ok:false,message:'本人確認の有効期限が切れました。最初からやり直してください。'},401);const {data:a}=await db.from('staff_assignments').select('id,password_set,staff_members!inner(staff_id)').eq('id',t.staff_assignment_id).single();if(!a||a.password_set)return json({ok:false,message:'すでにパスワード設定済みです。'},409);const staffId=(a.staff_members as any).staff_id;const email=`${staffId}.2026@staff.invalid`;const {data:u,error:uerr}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{kind:'staff',staff_id:staffId,year:2026}});if(uerr||!u.user)return json({ok:false,message:'アカウント作成に失敗しました。'},500);await db.from('staff_assignments').update({auth_user_id:u.user.id,password_set:true,status:'入力中',updated_at:new Date().toISOString()}).eq('id',a.id);await db.from('staff_verification_tokens').update({used_at:new Date().toISOString()}).eq('token_hash',tokenHash);return json({ok:true,login_email:email})
  }
  return json({ok:false,message:'invalid action'},400)
 }catch(e){console.error(e);return json({ok:false,message:e instanceof Error?e.message:'処理に失敗しました。'},500)}
})
