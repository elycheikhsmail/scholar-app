// Les trois sélecteurs de département sont remplis depuis la même liste. Le
// filtre de l'écran « الطلاب » garde sa valeur si le département existe encore.
function populateDepartments(){
  const previousFilter=$('studentDepartmentFilter').value;
  const options=state.departments.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  $('className').innerHTML=`<option value="">اختر القسم</option>`+options;
  $('studentDepartmentFilter').innerHTML=`<option value="">كل الأقسام والشُّعب</option>`+options;
  $('feeDepartment').innerHTML=`<option value="">الكل</option>`+options;
  if(state.departments.some(d=>d.name===previousFilter))$('studentDepartmentFilter').value=previousFilter;
}

// Premier numéro d'appel libre du département : les numéros se réutilisent quand
// un élève part, l'élève en cours d'édition ne bloque pas le sien.
function firstCallNo(dep,exclude=null){
  const used=new Set(state.data.students
    .filter(s=>s.className===dep&&Number(s.id)!==Number(exclude))
    .map(s=>parseInt(s.callNo,10))
    .filter(Number.isFinite));
  let n=1;
  while(used.has(n))n++;
  return String(n);
}
function departmentFee(dep){const d=state.departments.find(x=>x.name===dep);return Number(d?.monthlyFee||0)}
// La date de départ n'a de sens que pour un élève qui n'est plus actif.
function toggleLeaveField(){
  const active=$('studentStatus').value===ACTIVE_STATUS;
  $('leaveDateWrap').classList.toggle('hidden-field',active);
  if(active)$('studentLeaveDate').value='';
}
$('studentStatus').onchange=toggleLeaveField;
function resetStudent(){
  if(!$('studentForm'))return;
  clearFormErrors($('studentForm'));
  $('studentForm').reset();
  $('studentId').value='';
  $('registrationDate').value=today();
  $('callNo').value='';
  $('gender').value='';
  $('studentStatus').value=ACTIVE_STATUS;
  $('studentLeaveDate').value='';
  toggleLeaveField();
}
$('cancelStudent').onclick=resetStudent;
$('className').addEventListener('change',()=>{
  $('callNo').value=$('className').value?firstCallNo($('className').value,$('studentId').value||null):'';
});
// Contrôles de la fiche élève, repris de `validateStudent` (db.js), signalés
// champ par champ avant l'envoi (helpers de core.js).
function studentFieldErrors(payload){
  const errors={};
  if(!payload.className)errors.className='اختر القسم.';
  if(!payload.schoolNo.trim())errors.schoolNo='الرقم المدرسي مطلوب.';
  if(!payload.name.trim())errors.studentName='اسم الطالب مطلوب.';
  if(!payload.gender)errors.gender='اختر جنس الطالب.';
  if(!payload.nni.trim())errors.nni='الرقم الوطني NNI مطلوب.';
  else if(!/^\d{10}$/.test(payload.nni.trim()))errors.nni='الرقم الوطني NNI يجب أن يتكون من 10 أرقام بالضبط.';
  if(payload.guardianPhone.trim()&&!/^\d{8}$/.test(payload.guardianPhone.trim()))errors.guardianPhone='رقم هاتف ولي الأمر يجب أن يتكون من 8 أرقام.';
  for(const id of ['birthDate','registrationDate','studentLeaveDate'])if(dateFieldState(id)==='partial')errors[id]='أكمل التاريخ: اليوم والشهر والسنة.';
  if(!errors.birthDate&&payload.birthDate&&payload.birthDate>today())errors.birthDate='تاريخ الميلاد لا يمكن أن يكون في المستقبل.';
  if(!errors.registrationDate&&!payload.registrationDate)errors.registrationDate='تاريخ التسجيل مطلوب.';
  const active=payload.status===ACTIVE_STATUS;
  if(!active&&!errors.studentLeaveDate){
    if(!payload.leaveDate)errors.studentLeaveDate='حدد تاريخ المغادرة عند تغيير حالة الطالب.';
    else if(payload.registrationDate&&payload.leaveDate<payload.registrationDate)errors.studentLeaveDate='تاريخ المغادرة يجب أن يكون بعد تاريخ التسجيل.';
  }
  return errors;
}
const STUDENT_SERVER_ERROR_FIELDS=[['NNI','nni'],['الرقم المدرسي','schoolNo'],['القسم','className'],['اسم الطالب','studentName'],['جنس','gender'],['هاتف ولي الأمر','guardianPhone'],['المغادرة','studentLeaveDate'],['التسجيل','registrationDate']];
clearFieldErrorOnEdit($('studentForm'));
$('studentForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const payload={
    schoolNo:western($('schoolNo').value),
    name:$('studentName').value,
    callNo:$('callNo').value,
    gender:$('gender').value,
    nni:western($('nni').value),
    birthPlace:$('birthPlace').value,
    birthDate:$('birthDate').value,
    guardianName:$('guardianName').value,
    guardianPhone:western($('guardianPhone').value),
    className:$('className').value,
    registrationDate:$('registrationDate').value,
    status:$('studentStatus').value,
    leaveDate:$('studentLeaveDate').value,
    notes:$('studentNotes').value
  };
  const errors=studentFieldErrors(payload);
  if(Object.keys(errors).length){
    showFormErrors($('studentForm'),errors);
    return toast(`صحّح الحقول المحددة باللون الأحمر: ${Object.values(errors)[0]}`);
  }
  clearFormErrors($('studentForm'));
  try{
    const id=$('studentId').value;
    let created=null;
    if(id){
      // Modifier une fiche existante demande la confirmation du mot de passe.
      if(!(await requirePassword()))return;
      await api(`/students/${id}`,{method:'PUT',body:JSON.stringify(payload)});
    }else{
      created=await api('/students',{method:'POST',body:JSON.stringify(payload)});
    }
    await load();
    resetStudent();
    renderStudents();
    renderFees();
    renderPaymentHistory();
    // Un nouvel élève est inscrit pour payer : l'استمارة des frais s'ouvre
    // aussitôt, sans le rechercher dans le registre.
    if(created&&studentById(created.id)){
      toast('تم حفظ الطالب. سجّل الآن رسوم التسجيل.');
      openStudentFees(created.id);
    }else toast('تم حفظ الطالب.');
  }catch(error){
    const field=serverErrorField(error.message,STUDENT_SERVER_ERROR_FIELDS);
    if(field)showFormErrors($('studentForm'),{[field]:error.message});
    toast(error.message);
  }
});
$('studentSearch').oninput=debounce(renderStudents);
$('studentDepartmentFilter').onchange=renderStudents;
$('studentGenderFilter').onchange=renderStudents;
// Fees live in the settings and in the departments, so the dues engine is
// handed both together wherever a ledger is computed.
// asOf : les relevés suivent la date de test quand elle est active.
function feeSettings(){return {...(state.settings||{}),departments:state.departments||[],asOf:today()}}
let ledgerCache=null,ledgerData=null,ledgerSettings=null,ledgerDepartments=null;
// Les relevés sont recalculés pour tous les élèves d'un coup et gardés en cache :
// chaque écran les interroge des dizaines de fois par rendu. Le cache tombe dès
// que `load()` remplace les données ou les réglages.
function ledgers(){
  if(ledgerCache&&ledgerData===state.data&&ledgerSettings===state.settings&&ledgerDepartments===state.departments)return ledgerCache;
  const settings=feeSettings();
  const byStudent=new Map();
  for(const p of live(state.data.studentPayments)){
    const key=Number(p.studentId);
    const list=byStudent.get(key);
    if(list)list.push(p);
    else byStudent.set(key,[p]);
  }
  const map=new Map();
  for(const s of state.data.students){
    map.set(Number(s.id),ledgerFor(s,byStudent.get(Number(s.id))||[],settings));
  }
  ledgerData=state.data;
  ledgerSettings=state.settings;
  ledgerDepartments=state.departments;
  ledgerCache=map;
  return map;
}
function ledgerOf(student){return ledgers().get(Number(student.id))||ledgerFor(student,[],feeSettings())}
function studentById(sid){return state.data.students.find(s=>Number(s.id)===Number(sid))}
// Null for a month the student is not enrolled in: nothing is owed for it.
function chargeOf(student,month){return student?ledgerOf(student).byMonth.get(month)||null:null}
function feeDueFor(student,month){const row=chargeOf(student,month);return row?row.amount:0}
function paidFor(sid,m){const row=chargeOf(studentById(sid),m);return row?row.paid:0}
function remainingFor(student,month){const row=chargeOf(student,month);return row?row.remaining:0}
function totalOutstandingFor(student){return ledgerOf(student).outstanding}
function creditFor(student){return ledgerOf(student).credit}
function invoiceNo(p){return p?.invoiceNo||`F-${String(p?.id||0).padStart(6,'0')}`}
// What a receipt actually settled, as the fee engine allocated it (oldest fee
// first). The `month` stored on a payment is only the label it was entered
// under; every screen that says what a receipt paid for reads this instead.
let allocationCache=null,allocationLedgers=null;
function allocationsByPayment(){
  const map=ledgers();
  if(allocationCache&&allocationLedgers===map)return allocationCache;
  const index=new Map();
  for(const ledger of map.values()){
    for(const row of ledger.rows){
      for(const a of row.allocations){
        const list=index.get(Number(a.paymentId))||[];
        list.push({month:row.month,amount:a.amount});
        index.set(Number(a.paymentId),list);
      }
    }
  }
  allocationLedgers=map;
  allocationCache=index;
  return index;
}
function allocationsOf(payment){return allocationsByPayment().get(Number(payment?.id))||[]}
// « رسوم التسجيل: 200، يونيو: 11 800 » — or the credit note when nothing is settled yet.
function settledText(payment,separator='، '){
  const list=allocationsOf(payment);
  return list.length?list.map(a=>`${a.month}: ${money(a.amount)}`).join(separator):'لم تُخصَّص لأي رسم بعد (رصيد دائن)';
}
function lateFor(student,month){const row=chargeOf(student,month);return !!row&&row.remaining>0&&today()>row.dueDate}
function statusFor(student,month){return feeStatusOf(chargeOf(student,month),today())}
// La recherche porte sur le département, le nom, le numéro scolaire, le NNI,
// et le parent (nom et téléphone) : un numéro tapé retrouve ses enfants.
// Le filtre الجنس se combine avec le département et la recherche.
function filteredStudents(){
  const query=western($('studentSearch').value).toLowerCase().trim();
  const dep=$('studentDepartmentFilter').value;
  const gender=$('studentGenderFilter').value;
  return state.data.students.filter(s=>(!dep||s.className===dep)
    &&(!gender||s.gender===gender)
    &&[s.className,s.name,s.schoolNo,s.nni,s.guardianName,s.guardianPhone].join(' ').toLowerCase().includes(query));
}
function renderStudents(){
  const list=filteredStudents();
  $('studentCount').textContent=`عدد الطلاب: ${list.length}`;
  const rows=list.map(s=>{
    const status=s.status||ACTIVE_STATUS;
    return `<tr>
      <td>${esc(s.className)}</td>
      <td>${esc(s.callNo)}</td>
      <td>${esc(s.schoolNo)}</td>
      <td>${esc(s.name)}</td>
      <td>${esc(s.gender||'')}</td>
      <td>${esc(s.guardianName||'—')}</td>
      <td>${esc(western(s.guardianPhone||'—'))}</td>
      <td>${esc(s.nni)}</td>
      <td class="${status===ACTIVE_STATUS?'':'status-exempt'}">${esc(status)}${s.leaveDate?' — '+esc(s.leaveDate):''}</td>
      <td class="actions"><button class="btn-pay" onclick="openStudentFees(${s.id})">المالية</button><button class="btn-edit" onclick="editStudent(${s.id})">تعديل</button><button class="btn-delete" onclick="removeStudent(${s.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('studentsTable').innerHTML=rows||'<tr><td colspan="10">لا يوجد طلاب مطابقون للتصفية.</td></tr>';
}
const STUDENT_EXPORT_COLUMNS=[
  {key:'className',label:'القسم',value:s=>s.className||''},
  {key:'callNo',label:'رقم النداء',value:s=>Number(s.callNo)||s.callNo||''},
  {key:'schoolNo',label:'الرقم المدرسي',value:s=>s.schoolNo||''},
  {key:'name',label:'اسم الطالب',value:s=>s.name||''},
  {key:'gender',label:'الجنس',value:s=>s.gender||''},
  {key:'nni',label:'NNI',value:s=>s.nni||''},
  {key:'birthPlace',label:'محل الميلاد',value:s=>s.birthPlace||''},
  {key:'birthDate',label:'تاريخ الميلاد',value:s=>s.birthDate||''},
  {key:'guardianName',label:'ولي الأمر',value:s=>s.guardianName||''},
  {key:'guardianPhone',label:'هاتف ولي الأمر',value:s=>s.guardianPhone||''},
  {key:'registrationDate',label:'تاريخ التسجيل',value:s=>s.registrationDate||''},
  {key:'status',label:'الحالة',value:s=>s.status||ACTIVE_STATUS},
  {key:'leaveDate',label:'تاريخ المغادرة',value:s=>s.leaveDate||''},
  {key:'notes',label:'ملاحظات',value:s=>s.notes||''}
];
// The stored choice is reused on the next export; an unknown key is dropped so a
// removed column cannot resurrect itself.
let studentExportColumns=STUDENT_EXPORT_COLUMNS.map(column=>column.key);
try{
  const saved=JSON.parse(localStorage.getItem('studentExportColumns')||'null');
  if(Array.isArray(saved))studentExportColumns=saved.filter(key=>STUDENT_EXPORT_COLUMNS.some(column=>column.key===key));
}catch{}
function renderStudentExportColumns(){
  const toggle=column=>`<label><input type="checkbox" data-student-export-column="${column.key}" ${studentExportColumns.includes(column.key)?'checked':''}> ${esc(column.label)}</label>`;
  $('studentExportColumns').innerHTML=STUDENT_EXPORT_COLUMNS.map(toggle).join('');
}
function selectedStudentExportColumns(){
  const checked=new Set([...document.querySelectorAll('[data-student-export-column]')]
    .filter(input=>input.checked)
    .map(input=>input.dataset.studentExportColumn));
  return STUDENT_EXPORT_COLUMNS.filter(column=>checked.has(column.key));
}
function setAllStudentExportColumns(checked){
  for(const input of document.querySelectorAll('[data-student-export-column]'))input.checked=checked;
}
$('selectAllStudentExport').onclick=()=>setAllStudentExportColumns(true);
$('clearStudentExport').onclick=()=>setAllStudentExportColumns(false);
$('closeStudentExport').onclick=()=>$('studentExportDialog').close();
$('exportStudentsExcel').onclick=()=>{
  const students=filteredStudents();
  if(!students.length)return toast('لا يوجد طلاب مطابقون للتصفية لتصديرهم.');
  $('studentExportCount').textContent=`سيتم تصدير ${money(students.length)} طالب حسب التصفية الحالية.`;
  renderStudentExportColumns();
  $('studentExportDialog').showModal();
};
$('studentExportForm').addEventListener('submit',e=>{
  e.preventDefault();
  const students=filteredStudents();
  if(!students.length)return toast('لا يوجد طلاب مطابقون للتصفية لتصديرهم.');
  const columns=selectedStudentExportColumns();
  if(!columns.length)return toast('اختر عمودًا واحدًا على الأقل للتصدير.');
  studentExportColumns=columns.map(column=>column.key);
  localStorage.setItem('studentExportColumns',JSON.stringify(studentExportColumns));
  const rows=students.map(s=>columns.map(column=>column.value(s)));
  downloadXlsx(`سجل الطلاب — ${today()}.xlsx`,'الطلاب',[columns.map(column=>column.label),...rows]);
  $('studentExportDialog').close();
  toast(`تم تصدير ${money(students.length)} طالب إلى Excel.`);
});
window.editStudent=id=>{
  const s=state.data.students.find(x=>x.id===id);
  if(!s)return;
  const fields={
    studentId:s.id,
    className:s.className,
    callNo:s.callNo,
    schoolNo:s.schoolNo,
    studentName:s.name,
    gender:s.gender||'',
    nni:s.nni,
    birthPlace:s.birthPlace,
    birthDate:s.birthDate,
    guardianName:s.guardianName,
    guardianPhone:s.guardianPhone,
    registrationDate:s.registrationDate,
    studentStatus:s.status||ACTIVE_STATUS,
    studentLeaveDate:s.leaveDate||'',
    studentNotes:s.notes
  };
  for(const [fieldId,value] of Object.entries(fields))$(fieldId).value=value??'';
  toggleLeaveField();
  showEditForm('students','studentForm','studentName');
};
window.removeStudent=async id=>{await deleteWithPassword(`/students/${id}`,'هل تريد حذف الطالب وجميع دفعاته؟','تم حذف الطالب وجميع دفعاته.');};

let selectedFeeStudentId = null;
function selectedFeeStudent() { return state.data?.students.find(s => Number(s.id) === Number(selectedFeeStudentId)); }
window.openStudentFees = (id, showLedger = false) => {
  selectedFeeStudentId = Number(id);
  const student = selectedFeeStudent();
  if (!student) return;
  studentFeeEntryFilter={period:'all',status:'all'};
  $('studentFeePaymentAmount').value='';
  $('studentFeeEntryDate').value = today();
  fillStudentDiscountForm(student);
  refreshStudentFeeDetails();
  showEditForm('student-fees','studentFeesForm','studentFeePaymentAmount');
  $('studentAccountDetails').open = Boolean(showLedger);
  if(showLedger)requestAnimationFrame(()=>$('studentAccountDetails').scrollIntoView({block:'start'}));
};
function fillStudentDiscountForm(student) {
  $('studentDiscountType').value = student.discountType || '';
  $('studentDiscountValue').value = student.discountValue || '';
  $('studentDiscountReason').value = student.discountReason || '';
  toggleDiscountFields();
}

// The cashier enters one amount. The same oldest-first order used on the server
// previews how it will settle registration, June and the remaining months.
function studentFeeRows(student) {
  return ledgerOf(student).rows.map((row, index) => ({ index, month: row.month, dueDate: row.dueDate, amount: row.amount, paid: row.paid, remaining: row.remaining }));
}
function enteredStudentPaymentAmount(){
  const value=Number(western($('studentFeePaymentAmount').value));
  return Number.isFinite(value)&&value>0?round2(value):0;
}
function previewStudentPayment(student,amount=enteredStudentPaymentAmount()){
  let left=amount;
  return studentFeeRows(student).map(row=>{
    const allocated=round2(Math.min(left,row.remaining));
    left=round2(left-allocated);
    return {...row,allocated,afterPaid:round2(row.paid+allocated),afterRemaining:round2(row.remaining-allocated)};
  });
}
function feeEntryStatusFor(row){
  if(!(row.amount>0))return 'exempt';
  return row.paid<=0?'unpaid':row.remaining<=0?'paid':'partial';
}
function feeEntryHtml(row) {
  const filterAttrs=`data-fee-period="${ledgerPeriodFor(row)}" data-fee-status="${feeEntryStatusFor(row)}"`;
  const head = `<div class="fee-entry-head"><b>${esc(row.month)}</b><span>المستحق: ${money(row.amount)} أوقية</span>`
    + (row.month === 'يونيو' ? '<span class="status-partial">يُدفع عند التسجيل</span>' : '')
    + '</div>';
  const details = `<button type="button" class="secondary fee-details-button" data-charge-details="${row.index}" aria-label="عرض تفاصيل وفواتير ${esc(row.month)}">تفاصيل</button>`;
  if (!(row.amount > 0)) return `<div class="fee-entry" data-fee-entry="${row.index}" ${filterAttrs}>${head}<div class="fee-entry-state status-exempt">بلا رسوم</div>${details}</div>`;
  const settled=row.afterRemaining<=0;
  const state=row.afterPaid<=0?'لم يُسدَّد':settled?'مسدَّد بالكامل':'مسدَّد جزئياً';
  const stateClass=row.afterPaid<=0?'status-unpaid':settled?'status-paid':'status-partial';
  const allocation=row.allocated>0?`<div class="fee-allocation-preview"><small>من الدفعة الجديدة</small><b>+ ${money(row.allocated)}</b><small>المتبقي بعدها: ${money(row.afterRemaining)}</small></div>`:'';
  return `<div class="fee-entry${settled?' fee-entry-settled':''}${row.allocated>0?' fee-entry-previewed':''}" data-fee-entry="${row.index}" ${filterAttrs}>${head}`
    + `<div class="fee-entry-state ${stateClass}"><b>${state}</b><small>المدفوع: ${money(row.afterPaid)} — المتبقي: ${money(row.afterRemaining)}</small></div>`
    + allocation+details+'</div>';
}
function renderStudentFeeEntries() {
  const student = selectedFeeStudent();
  if (!student) return;
  const monthly = monthlyFeeFor(student, feeSettings());
  const discount = discountOn(student, monthly);
  $('studentFeeRates').innerHTML = `رسم التسجيل: <b>${money(registrationFeeFor(feeSettings()))}</b> أوقية`
    + ` — الرسم الشهري لمستوى ${esc(student.className || '—')}: <b>${money(monthly)}</b> أوقية`
    + (discount > 0 ? ` — بعد الخصم: <b>${money(round2(monthly - discount))}</b> أوقية` : '')
    + `. رسم يونيو مستحق يوم التسجيل، وبقية الأشهر في اليوم الأول من شهرها. تُقرأ المبالغ من «إعدادات الرسوم» ولا تُدخَل هنا.`;
  const ledger=ledgerOf(student);
  $('studentFeeAmountLimit').textContent=`الحد الأقصى الممكن تسجيله: ${money(ledger.scheduledOutstanding)} أوقية`;
  $('studentFeeEntries').innerHTML = previewStudentPayment(student).map(feeEntryHtml).join('')
    || '<p>لا توجد رسوم مستحقة على هذا الطالب.</p>';
  applyStudentFeeEntryFilter();
  updateStudentFeeSummary();
}
// The paid-status list shares the period buckets of the invoice table and adds
// a payment-state filter. Filtering only hides entries; allocation stays oldest-first.
let studentFeeEntryFilter={period:'all',status:'all'};
function periodFilterMatches(filter,periodKey){
  return filter==='all'||periodKey===filter||(filter==='past-current'&&['past','current'].includes(periodKey));
}
function syncFilterButtons(selector,dataKey,value){
  for(const button of document.querySelectorAll(selector)){
    const active=button.dataset[dataKey]===value;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
}
function applyStudentFeeEntryFilter(){
  const entries=[...$('studentFeeEntries').querySelectorAll('[data-fee-entry]')];
  const {period,status}=studentFeeEntryFilter;
  let visible=0;
  for(const entry of entries){
    const show=periodFilterMatches(period,entry.dataset.feePeriod)&&(status==='all'||entry.dataset.feeStatus===status);
    entry.hidden=!show;
    if(show)visible++;
  }
  syncFilterButtons('#studentFeeEntryFilters [data-fee-period]','feePeriod',period);
  syncFilterButtons('#studentFeeEntryFilters [data-fee-status]','feeStatus',status);
  $('studentFeeEntryFilterCount').textContent=entries.length?`عرض ${money(visible)} من ${money(entries.length)} رسم`:'';
  $('studentFeeEntryFilterEmpty').hidden=!entries.length||visible>0;
}
$('studentFeeEntryFilters').addEventListener('click',event=>{
  const button=event.target.closest('[data-fee-period],[data-fee-status]');
  if(!button)return;
  if(button.dataset.feePeriod)studentFeeEntryFilter.period=button.dataset.feePeriod;
  if(button.dataset.feeStatus)studentFeeEntryFilter.status=button.dataset.feeStatus;
  applyStudentFeeEntryFilter();
});
function updateStudentFeeSummary() {
  const box = $('studentFeeEntrySummary');
  // Both save buttons (with and without the receipt) follow the same checks.
  const save = { set disabled(value) { $('saveStudentFees').disabled = value; $('saveStudentFeesOnly').disabled = value; } };
  if (!selectedFeeStudent()) { box.textContent = ''; box.className = 'fee-preview hidden'; return; }
  const student=selectedFeeStudent(),amount=enteredStudentPaymentAmount(),ledger=ledgerOf(student);
  const typed=$('studentFeePaymentAmount').value.trim();
  if(typed&&amount<=0){
    box.className = 'fee-preview warn';
    box.textContent='أدخل مبلغاً صحيحاً أكبر من صفر.';
    save.disabled = true;
    return;
  }
  if(amount>ledger.scheduledOutstanding){
    box.className='fee-preview warn';
    box.textContent=`المبلغ يتجاوز إجمالي المتبقي وهو ${money(ledger.scheduledOutstanding)} أوقية.`;
    save.disabled=true;
    return;
  }
  save.disabled = !amount;
  if (!amount) {
    box.className = 'fee-preview';
    box.textContent = 'أدخل المبلغ المدفوع، وسيظهر توزيعه على الرسوم تلقائياً هنا وفي القائمة.';
    return;
  }
  const allocations=previewStudentPayment(student,amount).filter(row=>row.allocated>0);
  box.className='fee-preview';
  box.innerHTML=`<div class="fee-preview-totals"><span><small>دفعة واحدة</small><b>${money(amount)} أوقية</b></span><span><small>عدد الرسوم المستفيدة</small><b>${money(allocations.length)}</b></span></div>`
    +`<p>${allocations.map(row=>`${esc(row.month)}: ${money(row.allocated)}`).join('، ')}.</p>`;
}
$('studentFeeEntries').addEventListener('click', event => {
  const button = event.target.closest('[data-charge-details]');
  if(button)openStudentChargeDetails(Number(button.dataset.chargeDetails));
});
$('studentFeePaymentAmount').addEventListener('input',()=>renderStudentFeeEntries());
$('resetStudentFees').onclick = () => { $('studentFeeEntryDate').value = today(); $('studentFeePaymentAmount').value=''; renderStudentFeeEntries(); };
$('studentFeesForm').onsubmit = async event => {
  event.preventDefault();
  const student = selectedFeeStudent();
  if (!student) return;
  const amount=enteredStudentPaymentAmount(),ledger=ledgerOf(student);
  if(!amount)return toast('أدخل المبلغ المدفوع.');
  if(amount>ledger.scheduledOutstanding)return toast(`المبلغ يتجاوز إجمالي المتبقي وهو ${money(ledger.scheduledOutstanding)} أوقية.`);
  const date = $('studentFeeEntryDate').value;
  if (!date) return toast('أدخل تاريخ الدفع.');
  const first=previewStudentPayment(student,amount).find(row=>row.allocated>0);
  // Le bouton par défaut enregistre et imprime le reçu que le parent attend au
  // guichet ; « تسجيل فقط » enregistre sans l'ouvrir.
  const button = event.submitter||$('saveStudentFees');
  const print = button.id!=='saveStudentFeesOnly';
  for(const b of [$('saveStudentFees'),$('saveStudentFeesOnly')]) b.disabled = true;
  try {
    const created=await api('/student-payments', {method:'POST',body:JSON.stringify({studentId:student.id,date,month:first.month,amount,notes:'دفعة موزعة تلقائيًا'})});
    await load(); renderFees(); renderPaymentHistory(); renderDashboard();
    $('studentFeePaymentAmount').value='';
    renderStudentFeeEntries();
    toast(`تم تسجيل دفعة واحدة بقيمة ${money(amount)} أوقية وتوزيعها تلقائيًا.`);
    if(print){
      // Le reçu vient de la réponse ; à défaut, la dernière facture de l'élève.
      const own=live(state.data.studentPayments).filter(p=>Number(p.studentId)===Number(student.id));
      const receipt=own.find(p=>Number(p.id)===Number(created?.id))||own.sort((a,b)=>Number(b.id)-Number(a.id))[0];
      if(receipt)printStudentReceipt(receipt.id);
    }
  } catch(error) { toast(error.message); } finally { updateStudentFeeSummary(); }
};
function openStudentChargeDetails(index){
  const student=selectedFeeStudent();
  const row=student&&ledgerOf(student).rows[index];
  if(!student||!row)return;
  const payments=new Map(state.data.studentPayments.map(payment=>[Number(payment.id),payment]));
  $('studentChargeDetailsTitle').textContent=`تفاصيل ${row.month}`;
  $('studentChargeDetailsIdentity').textContent=`${student.name} — الرقم المدرسي: ${student.schoolNo}`;
  const period={past:'سابقة',current:'جارية',future:'قادمة'}[ledgerPeriodFor(row)];
  const invoiceRows=row.allocations.map(allocation=>{
    const payment=payments.get(Number(allocation.paymentId));
    if(!payment)return '';
    return `<tr><td>${esc(invoiceNo(payment))}</td><td class="paid-months">${esc(settledText(payment))}</td><td>${money(allocation.amount)}</td><td>${money(payment.amount)}</td><td>${esc(dateTime(payment))}</td>`
      + `<td class="actions"><button type="button" class="btn-edit" onclick="runChargeInvoiceAction('print',${payment.id})">طباعة</button><button type="button" class="btn-edit" onclick="runChargeInvoiceAction('edit',${payment.id})">تعديل</button><button type="button" class="btn-delete" onclick="runChargeInvoiceAction('cancel',${payment.id})">إلغاء</button></td></tr>`;
  }).join('');
  $('studentChargeDetailsBody').innerHTML=`<div class="charge-detail-summary">
      <span><small>تاريخ الاستحقاق</small><b>${esc(western(row.dueDate))}</b></span><span><small>الفترة</small><b>${period}</b></span>
      <span><small>الرسم الأصلي</small><b>${money(row.gross)}</b></span><span><small>الخصم</small><b>${money(row.discount||0)}</b></span>
      <span><small>المستحق</small><b>${money(row.amount)}</b></span><span><small>المدفوع</small><b>${money(row.paid)}</b></span>
      <span><small>المتبقي</small><b class="${row.remaining>0?'status-unpaid':'status-paid'}">${money(row.remaining)}</b></span>
    </div><h4 class="table-title">الفواتير المرتبطة بهذا الرسم</h4>
    <div class="table-scroll"><table><thead><tr><th>رقم الفاتورة</th><th>ما سدّدته الفاتورة</th><th>المخصَّص لهذا الرسم</th><th>إجمالي الفاتورة</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>${invoiceRows||'<tr><td colspan="6">لا توجد فاتورة مرتبطة بهذا الرسم حتى الآن.</td></tr>'}</tbody></table></div>`;
  $('studentChargeDetailsDialog').showModal();
}
window.runChargeInvoiceAction=(action,id)=>{
  if($('studentChargeDetailsDialog').open)$('studentChargeDetailsDialog').close();
  if(action==='print')return printStudentReceipt(id);
  if(action==='edit')return editStudentPayment(id);
  if(action==='cancel')return cancelStudentPayment(id);
};
// Period follows the school-year timeline (October … June of the next calendar
// year), not the due date: June is payable at enrolment yet still lies ahead
// until June arrives. Registration alone is placed on its due date.
function ledgerPeriodMonthOf(row){
  if(row.month===REGISTRATION||!MONTH_NUMBER[row.month])return String(row.dueDate||'').slice(0,7);
  return monthDate(row.month,startYearOf(feeSettings().schoolYear),1).slice(0,7);
}
function ledgerPeriodFor(row){
  if(!row)return 'outside';
  const current=today().slice(0,7);
  const month=ledgerPeriodMonthOf(row);
  return month<current?'past':month===current?'current':'future';
}
function refreshStudentFeeDetails() {
  const student = selectedFeeStudent();
  if (!student) {
    if($('student-fees').classList.contains('active-section'))go('fees',{historyMode:'replace'});
    return;
  }
  const identity=`${student.name} — القسم: ${student.className} — الرقم المدرسي: ${student.schoolNo}`;
  $('studentFeesIdentity').textContent=identity;
  const ledger = ledgerOf(student);
  // Remise et rصيد dائn ne s'affichent que lorsqu'ils existent.
  $('studentPaidSummary').textContent = `إجمالي المستحق: ${money(ledger.totalDue)} — المدفوع: ${money(ledger.totalPaid)} — المتبقي: ${money(ledger.outstanding)}`
    + (ledger.totalDiscount > 0 ? ` — الخصم: ${money(ledger.totalDiscount)}` : '')
    + (ledger.credit > 0 ? ` — رصيد دائن: ${money(ledger.credit)}` : '')
    + ` أوقية`
    + (student.discountReason ? ` (${student.discountReason})` : '')
    + `.`;
  // One row per invoice: the note lists the fees (registration and months)
  // the receipt settled, fully or in part, as allocated by the fee engine.
  const invoices = state.data.studentPayments.filter(p => Number(p.studentId) === Number(student.id))
    .sort((a,b) => Number(b.id) - Number(a.id)); // newest receipt first, in issue order like the allocation
  $('studentLedgerRows').innerHTML = invoices.map(p => {
    const id = Number(p.id);
    const note = p.cancelled ? `<span class="status-unpaid">${esc(cancelledText(p))}</span>` : esc(settledText(p,'\n')).replace(/\n/g,'<br>');
    const by = recordedBy(p);
    const actions = p.cancelled
      ? `<button type="button" class="btn-edit" onclick="runChargeInvoiceAction('print',${id})">طباعة</button>`
      : `<button type="button" class="btn-edit" onclick="runChargeInvoiceAction('print',${id})">طباعة</button><button type="button" class="btn-edit" onclick="runChargeInvoiceAction('edit',${id})">تعديل</button><button type="button" class="btn-delete" onclick="runChargeInvoiceAction('cancel',${id})">إلغاء</button>`;
    return `<tr data-payment-id="${id}"${p.cancelled ? ' class="receipt-cancelled"' : ''}>
      <td>${esc(dateTime(p)) || '—'}${by ? `<br><small>${esc(by)}</small>` : ''}</td>
      <td class="paid-months">${note}</td>
      <td class="actions ledger-actions-cell"><div class="ledger-invoice-actions"><small>${esc(invoiceNo(p))}</small><span>${actions}</span></div></td>
    </tr>`;
  }).join('') || '<tr class="ledger-empty"><td colspan="3">لا توجد فواتير مسجلة لهذا الطالب حتى الآن.</td></tr>';
  renderStudentFeeEntries();
}
function toggleDiscountFields(){
  const on=Boolean($('studentDiscountType').value);
  $('discountValueWrap').classList.toggle('hidden-field',!on);
  $('discountReasonWrap').classList.toggle('hidden-field',!on);
  if(!on){$('studentDiscountValue').value='';$('studentDiscountReason').value=''}
}
$('studentDiscountType').onchange=toggleDiscountFields;
$('closeStudentFees').onclick=goToPreviousPage;
$('studentChargeDetailsDialog').addEventListener('click',event=>{
  if(event.target.matches('[data-close-dialog="studentChargeDetailsDialog"]'))$('studentChargeDetailsDialog').close();
});
$('studentDiscountForm').onsubmit = async event => {
  event.preventDefault();
  const student = selectedFeeStudent();
  if (!student || !(await requirePassword())) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    await api(`/students/${student.id}/discount`, {method:'PUT',body:JSON.stringify({
      discountType:$('studentDiscountType').value,
      discountValue:western($('studentDiscountValue').value),
      discountReason:$('studentDiscountReason').value
    })});
    await load(); renderFees(); renderDashboard(); toast('تم حفظ خصم الطالب.');
  } catch(error) { toast(error.message); } finally { button.disabled = false; }
};
