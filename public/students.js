function populateDepartments(){
  const studentFilterValue=$('studentDepartmentFilter').value;
  $('className').innerHTML=`<option value="">اختر القسم</option>`+state.departments.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  $('studentDepartmentFilter').innerHTML=`<option value="">كل الأقسام والشُّعب</option>`+state.departments.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  if(state.departments.some(d=>d.name===studentFilterValue))$('studentDepartmentFilter').value=studentFilterValue;
  $('feeDepartment').innerHTML=`<option value="">الكل</option>`+state.departments.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
}

function firstCallNo(dep,exclude=null){const used=new Set(state.data.students.filter(s=>s.className===dep&&Number(s.id)!==Number(exclude)).map(s=>parseInt(s.callNo,10)).filter(Number.isFinite));let n=1;while(used.has(n))n++;return String(n)}
function departmentFee(dep){const d=state.departments.find(x=>x.name===dep);return Number(d?.monthlyFee||0)}
function toggleLeaveField(){const active=$('studentStatus').value===ACTIVE_STATUS;$('leaveDateWrap').classList.toggle('hidden-field',active);if(active)$('studentLeaveDate').value=''}
$('studentStatus').onchange=toggleLeaveField;
function resetStudent(){if(!$('studentForm'))return;$('studentForm').reset();$('studentId').value='';$('registrationDate').value=today();$('callNo').value='';$('gender').value='';$('studentStatus').value=ACTIVE_STATUS;$('studentLeaveDate').value='';toggleLeaveField()}
$('cancelStudent').onclick=resetStudent;
$('className').addEventListener('change',()=>{$('callNo').value=$('className').value?firstCallNo($('className').value,$('studentId').value||null):''})
$('studentForm').addEventListener('submit',async e=>{e.preventDefault();const p={schoolNo:western($('schoolNo').value),name:$('studentName').value,callNo:$('callNo').value,gender:$('gender').value,nni:western($('nni').value),birthPlace:$('birthPlace').value,birthDate:$('birthDate').value,guardianName:$('guardianName').value,guardianPhone:western($('guardianPhone').value),className:$('className').value,registrationDate:$('registrationDate').value,status:$('studentStatus').value,leaveDate:$('studentLeaveDate').value,notes:$('studentNotes').value};try{const id=$('studentId').value;let created=null;if(id){if(!(await requirePassword()))return;created=await api(`/students/${id}`,{method:'PUT',body:JSON.stringify(p)})}else created=await api('/students',{method:'POST',body:JSON.stringify(p)});await load();resetStudent();renderStudents();renderFees();renderPaymentHistory();toast('تم حفظ الطالب.');}catch(err){toast(err.message)}});
$('studentSearch').oninput=debounce(renderStudents);
$('studentDepartmentFilter').onchange=renderStudents;
let ledgerCache=null,ledgerData=null,ledgerSettings=null;
function ledgers(){
  if(ledgerCache&&ledgerData===state.data&&ledgerSettings===state.settings)return ledgerCache;
  const byStudent=new Map();
  for(const p of state.data.studentPayments){const key=Number(p.studentId);const list=byStudent.get(key);if(list)list.push(p);else byStudent.set(key,[p])}
  const map=new Map();
  for(const s of state.data.students)map.set(Number(s.id),ledgerFor(s,byStudent.get(Number(s.id))||[],state.settings||{}));
  ledgerData=state.data;ledgerSettings=state.settings;ledgerCache=map;return map;
}
function ledgerOf(student){return ledgers().get(Number(student.id))||ledgerFor(student,[],state.settings||{})}
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
function statusFor(student,month){
  const row=chargeOf(student,month);
  if(!row)return['خارج فترة القيد','status-exempt'];
  if(row.amount<=0)return['لا توجد رسوم','status-exempt'];
  if(row.remaining<=0)return['تم الدفع','status-paid'];
  if(lateFor(student,month)||row.paid===0)return[row.paid>0?'هناك باقي':'لم يدفع بعد','status-unpaid'];
  return['هناك باقي','status-partial'];
}
function renderStudents(){const q=$('studentSearch').value.toLowerCase().trim(),dep=$('studentDepartmentFilter').value;const list=state.data.students.filter(s=>(!dep||s.className===dep)&&[s.className,s.name,s.schoolNo,s.nni].join(' ').toLowerCase().includes(q));$('studentCount').textContent=`عدد الطلاب: ${list.length}`;$('studentsTable').innerHTML=list.map(s=>`<tr><td>${esc(s.className)}</td><td>${esc(s.callNo)}</td><td>${esc(s.schoolNo)}</td><td>${esc(s.name)}</td><td>${esc(s.gender||'')}</td><td>${esc(s.nni)}</td><td class="${(s.status||ACTIVE_STATUS)===ACTIVE_STATUS?'':'status-exempt'}">${esc(s.status||ACTIVE_STATUS)}${s.leaveDate?' — '+esc(s.leaveDate):''}</td><td class="actions"><button class="btn-pay" onclick="openStudentFees(${s.id})">رسوم الطالب</button><button class="btn-edit" onclick="editStudent(${s.id})">تعديل</button><button class="btn-delete" onclick="removeStudent(${s.id})">حذف</button></td></tr>`).join('')}
window.editStudent=id=>{const s=state.data.students.find(x=>x.id===id);if(!s)return;for(const [id2,v] of Object.entries({studentId:s.id,className:s.className,callNo:s.callNo,schoolNo:s.schoolNo,studentName:s.name,gender:s.gender||'',nni:s.nni,birthPlace:s.birthPlace,birthDate:s.birthDate,guardianName:s.guardianName,guardianPhone:s.guardianPhone,registrationDate:s.registrationDate,studentStatus:s.status||ACTIVE_STATUS,studentLeaveDate:s.leaveDate||'',studentNotes:s.notes}))$(id2).value=v??'';toggleLeaveField();showEditForm('students','studentForm','studentName')}
window.removeStudent=async id=>{await deleteWithPassword(`/students/${id}`,'هل تريد حذف الطالب وجميع دفعاته؟','تم حذف الطالب وجميع دفعاته.');};

let selectedFeeStudentId = null;
$('studentPaymentMonth').innerHTML = monthOptionsHtml();
function selectedFeeStudent() { return state.data?.students.find(s => Number(s.id) === Number(selectedFeeStudentId)); }
window.openStudentFees = (id, showLedger = false) => {
  selectedFeeStudentId = Number(id);
  const student = selectedFeeStudent();
  if (!student) return;
  go('fees');
  $('studentFeesPanel').classList.remove('hidden');
  $('studentLedger').classList.toggle('hidden', !showLedger);
  $('studentRegistrationFee').value = student.registrationFee || 0;
  $('studentFeeFrom').value = months.includes($('feeMonth').value) ? $('feeMonth').value : currentMonth();
  $('studentDiscountType').value = student.discountType || '';
  $('studentDiscountValue').value = student.discountValue || '';
  $('studentDiscountReason').value = student.discountReason || '';
  toggleDiscountFields();
  showFeeForMonth();
  $('studentPaymentAmount').value = '';
  const selectedMonth=$('feeMonth').value;
  $('studentPaymentMonth').value = selectedMonth===TOTAL_MODE ? (ledgerOf(student).oldestUnpaid?.month || REGISTRATION) : selectedMonth;
  $('studentPaymentDate').value = today();
  refreshStudentFeeDetails();
  if (showLedger) {
    requestAnimationFrame(() => $('studentLedger').scrollIntoView({behavior:'smooth',block:'start'}));
  } else showEditForm('fees','studentFeesForm','studentRegistrationFee');
};
function refreshStudentFeeDetails() {
  const student = selectedFeeStudent();
  if (!student) { $('studentFeesPanel').classList.add('hidden'); return; }
  $('studentFeesIdentity').textContent = `${student.name} — القسم: ${student.className} — الرقم المدرسي: ${student.schoolNo}`;
  const payments = state.data.studentPayments.filter(p => Number(p.studentId) === Number(student.id));
  const ledger = ledgerOf(student);
  $('studentPaidSummary').textContent = `إجمالي المستحق: ${money(ledger.totalDue)} — المدفوع: ${money(ledger.totalPaid)} — المتبقي: ${money(ledger.outstanding)}${ledger.totalDiscount > 0 ? ` — الخصم: ${money(ledger.totalDiscount)}` : ''}${ledger.credit > 0 ? ` — رصيد دائن: ${money(ledger.credit)}` : ''} أوقية${student.discountReason ? ` (${student.discountReason})` : ''}. أدخل دفعة غير مسجلة فقط؛ تُوزَّع تلقائيًا على أقدم استحقاق غير مسدَّد.`;
  $('studentLedgerRows').innerHTML = [REGISTRATION,...months].map(month => {
    const row = ledger.byMonth.get(month);
    if (!row) return `<tr><td>${esc(month)}</td><td>—</td><td class="status-exempt">خارج فترة القيد</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    const period = row.dueDate < today().slice(0,7)+'-01' ? 'سابقة' : row.dueDate.slice(0,7) === today().slice(0,7) ? 'جارية' : 'قادمة';
    const covered = row.allocations.map(a => `${esc(a.invoiceNo || `F-${String(a.paymentId||0).padStart(6,'0')}`)}: ${money(a.amount)}`).join('<br>') || '—';
    return `<tr><td>${esc(month)}</td><td>${esc(row.dueDate)}</td><td>${period}</td><td>${money(row.gross)}</td><td class="${row.discount > 0 ? 'status-exempt' : ''}">${row.discount > 0 ? money(row.discount) : '—'}</td><td>${money(row.amount)}</td><td>${money(row.paid)}</td><td class="${row.remaining > 0 ? 'overdue-soft' : 'status-paid'}">${money(row.remaining)}</td><td class="paid-months">${covered}</td></tr>`;
  }).join('');
  $('studentLedgerPayments').innerHTML = payments.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id).map(p=>`<tr><td>${esc(invoiceNo(p))}</td><td>${esc(paymentLabel(p))}</td><td>${money(p.amount)}</td><td>${esc(p.date)}</td></tr>`).join('') || '<tr><td colspan="4">لا توجد دفعات مسجلة لهذا الطالب.</td></tr>';
}
function toggleDiscountFields(){
  const on=Boolean($('studentDiscountType').value);
  $('discountValueWrap').classList.toggle('hidden-field',!on);
  $('discountReasonWrap').classList.toggle('hidden-field',!on);
  if(!on){$('studentDiscountValue').value='';$('studentDiscountReason').value=''}
}
$('studentDiscountType').onchange=toggleDiscountFields;
// The form edits one fee period at a time, so it shows that period's amount.
function showFeeForMonth(){const student=selectedFeeStudent();if(student)$('studentMonthlyFee').value=monthlyFeeFor(student,$('studentFeeFrom').value)}
$('studentFeeFrom').innerHTML = months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
$('studentFeeFrom').onchange = showFeeForMonth;
$('showStudentLedger').onclick = () => { refreshStudentFeeDetails(); $('studentLedger').classList.toggle('hidden'); if (!$('studentLedger').classList.contains('hidden')) $('studentLedger').scrollIntoView({behavior:'smooth',block:'start'}); };
$('closeStudentFees').onclick = () => { selectedFeeStudentId = null; $('studentFeesPanel').classList.add('hidden'); };
$('studentFeesForm').onsubmit = async event => {
  event.preventDefault();
  const student = selectedFeeStudent();
  if (!student || !(await requirePassword())) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    await api(`/students/${student.id}/fees`, {method:'PUT',body:JSON.stringify({registrationFee:$('studentRegistrationFee').value,monthlyFee:$('studentMonthlyFee').value,effectiveFrom:$('studentFeeFrom').value,discountType:$('studentDiscountType').value,discountValue:western($('studentDiscountValue').value),discountReason:$('studentDiscountReason').value})});
    await load(); renderFees(); renderDashboard(); toast('تم حفظ رسوم الطالب.');
  } catch(error) { toast(error.message); } finally { button.disabled = false; }
};
$('studentFeePaymentForm').onsubmit = async event => {
  event.preventDefault();
  const student = selectedFeeStudent();
  if (!student) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('/student-payments',{method:'POST',body:JSON.stringify({studentId:student.id,month:$('studentPaymentMonth').value,amount:$('studentPaymentAmount').value,date:$('studentPaymentDate').value})});
    $('studentPaymentAmount').value = '';
    await load(); renderFees(); renderPaymentHistory(); renderDashboard(); toast('تم تسجيل دفعة الطالب.');
  } catch(error) { toast(error.message); } finally { button.disabled = false; }
};
