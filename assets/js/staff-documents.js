import { supabase, $, show, hide, requireStaffContext, formatDeadline, markSectionComplete, markSectionIncomplete, bindLogout, saveAndReturn, showActionToast } from './staff-common.js';
let ctx;try{ctx=await requireStaffContext();}catch{show($('pageError'),'対象データを取得できません。');throw new Error('assignment not found');}
const {assignment,deadline,canEdit}=ctx;$('deadline').textContent=formatDeadline(deadline);const body=$('documentsBody');
let requiredDocs=[];
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function loadRequired(){
  const {data,error}=await supabase.rpc('staff_required_documents',{p_assignment_id:assignment.id});
  if(error){show($('pageError'),error.message);return;}
  requiredDocs=Array.isArray(data)?data:[];
  const box=$('requiredDocuments');
  if(!requiredDocs.length){box.innerHTML='<div class="empty-required">現在の入力内容では、必須の添付書類はありません。</div>';}
  else box.innerHTML=requiredDocs.map(r=>`<div class="required-doc ${r.complete?'done':'missing'}"><div><strong>${esc(r.category)}</strong><div class="field-help">必要 ${r.required_count}件 / 登録済み ${r.uploaded_count}件</div></div><span>${r.complete?'完了':'必須'}</span></div>`).join('');
  const categories=requiredDocs.filter(r=>!r.complete).map(r=>r.category);
  const select=$('documentCategory');
  select.innerHTML=(categories.length?categories:requiredDocs.map(r=>r.category)).map(c=>`<option>${esc(c)}</option>`).join('');
  $('uploadForm').classList.toggle('hidden',!requiredDocs.length || requiredDocs.every(r=>r.complete));
  const allComplete=requiredDocs.every(r=>r.complete);
  $('completeDocuments').disabled=!canEdit || !allComplete;
  $('documentHint').textContent=requiredDocs.length ? (allComplete?'必須書類はすべて登録済みです。保存して完了できます。':'未完了の必須書類をアップロードしてください。') : '添付書類は対象外です。そのまま保存して完了できます。';
}
const IMAGE_MAX_DIMENSION=1800;
const IMAGE_JPEG_QUALITY=0.82;
function canvasToBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像の圧縮に失敗しました。')),type,quality));}
async function compressImageForUpload(file){
  if(!file.type?.startsWith('image/')) return file;
  try{
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,IMAGE_MAX_DIMENSION/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{alpha:false});
    context.fillStyle='#fff';context.fillRect(0,0,width,height);
    context.drawImage(bitmap,0,0,width,height);
    if(typeof bitmap.close==='function') bitmap.close();
    let blob=await canvasToBlob(canvas,'image/jpeg',IMAGE_JPEG_QUALITY);
    if(blob.size>=file.size && file.size<=2*1024*1024) return file;
    if(blob.size>=file.size){blob=await canvasToBlob(canvas,'image/jpeg',0.72);}
    const stem=(file.name||'image').replace(/\.[^.]+$/,'')||'image';
    return new File([blob],`${stem}.jpg`,{type:'image/jpeg',lastModified:file.lastModified||Date.now()});
  }catch(err){
    console.warn('画像圧縮をスキップしました。',err);
    return file;
  }
}
async function load(){const{data,error}=await supabase.from('staff_documents').select('*').eq('staff_assignment_id',assignment.id).order('created_at');if(error)return show($('pageError'),error.message);body.innerHTML='';for(const d of data||[]){const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(d.category)}</td><td>${esc(d.original_name)}</td><td>${new Date(d.created_at).toLocaleString('ja-JP')}</td><td><button class="btn tiny secondary" data-download="${esc(d.storage_path)}">表示</button> <button class="btn tiny secondary" data-delete="${d.id}" data-path="${esc(d.storage_path)}" ${canEdit?'':'disabled'}>削除</button></td>`;body.appendChild(tr);}if(!(data||[]).length)body.innerHTML='<tr><td colspan="4" class="muted">アップロード済み書類はありません。</td></tr>';body.querySelectorAll('[data-download]').forEach(btn=>btn.onclick=async()=>{const{data,error}=await supabase.storage.from('year-end-adjustment-documents').createSignedUrl(btn.dataset.download,60);if(error)return show($('pageError'),error.message);window.open(data.signedUrl,'_blank','noopener');});body.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('この書類を削除しますか？'))return;const path=btn.dataset.path;const{error:se}=await supabase.storage.from('year-end-adjustment-documents').remove([path]);if(se)return show($('pageError'),se.message);const{error}=await supabase.from('staff_documents').delete().eq('id',btn.dataset.delete);if(error)show($('pageError'),error.message);else{await markSectionIncomplete(assignment.id,'documents');try{await load();await loadRequired();}finally{document.body.classList.remove('page-loading');const loading=$('pageLoading');if(loading)loading.remove();}}});}
try{await load();await loadRequired();}finally{document.body.classList.remove('page-loading');const loading=$('pageLoading');if(loading)loading.remove();}
$('uploadForm').onsubmit=async e=>{e.preventDefault();hide($('pageError'));hide($('pageSuccess'));if(!canEdit)return show($('pageError'),'現在は編集できません。');const file=$('documentFile').files[0];if(!file)return show($('pageError'),'ファイルを選択してください。');const allowed=['application/pdf','image/jpeg','image/png','image/heic','image/heif'];if(file.type&&!allowed.includes(file.type))return show($('pageError'),'PDFまたは画像ファイルを選択してください。');const category=$('documentCategory').value;if(!category)return show($('pageError'),'必要書類の種類を確認できません。');const btn=e.submitter||$('uploadForm').querySelector('button[type="submit"]');const original=btn.textContent;btn.disabled=true;btn.textContent=file.type?.startsWith('image/')?'画像を圧縮中…':'アップロード中…';try{const uploadFile=await compressImageForUpload(file);if(uploadFile.size>10*1024*1024)throw new Error('圧縮後のファイルを10MB以下にできませんでした。');btn.textContent='アップロード中…';const safe=(uploadFile.name||file.name).replace(/[^0-9A-Za-z._-]/g,'_');const path=`${assignment.id}/${crypto.randomUUID()}-${safe}`;const{error:uploadError}=await supabase.storage.from('year-end-adjustment-documents').upload(path,uploadFile,{upsert:false,contentType:uploadFile.type||undefined});if(uploadError)throw uploadError;const{error}=await supabase.from('staff_documents').insert({staff_assignment_id:assignment.id,category,storage_path:path,original_name:file.name,mime_type:uploadFile.type||file.type||null,size_bytes:uploadFile.size});if(error){await supabase.storage.from('year-end-adjustment-documents').remove([path]);throw error;}$('uploadForm').reset();await load();await loadRequired();show($('pageSuccess'),'書類をアップロードしました。');showActionToast('書類をアップロードしました。');}catch(err){show($('pageError'),err.message)}finally{btn.disabled=false;btn.textContent=original;}};
$('completeDocuments').onclick=async()=>{hide($('pageError'));hide($('pageSuccess'));if(!canEdit)return show($('pageError'),'現在は編集できません。');await loadRequired();if(requiredDocs.some(r=>!r.complete))return show($('pageError'),'必須の添付書類が不足しています。');try{await saveAndReturn($('completeDocuments'),async()=>{await markSectionComplete(assignment.id,'documents');});}catch(err){show($('pageError'),err.message);}};
if(!canEdit){$('uploadForm').querySelectorAll('input,select,button').forEach(x=>x.disabled=true);$('completeDocuments').disabled=true;$('lockedMessage').classList.remove('hidden');}
bindLogout();
