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
// Deux barèmes : au primaire, la moyenne des notes brutes ; ailleurs, la somme
// des notes pondérées divisée par la somme des coefficients.
function calcExamResult(rec){
  const results=rec.results||[];
  if(!results.length)return {sum:0,coeffSum:0,avg:0,remark:'',decision:''};
  const primary=examIsPrimary(rec.department);
  const sum=results.reduce((a,r)=>a+Number(primary?r.score||0:r.total||0),0);
  const coeffSum=primary?results.length:results.reduce((a,r)=>a+Number(r.coefficient||0),0);
  const avg=coeffSum?sum/coeffSum:0;
  return {
    sum,
    coeffSum,
    avg,
    remark:ruleFor(state.examData.settings.remarksRules,avg,'remark'),
    decision:ruleFor(state.examData.settings.decisionRules,avg,'decision')
  };
}
function renderExamSection(){
  if(!$('exams'))return;
  populateExamDepartments();
  renderExamTemplates(); renderExamRecords(); renderExamRules(); renderExamHeader();
  updateExamStudents();
  if(!$('examDate').value)$('examDate').value=today();
}
function renderExamTemplates(){
  const subjectLabel=(template,subject)=>template.level==='ابتدائي'
    ? esc(subject.name)
    : `${esc(subject.name)} × ${money(subject.coefficient)}`;
  const rows=examTemplates().map((t,index)=>`<tr>
    <td>${esc(t.department)}</td>
    <td>${esc(t.level||'')}</td>
    <td class="exam-template-subjects">${(t.subjects||[]).map(s=>subjectLabel(t,s)).join('، ')}</td>
    <td class="actions"><button class="btn-edit" onclick="loadExamTemplate(${index})">تعديل</button><button class="btn-delete" onclick="deleteExamTemplate(${index})">حذف</button></td>
  </tr>`).join('');
  $('examTemplatesTable').innerHTML=rows||'<tr><td colspan="4">لا توجد قوالب مواد بعد.</td></tr>';
}
// Les deux tables de règles ont la même forme : un seuil et un libellé.
function renderExamRules(){
  const ruleRows=(rules,key,removeHandler)=>sortedRules(rules).map((r,index)=>`<tr>
    <td>${money(r.min)}</td>
    <td>${esc(r[key])}</td>
    <td><button class="btn-delete" onclick="${removeHandler}(${index})">حذف</button></td>
  </tr>`).join('');
  const settings=state.examData.settings;
  $('remarksRulesTable').innerHTML=ruleRows(settings.remarksRules||[],'remark','deleteRemarkRule')
    ||'<tr><td colspan="3">لا توجد قواعد ملاحظات بعد.</td></tr>';
  $('decisionRulesTable').innerHTML=ruleRows(settings.decisionRules||[],'decision','deleteDecisionRule')
    ||'<tr><td colspan="3">لا توجد قواعد قرارات بعد.</td></tr>';
}
// Le formulaire de l'en-tête part des réglages des examens, puis des réglages
// généraux, puis des intitulés officiels par défaut (voir print.js).
function renderExamHeader(){
  const h=state.examData.settings.header||{};
  $('examRepublic').value=h.republic||state.settings.republic||OFFICIAL_HEADER_DEFAULTS.republic;
  $('examMinistry').value=h.ministry||state.settings.ministry||OFFICIAL_HEADER_DEFAULTS.ministry;
  $('examRegional').value=h.regional||state.settings.regional||OFFICIAL_HEADER_DEFAULTS.regional;
  $('examSchoolName').value=state.settings.schoolName||'';
  $('examSchoolPhone').value=western(h.schoolPhone||state.settings.schoolPhone||'');
}
function updateExamStudents(){
  if(!$('examDepartment'))return;
  const dept=$('examDepartment').value;
  const students=state.data.students.filter(s=>s.className===dept);
  $('examStudent').innerHTML='<option value="">اختر الطالب</option>'+students.map(s=>`<option value="${s.id}">${esc(s.callNo)} — ${esc(s.name)}</option>`).join('');
}
// Construit la grille de saisie des notes. Le primaire n'a qu'une note par
// matière ; les autres niveaux saisissent contrôle et examen, le total étant
// recalculé à chaque frappe.
function loadExamEntry(){
  const dept=$('examDepartment').value;
  const studentId=$('examStudent').value;
  const no=$('examNo').value;
  const template=currentExamTemplate(dept);
  if(!dept||!studentId)return toast('اختر القسم والطالب أولًا.');
  if(!template||!(template.subjects||[]).length)return toast('لا توجد مواد لهذا القسم. أضف قالب المواد أولًا.');

  const record=getStudentExamRecord(no,dept,studentId);
  const primary=examIsPrimary(dept);
  const headCells=primary
    ? '<th>النتيجة</th>'
    : '<th>الاختبارات</th><th>الامتحان</th><th>الضارب</th><th>المجموع</th>';

  const bodyRows=template.subjects.map(s=>{
    // Les fiches anciennes n'ont pas d'identifiant de matière : le nom sert de repli.
    const r=record?.results?.find(x=>String(x.subjectId)===String(s.id)||x.name===s.name)||{};
    const cells=primary
      ? `<td><input class="exam-score" data-subject="${esc(s.id)}" data-name="${esc(s.name)}" type="number" min="0" step="0.01" value="${Number(r.score||0)||''}"></td>`
      : `<td><input class="exam-test" data-subject="${esc(s.id)}" type="number" min="0" step="0.01" value="${Number(r.test||0)||''}"></td>`
        +`<td><input class="exam-mark" data-subject="${esc(s.id)}" type="number" min="0" step="0.01" value="${Number(r.exam||0)||''}"></td>`
        +`<td>${money(s.coefficient||1)}</td>`
        +`<td class="exam-total" data-total="${esc(s.id)}">${money(Number(r.exam||0)*Number(s.coefficient||1))}</td>`;
    return `<tr><td>${esc(s.name)}</td>${cells}</tr>`;
  }).join('');

  $('examEntryArea').innerHTML=`<h3 class="table-title" id="examEntryTitle">جدول إدخال درجات الطالب</h3>`
    +`<div class="table-scroll"><table class="exam-entry-table" aria-labelledby="examEntryTitle">`
    +`<thead><tr><th>المادة</th>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;

  for(const input of document.querySelectorAll('.exam-mark')){
    input.addEventListener('input',()=>{
      const subjectId=input.dataset.subject;
      const subject=template.subjects.find(y=>String(y.id)===String(subjectId));
      const cell=document.querySelector(`[data-total="${CSS.escape(subjectId)}"]`);
      if(cell)cell.textContent=money(Number(input.value||0)*Number(subject.coefficient||1));
    });
  }
}
async function saveExamResults(){
  const dept=$('examDepartment').value;
  const studentId=$('examStudent').value;
  const no=$('examNo').value;
  const template=currentExamTemplate(dept);
  if(!template||!studentId)return toast('اختر القسم والطالب وتأكد من وجود المواد.');

  const primary=examIsPrimary(dept);
  const results=(template.subjects||[]).map(s=>{
    const field=cls=>document.querySelector(`.${cls}[data-subject="${CSS.escape(String(s.id))}"]`);
    const score=Number(field('exam-score')?.value||0);
    const test=Number(field('exam-test')?.value||0);
    const exam=Number(field('exam-mark')?.value||0);
    return {
      subjectId:s.id,
      name:s.name,
      score,
      test,
      exam,
      coefficient:s.coefficient,
      // Le primaire compte la note brute ; ailleurs, la note d'examen pondérée.
      total:primary?score:exam*Number(s.coefficient||1)
    };
  });

  try{
    await api('/exam-records',{method:'POST',body:JSON.stringify({
      examNo:no,
      department:dept,
      studentId,
      date:$('examDate').value||today(),
      results
    })});
    state.examData=await api('/exams');
    renderExamRecords();
    toast('تم حفظ نتائج الامتحان بنجاح.');
  }catch(error){
    toast(error.message);
  }
}
function renderExamRecords(){
  const rows=(state.examData.exams||[]).map(r=>{
    const result=calcExamResult(r);
    return `<tr>
      <td>الامتحان ${r.examNo}</td>
      <td>${esc(r.department)}</td>
      <td>${esc(r.studentName)}</td>
      <td class="exam-average">${money(result.avg)}</td>
      <td>${esc(result.remark)}</td>
      <td>${esc(result.decision)}</td>
      <td>${esc(r.date)}</td>
      <td class="actions"><button class="exam-print" onclick="printExamRecord(${r.id})">كشف وطباعة</button><button class="btn-edit" onclick="editExamRecord(${r.id})">تعديل</button><button class="btn-delete" onclick="deleteExamRecordUI(${r.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('examRecordsTable').innerHTML=rows||'<tr><td colspan="8">لا توجد نتائج محفوظة.</td></tr>';
}
function editExamRecord(id){
  const record=(state.examData.exams||[]).find(x=>Number(x.id)===Number(id));
  if(!record)return;
  $('examNo').value=record.examNo;
  $('examDepartment').value=record.department;
  // La liste des élèves dépend du département : elle doit être remplie avant
  // de pouvoir y sélectionner l'élève de la fiche.
  updateExamStudents();
  $('examStudent').value=record.studentId;
  $('examDate').value=record.date||today();
  loadExamEntry();
  showEditForm('exams','examEntryArea','examDepartment');
}
async function deleteExamRecordUI(id){
  if(!(await askConfirm('هل تريد حذف نتيجة هذا الطالب؟')))return;
  if(!(await requirePassword()))return;
  try{
    await api(`/exam-records/${id}`,{method:'DELETE'});
    state.examData=await api('/exams');
    renderExamRecords();
    toast('تم حذف النتيجة.');
  }catch(error){
    toast(error.message);
  }
}
window.loadExamTemplate=index=>{
  const template=examTemplates()[index];
  if(!template)return;
  $('examTemplateDept').value=template.department;
  $('examTemplateLevel').value=template.level||'إعدادي';
  window._editingTemplate=index;
  // Copie : les matières s'éditent en mémoire, elles ne sont écrites qu'à la validation.
  _templateSubjects=(template.subjects||[]).map(x=>({...x}));
  renderPendingSubjects();
  showEditForm('exams','templateForm','examTemplateDept');
};
let _templateSubjects=[];
$('addExamSubject').onclick=()=>{
  const name=$('examSubjectName').value.trim();
  if(!name)return toast('أدخل اسم المادة.');
  _templateSubjects.push({
    id:'s'+Date.now()+Math.random().toString(36).slice(2,5),
    name,
    coefficient:Number($('examSubjectCoeff').value)||1
  });
  $('examSubjectName').value='';
  renderPendingSubjects();
};
// La liste des matières en attente est ajoutée au formulaire à la première
// utilisation, puis réutilisée telle quelle.
function renderPendingSubjects(){
  let box=$('templateForm').querySelector('.pending-subjects');
  if(!box){
    box=document.createElement('div');
    box.className='pending-subjects hint-box';
    $('templateForm').appendChild(box);
  }
  const isPrimary=$('examTemplateLevel').value==='ابتدائي';
  const label=(s,index)=>`${esc(s.name)}${isPrimary?'':' × '+money(s.coefficient)} <button type="button" class="btn-delete" onclick="removePendingSubject(${index})">×</button>`;
  box.innerHTML=_templateSubjects.map(label).join('، ')||'لم تتم إضافة مواد بعد.';
}
window.removePendingSubject=i=>{_templateSubjects.splice(i,1);renderPendingSubjects()};
$('templateForm').onsubmit=async e=>{
  e.preventDefault();
  const dept=$('examTemplateDept').value;
  const level=$('examTemplateLevel').value;
  if(!dept)return toast('اختر القسم.');
  // Enregistrer sans avoir touché aux matières garde celles du modèle existant.
  if(!_templateSubjects.length){
    const previous=currentExamTemplate(dept);
    if(previous)_templateSubjects=(previous.subjects||[]).map(x=>({...x}));
  }
  if(!_templateSubjects.length)return toast('أضف مادة واحدة على الأقل.');
  // Un département n'a qu'un modèle : l'ancien est remplacé.
  const list=examTemplates().filter(x=>x.department!==dept);
  list.push({
    id:'t'+Date.now(),
    department:dept,
    level,
    subjects:_templateSubjects.map((s,index)=>({
      ...s,
      order:index+1,
      // Le primaire note sur la moyenne simple : pas de coefficient.
      coefficient:level==='ابتدائي'?0:Number(s.coefficient)||1
    }))
  });
  try{
    await api('/exam-settings',{method:'PUT',body:JSON.stringify({subjectTemplates:list})});
    state.examData=await api('/exams');
    _templateSubjects=[];
    window._editingTemplate=null;
    renderPendingSubjects();
    renderExamSection();
    toast('تم حفظ قالب المواد والضوارب.');
  }catch(error){
    toast(error.message);
  }
};
window.deleteExamTemplate=async index=>{
  const template=examTemplates()[index];
  if(!template||!(await askConfirm(`حذف قالب ${template.department}؟`)))return;
  if(!(await requirePassword()))return;
  const list=examTemplates().filter((_,x)=>x!==index);
  await api('/exam-settings',{method:'PUT',body:JSON.stringify({subjectTemplates:list})});
  state.examData=await api('/exams');
  renderExamSection();
  toast('تم حذف قالب المواد.');
};
$('examDepartment').onchange=()=>{updateExamStudents();$('examEntryArea').innerHTML='';};
$('examTemplateDept').onchange=()=>{const old=currentExamTemplate($('examTemplateDept').value);_templateSubjects=old?(old.subjects||[]).map(x=>({...x})):[];renderPendingSubjects()};
$('examNo').onchange=loadExamEntry;
$('loadExamStudent').onclick=loadExamEntry;
$('saveExamResults').onclick=saveExamResults;
$('clearExamEntry').onclick=()=>{$('examEntryArea').innerHTML='';$('examStudent').value=''};
$('addRemarkRule').onclick=async()=>{
  const min=Number($('remarkMin').value);
  const remark=$('remarkText').value.trim();
  if(!remark||!Number.isFinite(min))return toast('أدخل الحد والملاحظة.');
  const rules=[...(state.examData.settings.remarksRules||[]),{min,remark}];
  await api('/exam-settings',{method:'PUT',body:JSON.stringify({remarksRules:rules})});
  state.examData=await api('/exams');
  $('remarkMin').value='';
  $('remarkText').value='';
  renderExamRules();
};
$('addDecisionRule').onclick=async()=>{
  const min=Number($('decisionMin').value);
  const decision=$('decisionText').value.trim();
  if(!decision||!Number.isFinite(min))return toast('أدخل الحد والقرار.');
  const rules=[...(state.examData.settings.decisionRules||[]),{min,decision}];
  await api('/exam-settings',{method:'PUT',body:JSON.stringify({decisionRules:rules})});
  state.examData=await api('/exams');
  $('decisionMin').value='';
  $('decisionText').value='';
  renderExamRules();
};
// Les tables affichent les règles triées : l'index cliqué désigne une ligne
// triée, qu'il faut retrouver dans la liste d'origine avant de la retirer.
async function deleteSortedRule(settingsKey,index){
  const rules=state.examData.settings[settingsKey]||[];
  const target=sortedRules(rules)[index];
  if(!target)return;
  await api('/exam-settings',{method:'PUT',body:JSON.stringify({[settingsKey]:rules.filter(x=>x!==target)})});
  state.examData=await api('/exams');
  renderExamRules();
}
window.deleteRemarkRule=index=>deleteSortedRule('remarksRules',index);
window.deleteDecisionRule=index=>deleteSortedRule('decisionRules',index);
$('examHeaderForm').onsubmit=async e=>{
  e.preventDefault();
  const header={
    republic:$('examRepublic').value,
    ministry:$('examMinistry').value,
    regional:$('examRegional').value,
    schoolPhone:western($('examSchoolPhone').value)
  };
  try{
    await api('/exam-settings',{method:'PUT',body:JSON.stringify({header})});
    state.examData=await api('/exams');
    renderExamHeader();
    toast('تم حفظ رأس كشف النتائج.');
  }catch(error){
    toast(error.message);
  }
};

// Le relevé s'imprime depuis la page elle-même : il est ajouté au document, la
// feuille d'impression le laisse seul visible, puis il est retiré.
function printExamRecord(id){
  const record=(state.examData.exams||[]).find(x=>Number(x.id)===Number(id));
  if(!record)return;
  const student=state.data.students.find(x=>Number(x.id)===Number(record.studentId))||{};
  const result=calcExamResult(record);
  const primary=examIsPrimary(record.department);

  const columns=primary
    ? '<th>المادة</th><th>النتيجة</th>'
    : '<th>المادة</th><th>الاختبارات</th><th>الامتحان</th><th>الضارب</th><th>المجموع</th>';
  const rows=(record.results||[]).map(x=>primary
    ? `<tr><td>${esc(x.name)}</td><td>${money(x.score)}</td></tr>`
    : `<tr><td>${esc(x.name)}</td><td>${money(x.test)}</td><td>${money(x.exam)}</td><td>${money(x.coefficient)}</td><td>${money(x.total)}</td></tr>`
  ).join('');

  const meta=`<div>القسم: ${esc(record.department)}</div>`
    +`<div>رقم النداء: ${esc(student.callNo)}</div>`
    +`<div>اسم الطالب: ${esc(student.name||record.studentName)}</div>`
    +`<div>الرقم المدرسي: ${esc(student.schoolNo)}</div>`
    +`<div>الرقم الوطني: ${esc(student.nni)}</div>`
    +`<div>الشعبة: ${esc(student.section||'')}</div>`;

  const footer=`<div>المجموع<br>${money(result.sum)}</div>`
    +`<div>مجموع الضوارب<br>${primary?'—':money(result.coeffSum)}</div>`
    +`<div>المعدل<br>${money(result.avg)}</div>`
    +`<div>الملاحظة<br>${esc(result.remark)}</div>`
    +`<div>القرار<br>${esc(result.decision)}</div>`;

  const sheet=`<div id="printSheet" class="results-sheet">`
    +`<div class="results-header">${officialHeaderHtml(state.examData.settings.header||{})}`
    +`<div class="exam-title">كشف الامتحان ${esc(record.examNo)}</div></div>`
    +`<div class="results-student-meta">${meta}</div>`
    +`<table><caption class="table-title">كشف درجات الطالب</caption>`
    +`<thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table>`
    +`<div class="results-footer">${footer}</div></div>`;

  document.getElementById('printSheet')?.remove();
  document.body.insertAdjacentHTML('beforeend',sheet);
  window.print();
  setTimeout(()=>document.getElementById('printSheet')?.remove(),500);
}
