import { supabase, $, show, hide, requireStaffContext, formatDeadline, lockForm, markSectionComplete, bindLogout, saveAndReturn, bindYenInput, setYenInput, parseYenInput, finishPageLoading, showActionToast } from './staff-common.js';

const OTHER_EMPLOYER_SLIP_CATEGORY='他勤務先の源泉徴収票（確認用）';
const IMAGE_MAX_DIMENSION=1800;
const IMAGE_JPEG_QUALITY=0.82;

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function canvasToBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像の圧縮に失敗しました。')),type,quality));}

async function compressImageForUpload(file){
  if(!file.type?.startsWith('image/')) return file;
  try{
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,IMAGE_MAX_DIMENSION/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');
    canvas.width=width; canvas.height=height;
    const context=canvas.getContext('2d',{alpha:false});
    context.fillStyle='#fff'; context.fillRect(0,0,width,height);
    context.drawImage(bitmap,0,0,width,height);
    if(typeof bitmap.close==='function') bitmap.close();
    let blob=await canvasToBlob(canvas,'image/jpeg',IMAGE_JPEG_QUALITY);
    if(blob.size>=file.size && file.size<=2*1024*1024) return file;
    if(blob.size>=file.size) blob=await canvasToBlob(canvas,'image/jpeg',0.72);
    const stem=(file.name||'image').replace(/\.[^.]+$/,'')||'image';
    return new File([blob],`${stem}.jpg`,{type:'image/jpeg',lastModified:file.lastModified||Date.now()});
  }catch(err){
    console.warn('画像圧縮をスキップしました。',err);
    return file;
  }
}

try {
  let ctx;
  try{
    ctx=await requireStaffContext();
  }catch{
    show($('pageError'),'対象データを取得できません。');
    throw new Error('assignment not found');
  }

  const {assignment,deadline,canEdit}=ctx;
  $('deadline').textContent=formatDeadline(deadline);
  bindYenInput($('otherSalaryIncome'));
  bindYenInput($('otherIncome'));

  function hasOtherEmployerSalary(){
    return parseYenInput($('otherSalaryIncome').value)>0;
  }

  function syncSlipSection(){
    $('otherEmployerSlipSection').classList.toggle('hidden',!hasOtherEmployerSalary());
  }

  async function loadOtherEmployerSlip(){
    const {data,error}=await supabase
      .from('staff_documents')
      .select('*')
      .eq('staff_assignment_id',assignment.id)
      .eq('category',OTHER_EMPLOYER_SLIP_CATEGORY)
      .order('created_at',{ascending:false})
      .limit(1);

    if(error) throw error;
    const doc=data?.[0];
    const status=$('otherEmployerSlipStatus');

    if(!doc){
      status.innerHTML='未登録';
      return;
    }

    status.innerHTML=`<div><strong>登録済み：</strong>${esc(doc.original_name||'添付書類')}</div>
      <div class="row" style="margin-top:.5rem">
        <button type="button" class="btn tiny secondary" id="viewOtherEmployerSlip">表示</button>
        <button type="button" class="btn tiny secondary" id="deleteOtherEmployerSlip" ${canEdit?'':'disabled'}>削除</button>
      </div>`;

    $('viewOtherEmployerSlip').onclick=async()=>{
      const {data:signed,error:signedError}=await supabase.storage
        .from('year-end-adjustment-documents')
        .createSignedUrl(doc.storage_path,60);
      if(signedError)return show($('pageError'),signedError.message);
      window.open(signed.signedUrl,'_blank','noopener');
    };

    $('deleteOtherEmployerSlip').onclick=async()=>{
      if(!canEdit)return;
      if(!confirm('他勤務先の源泉徴収票を削除しますか？'))return;
      hide($('pageError'));
      try{
        const {error:storageError}=await supabase.storage
          .from('year-end-adjustment-documents')
          .remove([doc.storage_path]);
        if(storageError)throw storageError;
        const {error:dbError}=await supabase.from('staff_documents').delete().eq('id',doc.id);
        if(dbError)throw dbError;
        await loadOtherEmployerSlip();
        showActionToast('源泉徴収票を削除しました。');
      }catch(err){
        show($('pageError'),err.message);
      }
    };
  }

  const {data:info,error:infoError}=await supabase
    .from('staff_income_info')
    .select('*')
    .eq('staff_assignment_id',assignment.id)
    .maybeSingle();
  if(infoError)throw infoError;

  if(info){
    setYenInput($('otherSalaryIncome'),info.other_salary_income);
    setYenInput($('otherIncome'),info.other_income);
    $('selfDisability').value=info.disability_category||'なし';
    $('widowSingleParent').value=info.widow_single_parent||'なし';
    $('workingStudent').checked=!!info.working_student;
    $('incomeNote').value=info.note||'';
  }

  syncSlipSection();
  await loadOtherEmployerSlip();

  $('otherSalaryIncome').addEventListener('input',syncSlipSection);

  $('uploadOtherEmployerSlip').onclick=async()=>{
    hide($('pageError'));
    if(!canEdit)return show($('pageError'),'現在は編集できません。');
    if(!hasOtherEmployerSalary())return show($('pageError'),'先にTO株式会社以外から受け取る給与の見込額を入力してください。');

    const file=$('otherEmployerSlipFile').files[0];
    if(!file)return show($('pageError'),'源泉徴収票ファイルを選択してください。');

    const allowed=['application/pdf','image/jpeg','image/png','image/heic','image/heif'];
    if(file.type && !allowed.includes(file.type)){
      return show($('pageError'),'PDFまたは画像ファイルを選択してください。');
    }

    const btn=$('uploadOtherEmployerSlip');
    const original=btn.textContent;
    btn.disabled=true;
    btn.textContent=file.type?.startsWith('image/')?'画像を圧縮中…':'アップロード中…';

    try{
      const uploadFile=await compressImageForUpload(file);
      if(uploadFile.size>10*1024*1024)throw new Error('圧縮後のファイルを10MB以下にできませんでした。');

      btn.textContent='アップロード中…';

      const {data:existing,error:existingError}=await supabase
        .from('staff_documents')
        .select('*')
        .eq('staff_assignment_id',assignment.id)
        .eq('category',OTHER_EMPLOYER_SLIP_CATEGORY);
      if(existingError)throw existingError;

      const safe=(uploadFile.name||file.name).replace(/[^0-9A-Za-z._-]/g,'_');
      const path=`${assignment.id}/${crypto.randomUUID()}-${safe}`;

      const {error:uploadError}=await supabase.storage
        .from('year-end-adjustment-documents')
        .upload(path,uploadFile,{upsert:false,contentType:uploadFile.type||undefined});
      if(uploadError)throw uploadError;

      const {error:insertError}=await supabase.from('staff_documents').insert({
        staff_assignment_id:assignment.id,
        category:OTHER_EMPLOYER_SLIP_CATEGORY,
        storage_path:path,
        original_name:file.name,
        mime_type:uploadFile.type||file.type||null,
        size_bytes:uploadFile.size
      });
      if(insertError){
        await supabase.storage.from('year-end-adjustment-documents').remove([path]);
        throw insertError;
      }

      for(const oldDoc of existing||[]){
        await supabase.storage.from('year-end-adjustment-documents').remove([oldDoc.storage_path]);
        await supabase.from('staff_documents').delete().eq('id',oldDoc.id);
      }

      $('otherEmployerSlipFile').value='';
      await loadOtherEmployerSlip();
      showActionToast('他勤務先の源泉徴収票をアップロードしました。');
      btn.textContent='アップロードしました';
      setTimeout(()=>{btn.textContent=original;},900);
    }catch(err){
      show($('pageError'),err.message);
    }finally{
      btn.disabled=false;
      if(btn.textContent!=='アップロードしました')btn.textContent=original;
    }
  };

  $('incomeForm').onsubmit=async e=>{
    e.preventDefault();
    hide($('pageError'));
    hide($('pageSuccess'));
    if(!canEdit)return show($('pageError'),'現在は編集できません。');

    const payload={
      staff_assignment_id:assignment.id,
      other_salary_income:parseYenInput($('otherSalaryIncome').value),
      other_income:parseYenInput($('otherIncome').value),
      disability_category:$('selfDisability').value,
      widow_single_parent:$('widowSingleParent').value,
      working_student:$('workingStudent').checked,
      note:$('incomeNote').value.trim(),
      updated_at:new Date().toISOString()
    };

    try{
      await saveAndReturn(e.submitter||$('incomeForm').querySelector('button[type="submit"]'),async()=>{
        const {error}=await supabase.from('staff_income_info').upsert(payload,{onConflict:'staff_assignment_id'});
        if(error)throw error;
        await markSectionComplete(assignment.id,'income');
      });
    }catch(err){
      show($('pageError'),err.message);
    }
  };

  if(!canEdit){
    lockForm($('incomeForm'));
    $('otherEmployerSlipFile').disabled=true;
    $('uploadOtherEmployerSlip').disabled=true;
    $('lockedMessage').classList.remove('hidden');
  }
  bindLogout();
} finally {
  finishPageLoading();
}
