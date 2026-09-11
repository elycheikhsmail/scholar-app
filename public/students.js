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
  try{
    const id=$('studentId').value;
    if(id){
      // Modifier une fiche existante demande la confirmation du mot de passe.
      if(!(await requirePassword()))return;
      await api(`/students/${id}`,{method:'PUT',body:JSON.stringify(payload)});
    }else{
      await api('/students',{method:'POST',body:JSON.stringify(payload)});
    }
    await load();
    resetStudent();
    renderStudents();
    renderFees();
    renderPaymentHistory();
    toast('تم حفظ الطالب.');
  }catch(error){
    toast(error.message);
  }
});
$('studentSearch').oninput=debounce(renderStudents);
$('studentDepartmentFilter').onchange=renderStudents;
// Fees live in the settings and in the departments, so the dues engine is
// handed both together wherever a ledger is computed.
function feeSettings(){return {...(state.settings||{}),departments:state.departments||[]}}
let ledgerCache=null,ledgerData=null,ledgerSettings=null,ledgerDepartments=null;
// Les relevés sont recalculés pour tous les élèves d'un coup et gardés en cache :
// chaque écran les interroge des dizaines de fois par rendu. Le cache tombe dès
// que `load()` remplace les données ou les réglages.
function ledgers(){
  if(ledgerCache&&ledgerData===state.data&&ledgerSettings===state.settings&&ledgerDepartments===state.departments)return ledgerCache;
  const settings=feeSettings();
  const byStudent=new Map();
  for(const p of state.data.studentPayments){
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
function paymentLabel(p){return p.month==='رسوم التسجيل'?'رسوم التسجيل':`رسوم شهر ${p.month}`}
function invoiceNo(p){return p?.invoiceNo||`F-${String(p?.id||0).padStart(6,'0')}`}
function lateFor(student,month){const row=chargeOf(student,month);return !!row&&row.remaining>0&&today()>row.dueDate}
function statusFor(student,month){return feeStatusOf(chargeOf(student,month),today())}
// La recherche porte sur le département, le nom, le numéro scolaire et le NNI.
function filteredStudents(){
  const query=$('studentSearch').value.toLowerCase().trim();
  const dep=$('studentDepartmentFilter').value;
  return state.data.students.filter(s=>(!dep||s.className===dep)
    &&[s.className,s.name,s.schoolNo,s.nni].join(' ').toLowerCase().includes(query));
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
      <td>${esc(s.nni)}</td>
      <td class="${status===ACTIVE_STATUS?'':'status-exempt'}">${esc(status)}${s.leaveDate?' — '+esc(s.leaveDate):''}</td>
      <td class="actions"><button class="btn-pay" onclick="openStudentFees(${s.id})">رسوم الطالب</button><button class="btn-edit" onclick="editStudent(${s.id})">تعديل</button><button class="btn-delete" onclick="removeStudent(${s.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('studentsTable').innerHTML=rows||'<tr><td colspan="8">لا يوجد طلاب مطابقون للتصفية.</td></tr>';
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
  $('studentFeeEntryDate').value = today();
  fillStudentDiscountForm(student);
  refreshStudentFeeDetails();
  showEditForm('student-fees','studentFeesForm','firstFeeChoice');
  $('studentAccountDetails').open = Boolean(showLedger);
  if(showLedger)requestAnimationFrame(()=>$('studentAccountDetails').scrollIntoView({block:'start'}));
};
function fillStudentDiscountForm(student) {
  $('studentDiscountType').value = student.discountType || '';
  $('studentDiscountValue').value = student.discountValue || '';
  $('studentDiscountReason').value = student.discountReason || '';
  toggleDiscountFields();
}

// The fee form no longer asks what a student owes: the registration fee comes
// from «إعدادات الرسوم» and the monthly fee from the level, so the form states
// them and asks the one question left — what has the family paid?
const FEE_CHOICES = [
  { value: 'none', label: 'لم يدفع بعد' },
  { value: 'full', label: 'دفع المبلغ كاملا' },
  { value: 'partial', label: 'دفع جزء من المبلغ' }
];
// One line per charge: the registration fee, then every month the student is
// enrolled in, with what the ledger has already settled on it.
function studentFeeRows(student) {
  return ledgerOf(student).rows.map((row, index) => ({ index, month: row.month, amount: row.amount, paid: row.paid, remaining: row.remaining }));
}
function feeEntryHtml(row) {
  const head = `<div class="fee-entry-head"><b>${esc(row.month)}</b><span>المستحق: ${money(row.amount)} أوقية</span>`
    + (row.paid > 0 ? `<span class="status-partial">سبق تسديد ${money(row.paid)}</span>` : '') + '</div>';
  const details = `<button type="button" class="secondary fee-details-button" data-charge-details="${row.index}" aria-label="عرض تفاصيل وفواتير ${esc(row.month)}">تفاصيل</button>`;
  if (!(row.amount > 0)) return `<div class="fee-entry" data-fee-entry="${row.index}">${head}<p class="status-exempt">بلا رسوم على هذا الشهر.</p>${details}</div>`;
  const settled = row.remaining <= 0;
  const selected = settled ? 'full' : row.paid > 0 ? 'partial' : 'none';
  const choices = FEE_CHOICES.map((choice, position) => {
    // A fee already settled, and the «لم يدفع بعد» of one partly settled, would
    // both mean taking money back: that is a receipt to delete, not a choice here.
    const disabled = settled || (choice.value === 'none' && row.paid > 0);
    return `<label class="fee-choice${disabled ? ' fee-choice-locked' : ''}">`
      + `<input type="radio" name="feeChoice${row.index}"${row.index === 0 && position === 0 ? ' id="firstFeeChoice"' : ''} value="${choice.value}"`
      + `${choice.value === selected ? ' checked' : ''}${disabled ? ' disabled' : ''}>${esc(choice.label)}</label>`;
  }).join('');
  const amount = `<label class="fee-entry-amount${selected === 'partial' && !settled ? '' : ' hidden-field'}">المبلغ المدفوع من هذا الرسم`
    + `<input type="number" data-fee-amount min="0.01" max="${round2(row.amount - 0.01)}" step="0.01"`
    + ` value="${selected === 'partial' && !settled ? row.paid : ''}"${settled ? ' disabled' : ''}></label>`;
  return `<div class="fee-entry${settled ? ' fee-entry-settled' : ''}" data-fee-entry="${row.index}">${head}`
    + `<div class="fee-entry-choices" role="radiogroup" aria-label="حالة دفع ${esc(row.month)}">${choices}</div>`
    + details
    + amount
    + (settled ? '<p class="status-paid">مسدَّد بالكامل. لتصحيحه احذف دفعته من كشف الحساب.</p>' : '')
    + '</div>';
}
function renderStudentFeeEntries() {
  const student = selectedFeeStudent();
  if (!student) return;
  const monthly = monthlyFeeFor(student, feeSettings());
  const discount = discountOn(student, monthly);
  $('studentFeeRates').innerHTML = `رسم التسجيل: <b>${money(registrationFeeFor(feeSettings()))}</b> أوقية`
    + ` — الرسم الشهري لمستوى ${esc(student.className || '—')}: <b>${money(monthly)}</b> أوقية`
    + (discount > 0 ? ` — بعد الخصم: <b>${money(round2(monthly - discount))}</b> أوقية` : '')
    + `. تُقرأ هذه المبالغ من «إعدادات الرسوم» ولا تُدخَل هنا؛ لتغييرها عدّل الإعدادات أو رسوم القسم.`;
  $('studentFeeEntries').innerHTML = studentFeeRows(student).map(feeEntryHtml).join('')
    || '<p>لا توجد رسوم مستحقة على هذا الطالب.</p>';
  updateStudentFeeSummary();
}
// What the form says now, line by line: the total the charge should show, the
// new money that implies, and the reason a line cannot be saved as entered.
function readStudentFeeEntries() {
  const student = selectedFeeStudent();
  if (!student) return [];
  return studentFeeRows(student).map(row => {
    const box = $('studentFeeEntries').querySelector(`[data-fee-entry="${row.index}"]`);
    const choice = box?.querySelector('input[type=radio]:checked')?.value || 'none';
    if (!(row.amount > 0) || choice === 'none') return { ...row, choice, target: row.paid, delta: 0, error: '' };
    if (choice === 'full') return { ...row, choice, target: row.amount, delta: round2(row.amount - row.paid), error: '' };
    const typed = Number(western(box.querySelector('[data-fee-amount]').value));
    if (!Number.isFinite(typed) || typed <= 0 || typed >= row.amount) {
      return { ...row, choice, target: row.paid, delta: 0, error: `المبلغ الجزئي لـ«${row.month}» يجب أن يكون أكبر من صفر وأقل من ${money(row.amount)}.` };
    }
    if (typed < row.paid) return { ...row, choice, target: row.paid, delta: 0, error: `لا يمكن أن يقل المبلغ المدفوع لـ«${row.month}» عن ${money(row.paid)} المسدَّدة سابقًا؛ احذف دفعتها من كشف الحساب لتصحيحها.` };
    return { ...row, choice, target: typed, delta: round2(typed - row.paid), error: '' };
  });
}
// Payments settle the oldest open fee first, so a month marked paid over an
// older unpaid one pays that older one instead. The form names them before it
// saves, instead of letting the ledger surprise the reader afterwards.
function skippedFeeMonths(entries) {
  const lastPaid = entries.reduce((last, entry, index) => entry.delta > 0 ? index : last, -1);
  return entries.slice(0, Math.max(lastPaid, 0)).filter(entry => entry.amount > 0 && entry.target < entry.amount).map(entry => entry.month);
}
function updateStudentFeeSummary() {
  const box = $('studentFeeEntrySummary'), save = $('saveStudentFees');
  if (!selectedFeeStudent()) { box.textContent = ''; box.className = 'fee-preview hidden'; return; }
  const entries = readStudentFeeEntries();
  const failed = entries.filter(entry => entry.error);
  if (failed.length) {
    box.className = 'fee-preview warn';
    box.innerHTML = failed.map(entry => `<p>${esc(entry.error)}</p>`).join('');
    save.disabled = true;
    return;
  }
  const paying = entries.filter(entry => entry.delta > 0);
  save.disabled = !paying.length;
  if (!paying.length) {
    box.className = 'fee-preview';
    box.textContent = 'حدّد ما دفعه الطالب من كل رسم ثم سجّل الدفعات.';
    return;
  }
  const total = round2(paying.reduce((sum, entry) => sum + entry.delta, 0));
  const skipped = skippedFeeMonths(entries);
  box.className = skipped.length ? 'fee-preview warn' : 'fee-preview';
  box.innerHTML = '<div class="fee-preview-totals">'
    + `<span><small>عدد الدفعات</small><b>${money(paying.length)}</b></span>`
    + `<span><small>إجمالي ما سيُسجَّل</small><b>${money(total)} أوقية</b></span>`
    + '</div><p>' + paying.map(entry => `${esc(entry.month)}: ${money(entry.delta)}`).join('، ') + '.</p>'
    + (skipped.length ? `<p class="status-unpaid">تنبيه: ${esc(skipped.join('، '))} لم تُسدَّد بعد، وتُوزَّع الدفعات على أقدم رسم غير مسدَّد أولًا.</p>` : '');
}
$('studentFeeEntries').addEventListener('change', event => {
  const box = event.target.closest('[data-fee-entry]');
  if (box && event.target.matches('input[type=radio]')) {
    const amount = box.querySelector('.fee-entry-amount');
    amount.classList.toggle('hidden-field', event.target.value !== 'partial');
    if (event.target.value === 'partial') amount.querySelector('[data-fee-amount]').focus();
  }
  updateStudentFeeSummary();
});
$('studentFeeEntries').addEventListener('click', event => {
  const button = event.target.closest('[data-charge-details]');
  if(button)openStudentChargeDetails(Number(button.dataset.chargeDetails));
});
$('studentFeeEntries').addEventListener('input', event => { if (event.target.matches('[data-fee-amount]')) updateStudentFeeSummary(); });
$('resetStudentFees').onclick = () => { $('studentFeeEntryDate').value = today(); renderStudentFeeEntries(); };
$('studentFeesForm').onsubmit = async event => {
  event.preventDefault();
  const student = selectedFeeStudent();
  if (!student) return;
  const entries = readStudentFeeEntries();
  const failed = entries.find(entry => entry.error);
  if (failed) return toast(failed.error);
  const paying = entries.filter(entry => entry.delta > 0);
  if (!paying.length) return toast('لم تحدَّد أي دفعة جديدة لتسجيلها.');
  const date = $('studentFeeEntryDate').value;
  if (!date) return toast('أدخل تاريخ الدفع.');
  const skipped = skippedFeeMonths(entries);
  if (skipped.length && !(await askConfirm(`رسوم ${skipped.join('، ')} لم تُسدَّد بعد، وتُوزَّع الدفعات على أقدم رسم غير مسدَّد أولًا، فقد تذهب المبالغ إليها. هل تريد المتابعة؟`))) return;
  const total = round2(paying.reduce((sum, entry) => sum + entry.delta, 0));
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('/student-payments/batch', {method:'POST',body:JSON.stringify({studentId:student.id,date,
      entries:paying.map(entry => ({month:entry.month,amount:entry.delta}))})});
    await load(); renderFees(); renderPaymentHistory(); renderDashboard();
    toast(`تم تسجيل ${money(paying.length)} دفعة بإجمالي ${money(total)} أوقية.`);
  } catch(error) { toast(error.message); } finally { button.disabled = false; }
};
function openStudentChargeDetails(index){
  const student=selectedFeeStudent();
  const row=student&&ledgerOf(student).rows[index];
  if(!student||!row)return;
  const payments=new Map(state.data.studentPayments.map(payment=>[Number(payment.id),payment]));
  $('studentChargeDetailsTitle').textContent=`تفاصيل ${row.month}`;
  $('studentChargeDetailsIdentity').textContent=`${student.name} — الرقم المدرسي: ${student.schoolNo}`;
  const period=row.dueDate<today().slice(0,7)+'-01'?'سابقة':row.dueDate.slice(0,7)===today().slice(0,7)?'جارية':'قادمة';
  const invoiceRows=row.allocations.map(allocation=>{
    const payment=payments.get(Number(allocation.paymentId));
    if(!payment)return '';
    return `<tr><td>${esc(invoiceNo(payment))}</td><td>${esc(paymentLabel(payment))}</td><td>${money(allocation.amount)}</td><td>${money(payment.amount)}</td><td>${esc(western(payment.date))}</td>`
      + `<td class="actions"><button type="button" class="btn-edit" onclick="runChargeInvoiceAction('print',${payment.id})">طباعة</button><button type="button" class="btn-edit" onclick="runChargeInvoiceAction('edit',${payment.id})">تعديل</button><button type="button" class="btn-delete" onclick="runChargeInvoiceAction('delete',${payment.id})">حذف</button></td></tr>`;
  }).join('');
  $('studentChargeDetailsBody').innerHTML=`<div class="charge-detail-summary">
      <span><small>تاريخ الاستحقاق</small><b>${esc(western(row.dueDate))}</b></span><span><small>الفترة</small><b>${period}</b></span>
      <span><small>الرسم الأصلي</small><b>${money(row.gross)}</b></span><span><small>الخصم</small><b>${money(row.discount||0)}</b></span>
      <span><small>المستحق</small><b>${money(row.amount)}</b></span><span><small>المدفوع</small><b>${money(row.paid)}</b></span>
      <span><small>المتبقي</small><b class="${row.remaining>0?'status-unpaid':'status-paid'}">${money(row.remaining)}</b></span>
    </div><h4 class="table-title">الفواتير المرتبطة بهذا الرسم</h4>
    <div class="table-scroll"><table><thead><tr><th>رقم الفاتورة</th><th>نوع الدفعة المسجلة</th><th>المخصَّص لهذا الرسم</th><th>إجمالي الفاتورة</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>${invoiceRows||'<tr><td colspan="6">لا توجد فاتورة مرتبطة بهذا الرسم حتى الآن.</td></tr>'}</tbody></table></div>`;
  $('studentChargeDetailsDialog').showModal();
}
window.runChargeInvoiceAction=(action,id)=>{
  $('studentChargeDetailsDialog').close();
  if(action==='print')return printStudentReceipt(id);
  if(action==='edit')return editStudentPayment(id);
  if(action==='delete')return deleteStudentPayment(id);
};
function refreshStudentFeeDetails() {
  const student = selectedFeeStudent();
  if (!student) {
    if($('student-fees').classList.contains('active-section'))go('fees',{historyMode:'replace'});
    return;
  }
  const identity=`${student.name} — القسم: ${student.className} — الرقم المدرسي: ${student.schoolNo}`;
  $('studentFeesIdentity').textContent=identity;
  const payments = state.data.studentPayments.filter(p => Number(p.studentId) === Number(student.id));
  const ledger = ledgerOf(student);
  // Remise et rصيد dائn ne s'affichent que lorsqu'ils existent.
  $('studentPaidSummary').textContent = `إجمالي المستحق: ${money(ledger.totalDue)} — المدفوع: ${money(ledger.totalPaid)} — المتبقي: ${money(ledger.outstanding)}`
    + (ledger.totalDiscount > 0 ? ` — الخصم: ${money(ledger.totalDiscount)}` : '')
    + (ledger.credit > 0 ? ` — رصيد دائن: ${money(ledger.credit)}` : '')
    + ` أوقية`
    + (student.discountReason ? ` (${student.discountReason})` : '')
    + `.`;
  $('studentLedgerRows').innerHTML = [REGISTRATION,...months].map(month => {
    const row = ledger.byMonth.get(month);
    if (!row) return `<tr><td>${esc(month)}</td><td>—</td><td class="status-exempt">خارج فترة القيد</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    const period = row.dueDate < today().slice(0,7)+'-01' ? 'سابقة' : row.dueDate.slice(0,7) === today().slice(0,7) ? 'جارية' : 'قادمة';
    const covered = row.allocations.map(a => `${esc(a.invoiceNo || `F-${String(a.paymentId||0).padStart(6,'0')}`)}: ${money(a.amount)}`).join('<br>') || '—';
    return `<tr>
      <td>${esc(month)}</td>
      <td>${esc(row.dueDate)}</td>
      <td>${period}</td>
      <td>${money(row.gross)}</td>
      <td class="${row.discount > 0 ? 'status-exempt' : ''}">${row.discount > 0 ? money(row.discount) : '—'}</td>
      <td>${money(row.amount)}</td>
      <td>${money(row.paid)}</td>
      <td class="${row.remaining > 0 ? 'overdue-soft' : 'status-paid'}">${money(row.remaining)}</td>
      <td class="paid-months">${covered}</td>
    </tr>`;
  }).join('');
  renderStudentFeeEntries();
  // The ledger is where a wrong payment is noticed, so it edits and deletes in place.
  const paymentRows = payments.slice()
    .sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id)
    .map(p=>`<tr>
      <td>${esc(invoiceNo(p))}</td>
      <td>${esc(paymentLabel(p))}</td>
      <td>${money(p.amount)}</td>
      <td>${esc(western(p.date))}</td>
      <td class="actions"><button type="button" class="btn-edit" onclick="printStudentReceipt(${p.id})">طباعة</button><button type="button" class="btn-edit" onclick="editStudentPayment(${p.id})">تعديل</button><button type="button" class="btn-delete" onclick="deleteStudentPayment(${p.id})">حذف</button></td>
    </tr>`).join('');
  $('studentLedgerPayments').innerHTML = paymentRows || '<tr><td colspan="5">لا توجد دفعات مسجلة لهذا الطالب.</td></tr>';
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
