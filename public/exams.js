/* =========================================================
   نظام الامتحانات وكشوف النتائج
   ========================================================= */
function examTemplates(){return state.examData?.settings?.subjectTemplates||[]}
function currentExamTemplate(dept){return examTemplates().find(x=>x.department===dept)}
function populateExamDepartments(){
  if(!$('examDepartment')) return;
  const opts=state.departments.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  $('examDepartment').innerHTML='<option value="">اختر القسم</option>'+opts;
  $('examTemplateDept').innerHTML='<option value="">اختر القسم/الشعبة</option>'+opts;
}
function examIsPrimary(dept){return currentExamTemplate(dept)?.level==='ابتدائي'||dept==='Jardin'||dept==='6AF'}
function getStudentExamRecord(no,dept,studentId){return (state.examData.exams||[]).find(x=>Number(x.examNo)===Number(no)&&x.department===dept&&Number(x.studentId)===Number(studentId))}
function sortedRules(rules){return [...(rules||[])].sort((a,b)=>Number(b.min)-Number(a.min))}
function ruleFor(rules,avg,key){return sortedRules(rules).find(r=>avg>=Number(r.min))?.[key]||''}
function calcExamResult(rec){
  const primary=examIsPrimary(rec.department);
  const results=rec.results||[];
  if(!results.length)return {sum:0,coeffSum:0,avg:0,remark:'',decision:''};
  if(primary){
    const sum=results.reduce((a,r)=>a+Number(r.score||0),0);
    const avg=sum/results.length;
    return {sum,coeffSum:results.length,avg,remark:ruleFor(state.examData.settings.remarksRules,avg,'remark'),decision:ruleFor(state.examData.settings.decisionRules,avg,'decision')};
  }
  const total=results.reduce((a,r)=>a+Number(r.total||0),0);
  const coeff=results.reduce((a,r)=>a+Number(r.coefficient||0),0);
  const avg=coeff?total/coeff:0;
  return {sum:total,coeffSum:coeff,avg,remark:ruleFor(state.examData.settings.remarksRules,avg,'remark'),decision:ruleFor(state.examData.settings.decisionRules,avg,'decision')};
}
function renderExamSection(){
  if(!$('exams'))return;
  populateExamDepartments();
  renderExamTemplates(); renderExamRecords(); renderExamRules(); renderExamHeader();
  updateExamStudents();
  if(!$('examDate').value)$('examDate').value=today();
}
function renderExamTemplates(){
  const list=examTemplates();
  $('examTemplatesTable').innerHTML=list.map((t,i)=>`<tr><td>${esc(t.department)}</td><td>${esc(t.level||'')}</td><td class="exam-template-subjects">${(t.subjects||[]).map(s=>`${esc(s.name)}${t.level==='ابتدائي'?'':' × '+money(s.coefficient)}`).join('، ')}</td><td class="actions"><button class="btn-edit" onclick="loadExamTemplate(${i})">تعديل</button><button class="btn-delete" onclick="deleteExamTemplate(${i})">حذف</button></td></tr>`).join('')||'<tr><td colspan="4">لا توجد قوالب مواد بعد.</td></tr>';
}
function renderExamRules(){
  const rr=state.examData.settings.remarksRules||[], dr=state.examData.settings.decisionRules||[];
  $('remarksRulesTable').innerHTML=sortedRules(rr).map((r,i)=>`<tr><td>${money(r.min)}</td><td>${esc(r.remark)}</td><td><button class="btn-delete" onclick="deleteRemarkRule(${i})">حذف</button></td></tr>`).join('')||'<tr><td colspan="3">لا توجد قواعد ملاحظات بعد.</td></tr>';
  $('decisionRulesTable').innerHTML=sortedRules(dr).map((r,i)=>`<tr><td>${money(r.min)}</td><td>${esc(r.decision)}</td><td><button class="btn-delete" onclick="deleteDecisionRule(${i})">حذف</button></td></tr>`).join('')||'<tr><td colspan="3">لا توجد قواعد قرارات بعد.</td></tr>';
}
function renderExamHeader(){
  const h=state.examData.settings.header||{};
  $('examRepublic').value=h.republic||state.settings.republic||'الجمهورية الإسلامية الموريتانية';
  $('examMinistry').value=h.ministry||state.settings.ministry||'وزارة التعليم';
  $('examRegional').value=h.regional||state.settings.regional||'الإدارة الجهوية للتعليم';
  $('examSchoolName').value=state.settings.schoolName||'';
  $('examSchoolPhone').value=western(h.schoolPhone||state.settings.schoolPhone||'');
}
function updateExamStudents(){
  if(!$('examDepartment'))return;
  const dept=$('examDepartment').value;
  const students=state.data.students.filter(s=>s.className===dept);
  $('examStudent').innerHTML='<option value="">اختر الطالب</option>'+students.map(s=>`<option value="${s.id}">${esc(s.callNo)} — ${esc(s.name)}</option>`).join('');
}
function loadExamEntry(){
  const dept=$('examDepartment').value, studentId=$('examStudent').value, no=$('examNo').value;
  const t=currentExamTemplate(dept);
  if(!dept||!studentId)return toast('اختر القسم والطالب أولًا.');
  if(!t||!(t.subjects||[]).length)return toast('لا توجد مواد لهذا القسم. أضف قالب المواد أولًا.');
  const rec=getStudentExamRecord(no,dept,studentId);
  const primary=examIsPrimary(dept);
  $('examEntryArea').innerHTML=`<h3 class="table-title" id="examEntryTitle">جدول إدخال درجات الطالب</h3><div class="table-scroll"><table class="exam-entry-table" aria-labelledby="examEntryTitle"><thead><tr><th>المادة</th>${primary?'<th>النتيجة</th>':'<th>الاختبارات</th><th>الامتحان</th><th>الضارب</th><th>المجموع</th>'}</tr></thead><tbody>`+
  t.subjects.map(s=>{const r=rec?.results?.find(x=>String(x.subjectId)===String(s.id)||x.name===s.name)||{};return `<tr><td>${esc(s.name)}</td>${primary?`<td><input class="exam-score" data-subject="${esc(s.id)}" data-name="${esc(s.name)}" type="number" min="0" step="0.01" value="${Number(r.score||0)||''}"></td>`:`<td><input class="exam-test" data-subject="${esc(s.id)}" type="number" min="0" step="0.01" value="${Number(r.test||0)||''}"></td><td><input class="exam-mark" data-subject="${esc(s.id)}" type="number" min="0" step="0.01" value="${Number(r.exam||0)||''}"></td><td>${money(s.coefficient||1)}</td><td class="exam-total" data-total="${esc(s.id)}">${money(Number(r.exam||0)*Number(s.coefficient||1))}</td>`}</tr>`}).join('')+'</tbody></table></div>';
  document.querySelectorAll('.exam-mark').forEach(x=>x.addEventListener('input',()=>{const id=x.dataset.subject;const s=t.subjects.find(y=>String(y.id)===String(id));const cell=document.querySelector(`[data-total="${CSS.escape(id)}"]`);if(cell)cell.textContent=money(Number(x.value||0)*Number(s.coefficient||1))}));
}
async function saveExamResults(){
  const dept=$('examDepartment').value, studentId=$('examStudent').value, no=$('examNo').value,t=currentExamTemplate(dept);
  if(!t||!studentId)return toast('اختر القسم والطالب وتأكد من وجود المواد.');
  const primary=examIsPrimary(dept), results=[];
  (t.subjects||[]).forEach(s=>{
    const get=cls=>document.querySelector(`.${cls}[data-subject="${CSS.escape(String(s.id))}"]`);
    const score=Number(get('exam-score')?.value||0), test=Number(get('exam-test')?.value||0), exam=Number(get('exam-mark')?.value||0);
    results.push({subjectId:s.id,name:s.name,score,test,exam,coefficient:s.coefficient,total:primary?score:exam*Number(s.coefficient||1)});
  });
  try{await api('/exam-records',{method:'POST',body:JSON.stringify({examNo:no,department:dept,studentId,date:$('examDate').value||today(),results})});state.examData=await api('/exams');renderExamRecords();toast('تم حفظ نتائج الامتحان بنجاح.')}catch(e){toast(e.message)}
}
function renderExamRecords(){
  const list=state.examData.exams||[];
  $('examRecordsTable').innerHTML=list.map(r=>{const c=calcExamResult(r);return `<tr><td>الامتحان ${r.examNo}</td><td>${esc(r.department)}</td><td>${esc(r.studentName)}</td><td class="exam-average">${money(c.avg)}</td><td>${esc(c.remark)}</td><td>${esc(c.decision)}</td><td>${esc(r.date)}</td><td class="actions"><button class="exam-print" onclick="printExamRecord(${r.id})">كشف وطباعة</button><button class="btn-edit" onclick="editExamRecord(${r.id})">تعديل</button><button class="btn-delete" onclick="deleteExamRecordUI(${r.id})">حذف</button></td></tr>`}).join('')||'<tr><td colspan="8">لا توجد نتائج محفوظة.</td></tr>';
}
function editExamRecord(id){const r=(state.examData.exams||[]).find(x=>Number(x.id)===Number(id));if(!r)return;$('examNo').value=r.examNo;$('examDepartment').value=r.department;updateExamStudents();$('examStudent').value=r.studentId;$('examDate').value=r.date||today();loadExamEntry();showEditForm('exams','examEntryArea','examDepartment')}
async function deleteExamRecordUI(id){if(!(await askConfirm('هل تريد حذف نتيجة هذا الطالب؟')))return;if(!(await requirePassword()))return;try{await api(`/exam-records/${id}`,{method:'DELETE'});state.examData=await api('/exams');renderExamRecords();toast('تم حذف النتيجة.')}catch(e){toast(e.message)}}
window.loadExamTemplate=i=>{const t=examTemplates()[i];if(!t)return;$('examTemplateDept').value=t.department;$('examTemplateLevel').value=t.level||'إعدادي';window._editingTemplate=i;_templateSubjects=(t.subjects||[]).map(x=>({...x}));renderPendingSubjects();showEditForm('exams','templateForm','examTemplateDept')};
function renderTemplateSubjectInputs(){/* kept as in-memory list; subjects are added with add button below */}
let _templateSubjects=[];
$('addExamSubject').onclick=()=>{const name=$('examSubjectName').value.trim();if(!name)return toast('أدخل اسم المادة.');_templateSubjects.push({id:'s'+Date.now()+Math.random().toString(36).slice(2,5),name,coefficient:Number($('examSubjectCoeff').value)||1});$('examSubjectName').value='';renderPendingSubjects()};
function renderPendingSubjects(){let box=$('templateForm').querySelector('.pending-subjects');if(!box){box=document.createElement('div');box.className='pending-subjects hint-box';$('templateForm').appendChild(box)}box.innerHTML=_templateSubjects.map((s,i)=>`${esc(s.name)}${$('examTemplateLevel').value==='ابتدائي'?'':' × '+money(s.coefficient)} <button type="button" class="btn-delete" onclick="removePendingSubject(${i})">×</button>`).join('، ')||'لم تتم إضافة مواد بعد.'}
window.removePendingSubject=i=>{_templateSubjects.splice(i,1);renderPendingSubjects()};
$('templateForm').onsubmit=async e=>{e.preventDefault();const dept=$('examTemplateDept').value,level=$('examTemplateLevel').value;if(!dept)return toast('اختر القسم.');if(!_templateSubjects.length){const old=currentExamTemplate(dept);if(old)_templateSubjects=(old.subjects||[]).map(x=>({...x}));}if(!_templateSubjects.length)return toast('أضف مادة واحدة على الأقل.');const list=examTemplates().filter(x=>x.department!==dept);list.push({id:'t'+Date.now(),department:dept,level,subjects:_templateSubjects.map((s,i)=>({...s,order:i+1,coefficient:level==='ابتدائي'?0:Number(s.coefficient)||1}))});try{await api('/exam-settings',{method:'PUT',body:JSON.stringify({subjectTemplates:list})});state.examData=await api('/exams');_templateSubjects=[];window._editingTemplate=null;renderPendingSubjects();renderExamSection();toast('تم حفظ قالب المواد والضوارب.')}catch(e2){toast(e2.message)}};
window.deleteExamTemplate=async i=>{const t=examTemplates()[i];if(!t||!(await askConfirm(`حذف قالب ${t.department}؟`)))return;if(!(await requirePassword()))return;const list=examTemplates().filter((_,x)=>x!==i);await api('/exam-settings',{method:'PUT',body:JSON.stringify({subjectTemplates:list})});state.examData=await api('/exams');renderExamSection();toast('تم حذف قالب المواد.')};
$('examDepartment').onchange=()=>{updateExamStudents();$('examEntryArea').innerHTML='';};
$('examTemplateDept').onchange=()=>{const old=currentExamTemplate($('examTemplateDept').value);_templateSubjects=old?(old.subjects||[]).map(x=>({...x})):[];renderPendingSubjects()};
$('examNo').onchange=loadExamEntry;
$('examStudent').onchange=()=>{};
$('loadExamStudent').onclick=loadExamEntry;
$('saveExamResults').onclick=saveExamResults;
$('clearExamEntry').onclick=()=>{$('examEntryArea').innerHTML='';$('examStudent').value=''};
$('addRemarkRule').onclick=async()=>{const min=Number($('remarkMin').value),remark=$('remarkText').value.trim();if(!remark||!Number.isFinite(min))return toast('أدخل الحد والملاحظة.');const rules=[...(state.examData.settings.remarksRules||[]),{min,remark}];await api('/exam-settings',{method:'PUT',body:JSON.stringify({remarksRules:rules})});state.examData=await api('/exams');$('remarkMin').value='';$('remarkText').value='';renderExamRules()};
$('addDecisionRule').onclick=async()=>{const min=Number($('decisionMin').value),decision=$('decisionText').value.trim();if(!decision||!Number.isFinite(min))return toast('أدخل الحد والقرار.');const rules=[...(state.examData.settings.decisionRules||[]),{min,decision}];await api('/exam-settings',{method:'PUT',body:JSON.stringify({decisionRules:rules})});state.examData=await api('/exams');$('decisionMin').value='';$('decisionText').value='';renderExamRules()};
window.deleteRemarkRule=async i=>{const rr=state.examData.settings.remarksRules||[];const sorted=sortedRules(rr);const target=sorted[i];if(!target)return;const rules=rr.filter(x=>x!==target);await api('/exam-settings',{method:'PUT',body:JSON.stringify({remarksRules:rules})});state.examData=await api('/exams');renderExamRules()};
window.deleteDecisionRule=async i=>{const rr=state.examData.settings.decisionRules||[];const sorted=sortedRules(rr);const target=sorted[i];if(!target)return;const rules=rr.filter(x=>x!==target);await api('/exam-settings',{method:'PUT',body:JSON.stringify({decisionRules:rules})});state.examData=await api('/exams');renderExamRules()};
$('examHeaderForm').onsubmit=async e=>{e.preventDefault();const h={republic:$('examRepublic').value,ministry:$('examMinistry').value,regional:$('examRegional').value,schoolPhone:western($('examSchoolPhone').value)};try{await api('/exam-settings',{method:'PUT',body:JSON.stringify({header:h})});state.examData=await api('/exams');renderExamHeader();toast('تم حفظ رأس كشف النتائج.')}catch(e2){toast(e2.message)}};

function printExamRecord(id){
  const r=(state.examData.exams||[]).find(x=>Number(x.id)===Number(id));if(!r)return;
  const st=state.data.students.find(x=>Number(x.id)===Number(r.studentId))||{};
  const c=calcExamResult(r), h=state.examData.settings.header||{};
  const primary=examIsPrimary(r.department);
  const rows=(r.results||[]).map((x,i)=>primary?`<tr><td>${esc(x.name)}</td><td>${money(x.score)}</td></tr>`:`<tr><td>${esc(x.name)}</td><td>${money(x.test)}</td><td>${money(x.exam)}</td><td>${money(x.coefficient)}</td><td>${money(x.total)}</td></tr>`).join('');
  const cols=primary?'<th>المادة</th><th>النتيجة</th>':'<th>المادة</th><th>الاختبارات</th><th>الامتحان</th><th>الضارب</th><th>المجموع</th>';
  const meta=`<div>القسم: ${esc(r.department)}</div><div>رقم النداء: ${esc(st.callNo)}</div><div>اسم الطالب: ${esc(st.name||r.studentName)}</div><div>الرقم المدرسي: ${esc(st.schoolNo)}</div><div>الرقم الوطني: ${esc(st.nni)}</div><div>الشعبة: ${esc(st.section||'')}</div>`;
  const sheet=`<div id="printSheet" class="results-sheet"><div class="results-header">${state.settings.applicationMode==='test'?'<div class="mode-badge">نسخة للتجريب فقط</div>':''}<div>${esc(h.republic||'الجمهورية الإسلامية الموريتانية')}</div><div>${esc(h.ministry||'وزارة التعليم')}</div><div>${esc(h.regional||'الإدارة الجهوية للتعليم')}</div><div class="school-title">${esc(state.settings.schoolName||'')}</div><div class="phone">الهاتف: ${esc(h.schoolPhone||state.settings.schoolPhone||'')}</div><div>${esc(state.settings.schoolYear||'')}</div><div class="exam-title">كشف الامتحان ${esc(r.examNo)}</div></div><div class="results-student-meta">${meta}</div><table><caption class="table-title">كشف درجات الطالب</caption><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table><div class="results-footer"><div>المجموع<br>${money(c.sum)}</div><div>مجموع الضوارب<br>${primary?'—':money(c.coeffSum)}</div><div>المعدل<br>${money(c.avg)}</div><div>الملاحظة<br>${esc(c.remark)}</div><div>القرار<br>${esc(c.decision)}</div></div></div>`;
  let old=document.getElementById('printSheet');if(old)old.remove();document.body.insertAdjacentHTML('beforeend',sheet);window.print();setTimeout(()=>document.getElementById('printSheet')?.remove(),500);
}
