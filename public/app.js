const months=MONTHS;
const monthNumber=MONTH_NUMBER;
let state={token:'',settings:null,data:null,departments:[],examData:{settings:{},exams:[]}};
const $=id=>document.getElementById(id);
const API_BASE=window.location.protocol==='file:'?'http://127.0.0.1:3780/api':'/api';
const money=n=>Number(n||0).toLocaleString('en-US',{useGrouping:true,maximumFractionDigits:2});
const western=v=>String(v??'').replace(/[٠-٩۰-۹]/g,d=>String(Math.max('٠١٢٣٤٥٦٧٨٩'.indexOf(d),'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));

// Native prompt() is unavailable in Electron and some embedded browsers.
function showInputDialog(message, defaultValue = '', confirmation = false) {
  if (document.querySelector('.input-dialog[open]')) return Promise.resolve(confirmation ? false : null);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'input-dialog';
    dialog.setAttribute('aria-labelledby', 'input-dialog-title');
    const form = document.createElement('form');
    form.method = 'dialog';
    const title = document.createElement('h3');
    title.id = 'input-dialog-title';
    title.textContent = message;
    form.append(title);
    const input = document.createElement('input');
    input.setAttribute('aria-label', message);
    input.type = /كلمة المرور/.test(message) ? 'password' : 'text';
    input.autocomplete = input.type === 'password' ? 'current-password' : 'off';
    input.value = String(defaultValue ?? '');
    if (!confirmation) form.append(input);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.type = 'submit';
    submit.textContent = 'تأكيد';
    const cancel = document.createElement('button');
    cancel.className = 'secondary';
    cancel.type = 'button';
    cancel.textContent = 'إلغاء';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    form.addEventListener('submit', event => { event.preventDefault(); dialog.close('confirm'); });
    actions.append(submit, cancel);
    form.append(actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue === 'confirm' ? (confirmation ? true : input.value) : (confirmation ? false : null);
      input.value = '';
      dialog.remove();
      resolve(result);
    }, { once: true });
    dialog.showModal();
    (confirmation ? cancel : input).focus();
  });
}
const askInput = (message, value = '') => showInputDialog(message, value);
const askConfirm = message => showInputDialog(message, '', true);

const today=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>{const m=new Date().getMonth()+1;return m>=10?months[m-10]:m<=6?months[m+2]:months[0]};
const debounce=(fn,ms=200)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms)}};
// The total view is an extra entry in the fee selector only; the selectors that
// pick which fee a payment settles must stay a plain list of months.
const monthOptionsHtml=()=>`<option value="${REGISTRATION}">${REGISTRATION}</option>`+MONTHS.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(state.token)headers.Authorization=`Bearer ${state.token}`;return fetch(`${API_BASE}${path}`,{...options,headers}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&state.token&&path!=='/login')location.reload();throw Error(x.error||'حدث خطأ.');}return x})}
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',3200)}
function setDate(id){if($(id)&&!$(id).value)$(id).value=today()}
function tick(){const d=new Date();$('clock').textContent=western(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d));$('today').textContent=western(new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d))}
setInterval(tick,1000);tick();
document.addEventListener('input',e=>{if(e.target.matches('input[type=number],input[inputmode="numeric"]'))e.target.value=western(e.target.value)});

async function load(){state.data=await api('/data');state.departments=await api('/departments');state.examData=await api('/exams');populateDepartments();populateExamDepartments();refreshStudentFeeDetails()}
function applySettings(){applyApplicationMode(state.settings.applicationMode);$('schoolName').textContent=state.settings.schoolName;$('schoolYear').textContent=state.settings.schoolYear;$('loginSchoolName').textContent=state.settings.schoolName;$('managerNameHome').textContent=state.settings.managerName||'غير محدد';$('managerPhoneHome').textContent=western(state.settings.managerPhone||'')}
function setupMonths(id){$(id).innerHTML=months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}
$('feeMonth').innerHTML=monthOptionsHtml();setupMonths('salaryMonth');setupMonths('advanceMonth');$('feeMonth').value=currentMonth();$('salaryMonth').value=currentMonth();$('advanceMonth').value=currentMonth();

async function enterApplication(x){state.token=x.token;state.settings=x.settings;await load();$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');applySettings();resetStudent();resetTeacher();resetExpense();resetSalaryDates();resetAdvance();go('dashboard')}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const x=await api('/login',{method:'POST',body:JSON.stringify({username:western($('loginUsername').value),password:western($('loginPassword').value)})});await enterApplication(x)}catch(err){toast(err.message)}});
$('logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}location.reload()};
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.section));
function go(id){document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===id));document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active-section',x.id===id));if(id==='dashboard')renderDashboard();if(id==='students')renderStudents();if(id==='fees')renderFees();if(id==='collections')renderPaymentHistory();if(id==='staff'){renderTeachers();renderSalary();renderAdvances()}if(id==='expenses')renderExpenses();if(id==='exams'){renderExamSection();}if(id==='reports')renderReports();if(id==='settings'){renderSettings();renderDepartments()}}

function showEditForm(sectionId,formId,focusId){
  if(!$(sectionId)?.classList.contains('active-section'))go(sectionId);
  requestAnimationFrame(()=>{
    const form=$(formId),target=form?.closest('.panel')||form;
    if(!target)return;
    target.scrollIntoView({behavior:'smooth',block:'start'});
    target.classList.remove('editing-record');
    void target.offsetWidth;
    target.classList.add('editing-record');
    setTimeout(()=>target.classList.remove('editing-record'),1800);
    $(focusId)?.focus({preventScroll:true});
  });
}

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

const TOTAL_MODE='__total__';
const FEE_ROW_LIMIT=300;
let feeSort={key:'name',dir:1},feeShowAll=false,feeView={month:'',rows:[]};
const daysBetween=(from,to)=>Math.round((new Date(to+'T00:00:00')-new Date(from+'T00:00:00'))/86400000);

$('feeMonth').insertAdjacentHTML('afterbegin',`<option value="${TOTAL_MODE}">إجمالي المستحقات (كل الأشهر)</option>`);
$('feeMonth').onchange=()=>{feeShowAll=false;renderFees();renderPaymentHistory()};
$('feeDepartment').onchange=renderFees;
$('feeStatus').onchange=renderFees;
$('feeMinRemaining').oninput=debounce(renderFees);
$('feeSearch').oninput=debounce(renderFees);
function registrationFeesPaid(student){const row=chargeOf(student,REGISTRATION);return !!row&&row.amount>0&&row.remaining<=0}

// One table row per student: a single month, or the whole year in the total view.
function feeRowFor(student,month){
  const ledger=ledgerOf(student);
  if(month===TOTAL_MODE){
    const oldest=ledger.oldestUnpaid;
    return {student,ledger,gross:round2(ledger.rows.reduce((sum,row)=>sum+row.gross,0)),discount:ledger.totalDiscount,
      due:ledger.totalDue,paid:ledger.allocated,remaining:ledger.outstanding,
      dueDate:oldest?oldest.dueDate:'',charged:ledger.rows.length>0,unpaidCount:ledger.unpaidCount};
  }
  const row=ledger.byMonth.get(month);
  return {student,ledger,gross:row?row.gross:0,discount:row?row.discount:0,due:row?row.amount:0,paid:row?row.paid:0,
    remaining:row?row.remaining:0,dueDate:row?row.dueDate:'',charged:!!row,unpaidCount:row&&row.remaining>0?1:0};
}
function overdueDays(row){return row.remaining>0&&row.dueDate&&row.dueDate<today()?daysBetween(row.dueDate,today()):0}
function rowStatus(row,month){
  if(month!==TOTAL_MODE)return statusFor(row.student,month);
  if(!row.charged)return['خارج فترة القيد','status-exempt'];
  if(row.due<=0)return['لا توجد رسوم','status-exempt'];
  if(row.remaining<=0)return['مسدَّد بالكامل','status-paid'];
  return[`غير مسدَّد: ${row.unpaidCount}`,'status-unpaid'];
}
function passesFeeFilter(row,status,minRemaining){
  if(row.remaining<minRemaining)return false;
  if(status==='due')return row.remaining>0;
  if(status==='late')return overdueDays(row)>0;
  if(status==='paid')return row.due>0&&row.remaining<=0;
  if(status==='none')return row.due<=0;
  return true;
}

const FEE_COLUMNS=[
  {key:'className',label:'القسم',value:r=>r.student.className||''},
  {key:'schoolNo',label:'الرقم المدرسي',value:r=>r.student.schoolNo||''},
  {key:'callNo',label:'رقم النداء',value:r=>Number(r.student.callNo)||0},
  {key:'name',label:'الطالب',value:r=>r.student.name||''},
  {key:'gross',label:'الرسوم',value:r=>r.gross},
  {key:'discount',label:'الخصم',value:r=>r.discount},
  {key:'due',label:'المستحق',value:r=>r.due},
  {key:'paid',label:'المدفوع',value:r=>r.paid},
  {key:'remaining',label:'المتبقي',value:r=>r.remaining},
  {key:'dueDate',label:'تاريخ الاستحقاق',value:r=>r.dueDate||''},
  {key:'age',label:'عمر الدَّين',value:r=>overdueDays(r)}
];
function feeColumnLabel(column,month){return column.key==='dueDate'&&month===TOTAL_MODE?'أقدم استحقاق غير مسدَّد':column.label}
function sortFeeRows(rows){
  const column=FEE_COLUMNS.find(c=>c.key===feeSort.key)||FEE_COLUMNS[3];
  return rows.sort((a,b)=>{
    const x=column.value(a),y=column.value(b);
    const compared=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'ar');
    return compared*feeSort.dir||String(a.student.name||'').localeCompare(String(b.student.name||''),'ar');
  });
}
$('feesHead').onclick=event=>{
  const key=event.target.closest('[data-sort]')?.dataset.sort;
  if(!key)return;
  feeSort=feeSort.key===key?{key,dir:-feeSort.dir}:{key,dir:1};
  renderFees();
};
function ageCell(days){
  if(!days)return '<td>—</td>';
  return `<td class="${days>60?'overdue-strong':days>30?'status-partial':'overdue-soft'}">${money(days)} يومًا</td>`;
}
function feeRowHtml(row,month){
  const s=row.student,days=overdueDays(row),[label,cls]=rowStatus(row,month),blocked=row.ledger.outstanding<=0;
  return `<tr class="${days>0?'overdue-row':''}"><td>${esc(s.className)}</td><td>${esc(s.schoolNo)}</td><td>${esc(s.callNo)}</td><td>${esc(s.name)}</td><td>${money(row.gross)}</td><td class="${row.discount>0?'status-exempt':''}">${row.discount>0?money(row.discount):'—'}</td><td>${money(row.due)}</td><td>${money(row.paid)}</td><td class="${row.remaining>0?(days>0?'overdue-strong':'overdue-soft'):'status-paid'}">${money(row.remaining)}</td><td>${row.charged&&row.dueDate?western(row.dueDate):'—'}</td>${ageCell(days)}<td class="${cls}">${esc(label)}</td><td><input id="fp-${s.id}" class="payment-input" type="number" min="1" max="${row.ledger.outstanding}" ${blocked?'disabled':''}></td><td><button class="${registrationFeesPaid(s)?'btn-pay':'btn-edit'}" onclick="openStudentFees(${s.id})">${registrationFeesPaid(s)?'تم دفع الرسوم':'استمارة الرسوم'}</button><button class="btn-edit" onclick="openStudentFees(${s.id},true)">تفاصيل حساب الطالب</button><button class="btn-pay" onclick="payFee(${s.id})" ${blocked?'disabled':''}>حفظ وطباعة</button></td></tr>`;
}
function renderFees(){
  const month=$('feeMonth').value,dep=$('feeDepartment').value,query=$('feeSearch').value.toLowerCase().trim();
  const status=$('feeStatus').value,minRemaining=Number($('feeMinRemaining').value)||0;
  const rows=sortFeeRows(state.data.students
    .filter(s=>(!dep||s.className===dep)&&[s.name,s.schoolNo,s.callNo].join(' ').toLowerCase().includes(query))
    .map(s=>feeRowFor(s,month))
    .filter(row=>passesFeeFilter(row,status,minRemaining)));
  feeView={month,rows};
  $('feesHead').innerHTML=FEE_COLUMNS.map(column=>`<th class="sortable" data-sort="${column.key}" title="اضغط للفرز">${esc(feeColumnLabel(column,month))}${feeSort.key===column.key?(feeSort.dir>0?' ▲':' ▼'):''}</th>`).join('')+'<th>الحالة</th><th>دفعة جديدة</th><th>إجراء</th>';
  const totals=rows.reduce((a,r)=>({gross:a.gross+r.gross,discount:a.discount+r.discount,due:a.due+r.due,paid:a.paid+r.paid,remaining:a.remaining+r.remaining,credit:a.credit+r.ledger.credit}),{gross:0,discount:0,due:0,paid:0,remaining:0,credit:0});
  const shown=feeShowAll?rows:rows.slice(0,FEE_ROW_LIMIT);
  $('feesTable').innerHTML=shown.map(row=>feeRowHtml(row,month)).join('')||`<tr><td colspan="14">لا توجد نتائج مطابقة للتصفية.</td></tr>`;
  const capped=rows.length>FEE_ROW_LIMIT;
  $('feesRowNotice').classList.toggle('hidden',!capped);
  $('feesRowNotice').innerHTML=capped?`يُعرض ${money(shown.length)} من ${money(rows.length)} صفًّا. <button type="button" class="secondary" id="showAllFees">${feeShowAll?'الاكتفاء بأول '+FEE_ROW_LIMIT:'عرض كل الصفوف'}</button>`:'';
  if($('showAllFees'))$('showAllFees').onclick=()=>{feeShowAll=!feeShowAll;renderFees()};
  $('feeTotals').innerHTML=`<span>الطلاب: ${money(rows.length)}</span><span>الرسوم: ${money(totals.gross)}</span><span class="status-exempt">الخصم: ${money(totals.discount)}</span><span>المستحق: ${money(totals.due)}</span><span class="status-paid">المدفوع: ${money(totals.paid)}</span><span class="overdue-soft">المتبقي: ${money(totals.remaining)}</span><span class="status-overpaid">رصيد دائن: ${money(totals.credit)}</span>`;
}

// --- export and printing ----------------------------------------------------
function feeSheetRows(){
  const {month,rows}=feeView;
  const head=['القسم','الرقم المدرسي','رقم النداء','الطالب','ولي الأمر','الهاتف','الرسوم','الخصم','المستحق','المدفوع','المتبقي',month===TOTAL_MODE?'أقدم استحقاق غير مسدَّد':'تاريخ الاستحقاق','التأخير بالأيام','الحالة'];
  return [head,...rows.map(r=>[r.student.className||'',r.student.schoolNo||'',r.student.callNo||'',r.student.name||'',
    r.student.guardianName||'',r.student.guardianPhone||'',r.gross,r.discount,r.due,r.paid,r.remaining,
    r.charged&&r.dueDate?r.dueDate:'',overdueDays(r)||'',rowStatus(r,month)[0]])];
}
function feeSheetTitle(){return feeView.month===TOTAL_MODE?'إجمالي مستحقات الطلاب':`مستحقات الطلاب — ${feeView.month}`}
const PRINT_STYLE='*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#111;margin:14px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:0 0 10px;font-weight:400;color:#444}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:4px 5px;text-align:right}th{background:#eee}.notice{border:1px solid #999;border-radius:6px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}.notice h3{margin:0 0 6px;font-size:14px}.total{font-weight:900}.print{margin:10px 0;padding:8px 14px;border:0;background:#111;color:#fff;border-radius:5px;font-weight:700;cursor:pointer}@media print{.print{display:none}}';
function openPrintWindow(title,bodyHtml){
  const w=window.open('','_blank','width=1000,height=760');
  if(!w){toast('اسمح للنوافذ المنبثقة حتى تتم الطباعة.');return}
  const banner=state.settings?.applicationMode==='test'?'<h2>نسخة للتجريب فقط</h2>':'';
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_STYLE}</style></head><body><h1>${esc(state.settings?.schoolName||'')}</h1><h2>${esc(title)} — السنة الدراسية ${esc(state.settings?.schoolYear||'')} — ${western(today())}</h2>${banner}<button class="print" onclick="window.print()">طباعة</button>${bodyHtml}</body></html>`);
  w.document.close();
}
$('exportFees').onclick=()=>{
  if(!feeView.rows.length)return toast('لا توجد صفوف للتصدير.');
  const cell=value=>{const text=String(value??'');return /[";\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
  // The BOM makes Excel read the Arabic headers as UTF-8.
  const blob=new Blob(['﻿'+feeSheetRows().map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${feeSheetTitle()} — ${today()}.csv`;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('تم تصدير الملف.');
};
$('printFees').onclick=()=>{
  if(!feeView.rows.length)return toast('لا توجد صفوف للطباعة.');
  const [head,...body]=feeSheetRows();
  const totals=feeView.rows.reduce((a,r)=>({due:a.due+r.due,paid:a.paid+r.paid,remaining:a.remaining+r.remaining}),{due:0,paid:0,remaining:0});
  const headHtml=head.map(h=>`<th>${esc(h)}</th>`).join('');
  const bodyHtml=body.map(row=>`<tr>${row.map(c=>`<td>${esc(typeof c==='number'?money(c):c)}</td>`).join('')}</tr>`).join('');
  const footHtml=`<tr class="total"><td colspan="8">الإجمالي (${money(feeView.rows.length)} طالبًا)</td><td>${money(totals.due)}</td><td>${money(totals.paid)}</td><td>${money(totals.remaining)}</td><td colspan="3"></td></tr>`;
  openPrintWindow(feeSheetTitle(),`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody><tfoot>${footHtml}</tfoot></table>`);
};
$('printReminders').onclick=()=>{
  const debtors=feeView.rows.filter(row=>row.remaining>0);
  if(!debtors.length)return toast('لا يوجد طلاب عليهم متبقٍّ ضمن التصفية الحالية.');
  const notices=debtors.map(row=>{
    const unpaid=row.ledger.rows.filter(charge=>charge.remaining>0);
    const lines=unpaid.map(charge=>`<tr><td>${esc(charge.month)}</td><td>${esc(charge.dueDate)}</td><td>${money(charge.remaining)}</td></tr>`).join('');
    return `<div class="notice"><h3>${esc(row.student.name)} — ${esc(row.student.className)} — رقم النداء ${esc(row.student.callNo)}</h3><div>ولي الأمر: ${esc(row.student.guardianName||'—')} — الهاتف: ${esc(row.student.guardianPhone||'—')}</div><table><thead><tr><th>الاستحقاق</th><th>تاريخ الاستحقاق</th><th>المتبقي</th></tr></thead><tbody>${lines}</tbody><tfoot><tr class="total"><td colspan="2">إجمالي المتبقي</td><td>${money(row.ledger.outstanding)} أوقية</td></tr></tfoot></table><div>نرجو تسديد المبلغ لدى إدارة المدرسة. توقيع الإدارة: ____________</div></div>`;
  }).join('');
  openPrintWindow(`إشعارات أولياء الأمور (${money(debtors.length)})`,notices);
};

window.payFee=async id=>{const input=$(`fp-${id}`),amount=Number(input.value)||0;if(!amount)return toast('أدخل مبلغ الدفعة.');const selected=$('feeMonth').value;const month=selected===TOTAL_MODE?(ledgerOf(studentById(id))?.oldestUnpaid?.month||REGISTRATION):selected;try{const payment=await api('/student-payments',{method:'POST',body:JSON.stringify({studentId:id,month,amount,date:today()})});await load();renderFees();renderPaymentHistory();renderStudents();renderDashboard();input.value='';toast('تم تسجيل الدفعة.');printStudentReceipt(payment.id)}catch(e){toast(e.message)}};
$('collectionMonth').innerHTML += monthOptionsHtml();
$('collectionFilters').onsubmit = event => event.preventDefault();
$('collectionSearch').oninput = debounce(renderPaymentHistory);
for (const id of ['collectionStudent','collectionMonth','collectionFrom','collectionTo']) $(id).onchange = renderPaymentHistory;
$('collectionFilters').onreset = () => requestAnimationFrame(renderPaymentHistory);
function renderPaymentHistory() {
  const selected = $('collectionStudent').value;
  const students = new Map(state.data.students.map(student => [String(student.id),student]));
  $('collectionStudent').innerHTML = '<option value="">جميع الطلاب</option>' + state.data.students.map(student => `<option value="${esc(student.id)}">${esc(student.name)} — ${esc(student.schoolNo)}</option>`).join('');
  if (students.has(selected)) $('collectionStudent').value = selected;
  const studentId = $('collectionStudent').value, month = $('collectionMonth').value;
  const query = western($('collectionSearch').value).trim().toLowerCase();
  const from = $('collectionFrom').value, to = $('collectionTo').value;
  const invalidRange = Boolean(from && to && from > to);
  $('collectionFilterError').classList.toggle('hidden',!invalidRange);
  const rows = state.data.studentPayments.filter(payment => {
    const student = students.get(String(payment.studentId));
    const searchText = western([student?.name,student?.schoolNo,invoiceNo(payment)].join(' ')).toLowerCase();
    return !invalidRange && (!studentId || String(payment.studentId) === studentId) && (!month || payment.month === month)
      && (!from || payment.date >= from) && (!to || payment.date <= to) && searchText.includes(query);
  }).sort((a,b)=>b.id-a.id);
  $('collectionTotals').textContent = `عدد الدفعات المعروضة: ${rows.length} — إجمالي التحصيل المعروض: ${money(rows.reduce((total,payment)=>total+Number(payment.amount||0),0))} أوقية`;
  $('studentPaymentHistory').innerHTML = rows.map(p => {
    const student = students.get(String(p.studentId));
    return `<tr><td>${esc(invoiceNo(p))}</td><td>${esc(student?.name||'محذوف')}</td><td>${esc(paymentLabel(p))}</td><td>${money(p.amount)}</td><td>${esc(western(p.date))}</td><td class="actions"><button class="btn-edit" onclick="printStudentReceipt(${p.id})">طباعة</button><button class="btn-edit" onclick="editStudentPayment(${p.id})">تعديل</button><button class="btn-delete" onclick="deleteStudentPayment(${p.id})">حذف</button></td></tr>`;
  }).join('') || `<tr><td colspan="6">${invalidRange?'صحّح الفترة الزمنية لعرض الدفعات.':'لا توجد دفعات مطابقة للتصفية.'}</td></tr>`;
}

function printStudentReceipt(paymentId){const p=state.data.studentPayments.find(x=>Number(x.id)===Number(paymentId));if(!p)return;const s=state.data.students.find(x=>Number(x.id)===Number(p.studentId));if(!s)return;const row=chargeOf(s,p.month),due=row?row.amount:0,remaining=row?row.remaining:0,totalOutstanding=totalOutstandingFor(s),credit=creditFor(s);const school=state.settings?.schoolName||'مدرسة مكارم الأخلاق الحرة';const date=western(p.date||today());const w=window.open('','_blank','width=420,height=700');if(!w){toast('اسمح للنوافذ المنبثقة حتى يتم فتح الفاتورة.');return;}w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(invoiceNo(p))}</title><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;font-family:Arial,Tahoma,sans-serif;color:#111}.receipt{width:72mm;margin:0 auto;padding:4mm 3mm;font-size:12px}.center{text-align:center}.school{font-size:15px;font-weight:900}.title{font-size:14px;font-weight:900;margin:4px 0}.line{border-top:1px dashed #555;margin:5px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:3px 0}.label{font-weight:700}.amount{font-size:14px;font-weight:900}.remaining{font-weight:900}.signature{margin-top:20px;text-align:left}.small{font-size:10px;color:#444}.print{margin-top:10px;width:100%;padding:8px;border:0;background:#111;color:#fff;border-radius:5px;font-weight:700}@media print{.print{display:none}} </style></head><body><div class="receipt">${state.settings.applicationMode==='test'?'<div class="center title">نسخة للتجريب فقط</div>':''}<div class="center school">${esc(school)}</div><div class="center small">السنة الدراسية: ${esc(state.settings?.schoolYear||'')}</div><div class="line"></div><div class="center title">إيصال دفع</div><div class="row"><span class="label">رقم الفاتورة</span><span>${esc(invoiceNo(p))}</span></div><div class="row"><span class="label">التاريخ</span><span>${date}</span></div><div class="line"></div><div class="row"><span class="label">الطالب</span><span>${esc(s.name)}</span></div><div class="row"><span class="label">القسم</span><span>${esc(s.className)}</span></div><div class="row"><span class="label">رقم النداء</span><span>${esc(s.callNo)}</span></div><div class="line"></div><div class="row"><span class="label">نوع الرسوم</span><span>${esc(paymentLabel(p))}</span></div><div class="row"><span class="label">إجمالي الرسوم</span><span>${money(due)} أوقية</span></div><div class="row amount"><span>المدفوع الآن</span><span>${money(p.amount)} أوقية</span></div><div class="row remaining"><span>المتبقي لهذه الرسوم</span><span>${money(remaining)} أوقية</span></div><div class="row remaining"><span>إجمالي المتبقي على الطالب</span><span>${money(totalOutstanding)} أوقية</span></div>${credit>0?`<div class="row remaining"><span>رصيد لصالح الطالب</span><span>${money(credit)} أوقية</span></div>`:''}<div class="line"></div><div class="signature">توقيع المحاسب: __________________</div><div class="center small" style="margin-top:10px">شكراً لكم</div><button class="print" onclick="window.print()">طباعة الفاتورة</button></div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}
window.editStudentPayment=async id=>{if(!(await requirePassword()))return;const p=state.data.studentPayments.find(x=>x.id===id);if(!p)return;const amount=await askInput('المبلغ الجديد',p.amount);if(amount===null)return;const date=await askInput('تاريخ الدفعة بصيغة YYYY-MM-DD',p.date);if(date===null)return;try{await api(`/student-payments/${id}`,{method:'PUT',body:JSON.stringify({month:p.month,amount:western(amount),date})});await load();renderFees();renderPaymentHistory();renderStudents();toast('تم تعديل الدفعة.')}catch(e){toast(e.message)}};
window.deleteStudentPayment=async id=>{await deleteWithPassword(`/student-payments/${id}`,'هل تريد حذف دفعة الطالب؟','تم حذف دفعة الطالب.');};

function roleNeedsFixed(role){return role!=='أستاذ'}
function toggleRoleFields(){const role=$('teacherRole').value,isTeacher=role==='أستاذ';$('stageWrap').classList.toggle('hidden-field',!isTeacher);$('hourlyRateWrap').classList.toggle('hidden-field',!isTeacher);$('fixedSalaryWrap').classList.toggle('hidden-field',isTeacher);if(isTeacher)$('fixedSalary').value='';updateSalaryHoursVisibility()}
$('teacherRole').onchange=toggleRoleFields;
function resetTeacher(){$('teacherForm').reset();$('teacherId').value='';$('teacherRole').value='معلم';$('teacherStart').value=today();toggleRoleFields()}
$('cancelTeacher').onclick=resetTeacher;
$('teacherForm').onsubmit=async e=>{e.preventDefault();const p={name:$('teacherName').value,role:$('teacherRole').value,phone:western($('teacherPhone').value),stage:$('teacherStage').value,subject:$('teacherSubject').value,fixedSalary:western($('fixedSalary').value),hourlyRate:western($('hourlyRate').value),startDate:$('teacherStart').value,notes:$('teacherNotes').value};try{const id=$('teacherId').value;if(id){if(!(await requirePassword()))return;await api(`/teachers/${id}`,{method:'PUT',body:JSON.stringify(p)})}else await api('/teachers',{method:'POST',body:JSON.stringify(p)});await load();resetTeacher();renderTeachers();renderSalary();renderAdvances();toast('تم حفظ الموظف.')}catch(e2){toast(e2.message)}};
function salaryDue(teacher,month,hoursOverride=null,rateOverride=null){if(teacher.role==='أستاذ'){const h=hoursOverride!==null?Number(hoursOverride)||0:latestHours(teacher.id,month);const r=rateOverride!==null?Number(rateOverride)||0:Number(teacher.hourlyRate||0);return h*r}return Number(teacher.fixedSalary||0)}
function latestHours(id,month){const p=state.data.teacherPayments.find(x=>x.teacherId===id&&x.month===month&&Number(x.hours)>=0);return p?Number(p.hours||0):0}
function teacherAdvance(teacherId,month){return state.data.teacherAdvances.filter(x=>Number(x.teacherId)===Number(teacherId)&&x.month===month).reduce((a,x)=>a+Number(x.amount||0),0)}
function teacherPaid(teacherId,month){return state.data.teacherPayments.filter(x=>Number(x.teacherId)===Number(teacherId)&&x.month===month).reduce((a,x)=>a+Number(x.amount||0),0)}
function teacherMonthState(t,m){const due=salaryDue(t,m),adv=teacherAdvance(t.id,m),paid=teacherPaid(t.id,m),rem=Math.max(0,due-adv-paid);return{due,adv,paid,rem}}
function renderTeachers(){$('teachersTable').innerHTML=state.data.teachers.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.role)}</td><td>${esc(t.stage||'—')}</td><td>${esc(t.subject||'—')}</td><td>${t.role==='أستاذ'?'—':money(t.fixedSalary)}</td><td>${t.role==='أستاذ'?money(t.hourlyRate):'—'}</td><td class="actions"><button class="btn-edit" onclick="editTeacher(${t.id})">تعديل</button><button class="btn-delete" onclick="removeTeacher(${t.id})">حذف</button></td></tr>`).join('');populateStaffSelects();updateSalaryHoursVisibility();}
function populateStaffSelects(){const opts=state.data.teachers.map(t=>`<option value="${t.id}">${esc(t.name)} - ${esc(t.role)}</option>`).join('');$('salaryTeacher').innerHTML=opts;$('advanceTeacher').innerHTML=opts;updateSalaryHint();}
window.editTeacher=id=>{const t=state.data.teachers.find(x=>x.id===id);if(!t)return;for(const [k,v] of Object.entries({teacherId:t.id,teacherName:t.name,teacherRole:t.role,teacherPhone:t.phone,teacherStage:t.stage,teacherSubject:t.subject,fixedSalary:t.fixedSalary,hourlyRate:t.hourlyRate,teacherStart:t.startDate,teacherNotes:t.notes}))$(k).value=v??'';toggleRoleFields();showEditForm('staff','teacherForm','teacherName')}
window.removeTeacher=async id=>{await deleteWithPassword(`/teachers/${id}`,'هل تريد حذف الموظف وجميع رواتبه وسلفه؟','تم حذف الموظف ورواتبه وسلفه المرتبطة به.');};
$('salaryTeacher').onchange=()=>{updateSalaryHoursVisibility();updateSalaryHint()};$('salaryMonth').onchange=updateSalaryHint;$('salaryHours').oninput=updateSalaryHint;
function updateSalaryHoursVisibility(){const t=state.data?.teachers.find(x=>Number(x.id)===Number($('salaryTeacher').value));$('salaryHoursWrap').classList.toggle('hidden-field',!t||t.role!=='أستاذ');if(!t||t.role!=='أستاذ')$('salaryHours').value=''}
function updateSalaryHint(){const t=state.data?.teachers.find(x=>Number(x.id)===Number($('salaryTeacher').value));if(!t)return;const due=salaryDue(t,$('salaryMonth').value,$('salaryHours').value||null);const st=teacherMonthState(t,$('salaryMonth').value);$('salaryDueInfo').textContent=t.role==='أستاذ'?`الاستحقاق = الساعات × سعر الساعة = ${money(Number($('salaryHours').value||0))} × ${money(t.hourlyRate)} = ${money(due)}. السلف: ${money(st.adv)}. المتبقي قبل الدفعة: ${money(Math.max(0,due-st.adv-st.paid))}.`:`الراتب الثابت للشهر: ${money(due)}. السلف: ${money(st.adv)}. المتبقي قبل الدفعة: ${money(Math.max(0,due-st.adv-st.paid))}.`}
$('salaryForm').onsubmit=async e=>{e.preventDefault();const t=state.data.teachers.find(x=>x.id===Number($('salaryTeacher').value));if(!t)return;const m=$('salaryMonth').value,h=t.role==='أستاذ'?Number($('salaryHours').value)||0:0,r=t.role==='أستاذ'?Number(t.hourlyRate||0):0,due=salaryDue(t,m,h,r),st=teacherMonthState(t,m),available=Math.max(0,due-st.adv-st.paid),amount=Number($('salaryAmount').value)||0;if(amount<=0)return toast('أدخل المبلغ المدفوع.');if(due>0&&amount>available)return toast(`المتبقي المتاح هو ${money(available)}.`);try{await api('/teacher-payments',{method:'POST',body:JSON.stringify({teacherId:t.id,month:m,amount,date:$('salaryDate').value||today(),hours:h,hourlyRate:r,salaryDue:due})});await load();resetSalaryDates();renderTeachers();renderSalary();renderAdvances();renderDashboard();toast('تم تسجيل دفعة الراتب.')}catch(e2){toast(e2.message)}};
function renderSalary(){
  const rows=state.data.teacherPayments.map(p=>{
    const t=state.data.teachers.find(q=>q.id===p.teacherId);
    const due=Number(p.salaryDue||salaryDue(t,p.month,p.hours,p.hourlyRate));
    const adv=teacherAdvance(p.teacherId,p.month);
    return {p,t,due,adv};
  }).sort((a,b)=>b.p.id-a.p.id);
  $('salaryTable').innerHTML=rows.map(x=>{
    const allPaid=teacherPaid(x.p.teacherId,x.p.month);
    const paidRows=state.data.teacherPayments.filter(p=>p.teacherId===x.p.teacherId&&p.month===x.p.month);
    const rem=Math.max(0,x.due-x.adv-allPaid);
    return `<tr><td>${esc(x.t?.name||'محذوف')}</td><td>${esc(x.p.month)}</td><td>${money(x.due)}</td><td>${money(x.adv)}</td><td>${money(allPaid)}</td><td class="${rem>0?'overdue-soft':'status-paid'}">${money(rem)}</td><td>${western(x.p.date)}</td><td class="actions"><button class="btn-edit" onclick="editSalaryPayment(${x.p.id})">تعديل</button><button class="btn-delete" onclick="deleteSalaryPayment(${x.p.id})">حذف</button></td></tr>`;
  }).join('')||'<tr><td colspan="8">لا توجد دفعات رواتب.</td></tr>';
}
window.editSalaryPayment=async id=>{
  if(!(await requirePassword()))return;
  const p=state.data.teacherPayments.find(x=>x.id===id);if(!p)return;
  const t=state.data.teachers.find(x=>x.id===p.teacherId);if(!t)return;
  const amount=await askInput('المبلغ المدفوع الجديد',p.amount);if(amount===null)return;
  const date=await askInput('تاريخ الدفعة بصيغة YYYY-MM-DD',p.date);if(date===null)return;
  let hours=Number(p.hours||0),hourlyRate=Number(p.hourlyRate||t.hourlyRate||0),salaryDue=Number(p.salaryDue||0);
  if(t.role==='أستاذ'){const h=await askInput('عدد ساعات الشهر',hours);if(h===null)return;hours=Number(h)||0;salaryDue=hours*hourlyRate}else{salaryDue=t.fixedSalary||salaryDue;hours=0;hourlyRate=0}
  try{await api(`/teacher-payments/${id}`,{method:'PUT',body:JSON.stringify({month:p.month,amount:western(amount),date,hours,hourlyRate,salaryDue})});await refreshAll();toast('تم تعديل دفعة الراتب.')}catch(e){toast(e.message)}
};
window.deleteSalaryPayment=async id=>{await deleteWithPassword(`/teacher-payments/${id}`,'هل تريد حذف دفعة الراتب؟','تم حذف دفعة الراتب.');};
function resetSalaryDates(){$('salaryForm').reset();$('salaryMonth').value=currentMonth();$('salaryDate').value=today();if(state.data)populateStaffSelects()}

$('advanceTeacher').onchange=()=>{};
$('advanceForm').onsubmit=async e=>{e.preventDefault();const t=state.data.teachers.find(x=>x.id===Number($('advanceTeacher').value));if(!t)return;const m=$('advanceMonth').value;let h=0;if(t.role==='أستاذ'){const enteredHours=await askInput('عدد ساعات الشهر لحساب استحقاق الأستاذ (اختياري):',latestHours(t.id,m)||0);if(enteredHours===null)return;h=Number(enteredHours)||0;}const due=salaryDue(t,m,h),amount=Number($('advanceAmount').value)||0;const adv=teacherAdvance(t.id,m),paid=teacherPaid(t.id,m);if(amount<=0)return toast('أدخل مبلغ السلفة.');if(due>0&&amount>Math.max(0,due-adv-paid))return toast(`السلفة المتاحة لهذا الشهر ${money(Math.max(0,due-adv-paid))}.`);try{await api('/teacher-advances',{method:'POST',body:JSON.stringify({teacherId:t.id,month:m,amount,date:$('advanceDate').value||today(),notes:$('advanceNotes').value,salaryDue:due})});await load();resetAdvance();renderAdvances();renderSalary();renderDashboard();toast('تم تسجيل السلفة.')}catch(e2){toast(e2.message)}};
function renderAdvances(){
  $('advanceTable').innerHTML=state.data.teacherAdvances.map(a=>{
    const t=state.data.teachers.find(x=>x.id===a.teacherId);
    return `<tr><td>${esc(t?.name||'محذوف')}</td><td>${esc(a.month)}</td><td>${money(a.amount)}</td><td>${western(a.date)}</td><td>${esc(a.notes)}</td><td class="actions"><button class="btn-edit" onclick="editAdvance(${a.id})">تعديل</button><button class="btn-delete" onclick="deleteAdvance(${a.id})">حذف</button></td></tr>`;
  }).join('')||'<tr><td colspan="6">لا توجد سلف.</td></tr>';
}
window.editAdvance=async id=>{
  if(!(await requirePassword()))return;
  const a=state.data.teacherAdvances.find(x=>x.id===id);if(!a)return;
  const amount=await askInput('مبلغ السلفة الجديد',a.amount);if(amount===null)return;
  const date=await askInput('تاريخ السلفة بصيغة YYYY-MM-DD',a.date);if(date===null)return;
  const notes=await askInput('ملاحظات',a.notes||'');if(notes===null)return;
  try{await api(`/teacher-advances/${id}`,{method:'PUT',body:JSON.stringify({month:a.month,amount:western(amount),date,notes,salaryDue:a.salaryDue})});await refreshAll();toast('تم تعديل السلفة.')}catch(e){toast(e.message)}
};
window.deleteAdvance=async id=>{await deleteWithPassword(`/teacher-advances/${id}`,'هل تريد حذف السلفة؟','تم حذف السلفة.');};
function resetAdvance(){$('advanceForm').reset();$('advanceMonth').value=currentMonth();$('advanceDate').value=today();if(state.data)populateStaffSelects()}

$('expenseForm').onsubmit=async e=>{e.preventDefault();const id=$('expenseId').value,p={category:$('expenseCategory').value,description:$('expenseDescription').value,amount:western($('expenseAmount').value),date:$('expenseDate').value||today(),beneficiary:$('expenseBeneficiary').value,notes:$('expenseNotes').value};try{if(id){if(!(await requirePassword()))return;await api(`/expenses/${id}`,{method:'PUT',body:JSON.stringify(p)})}else await api('/expenses',{method:'POST',body:JSON.stringify(p)});await load();resetExpense();renderExpenses();renderDashboard();toast('تم حفظ المصروف.')}catch(e2){toast(e2.message)}};
$('cancelExpense').onclick=resetExpense;
function resetExpense(){$('expenseForm').reset();$('expenseId').value='';$('expenseDate').value=today()}
function renderExpenses(){$('expensesTable').innerHTML=state.data.expenses.map(e=>`<tr><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td>${money(e.amount)}</td><td>${western(e.date)}</td><td>${esc(e.beneficiary)}</td><td class="actions"><button class="btn-edit" onclick="editExpense(${e.id})">تعديل</button><button class="btn-delete" onclick="removeExpense(${e.id})">حذف</button></td></tr>`).join('')}
window.editExpense=id=>{const e=state.data.expenses.find(x=>x.id===id);if(!e)return;for(const [k,v] of Object.entries({expenseId:e.id,expenseCategory:e.category,expenseDescription:e.description,expenseAmount:e.amount,expenseDate:e.date,expenseBeneficiary:e.beneficiary,expenseNotes:e.notes}))$(k).value=v??'';showEditForm('expenses','expenseForm','expenseCategory')}
window.removeExpense=async id=>{await deleteWithPassword(`/expenses/${id}`,'هل تريد حذف هذا المصروف؟','تم حذف المصروف.');};

$('settingsForm').onsubmit=async e=>{e.preventDefault();if($('newPassword').value!==$('confirmPassword').value)return toast('تأكيد كلمة المرور غير مطابق.');try{const x=await api('/settings',{method:'PUT',body:JSON.stringify({schoolName:$('setSchoolName').value,schoolYear:$('setSchoolYear').value,username:$('setUsername').value,defaultMonthlyFee:western($('setDefaultMonthlyFee').value),managerName:$('setManagerName').value,managerPhone:western($('setManagerPhone').value),schoolPhone:western($('setSchoolPhone').value),republic:$('setRepublic').value,ministry:$('setMinistry').value,regional:$('setRegional').value,currentPassword:$('currentPassword').value,newPassword:western($('newPassword').value)})});state.settings=x.settings;applySettings();$('currentPassword').value='';$('newPassword').value='';$('confirmPassword').value='';renderSettings();toast('تم حفظ الإعدادات.')}catch(e2){toast(e2.message)}};
function renderSettings(){$('applicationMode').value=state.settings.applicationMode||'production';$('setSchoolName').value=state.settings.schoolName;$('setSchoolYear').value=state.settings.schoolYear;$('setManagerName').value=state.settings.managerName||'';$('setManagerPhone').value=western(state.settings.managerPhone||'');$('setSchoolPhone').value=western(state.settings.schoolPhone||'');$('setRepublic').value=state.settings.republic||'الجمهورية الإسلامية الموريتانية';$('setMinistry').value=state.settings.ministry||'وزارة التعليم';$('setRegional').value=state.settings.regional||'الإدارة الجهوية للتعليم';$('setUsername').value=state.settings.username;$('setDefaultMonthlyFee').value=state.settings.defaultMonthlyFee}
$('clearDataBtn').onclick=async()=>{
  const first=await askConfirm('تحذير: سيتم حذف الطلاب والرسوم والمدفوعات والموظفين والرواتب والسلف والمصروفات. ستبقى الإعدادات والأقسام فقط. هل تريد المتابعة؟');
  if(!first)return;
  const second=await askInput('أدخل كلمة المرور لتأكيد تفريغ البيانات:');
  if(second===null)return;
  try{const resetResult=await api('/reset-data',{method:'POST',body:JSON.stringify({password:western(second)})});await load();resetStudent();resetTeacher();resetExpense();resetSalaryDates();resetAdvance();renderDashboard();renderStudents();renderFees();renderPaymentHistory();renderTeachers();renderSalary();renderAdvances();renderExpenses();renderExamSection();toast(resetResult?.backup?'تم التفريغ بنجاح، وتم إنشاء نسخة احتياطية للبيانات القديمة.':'تم تفريغ بيانات السنة الدراسية بنجاح.')}catch(e){toast(e.message)}};
$('departmentForm').onsubmit=async e=>{e.preventDefault();try{await api('/departments',{method:'POST',body:JSON.stringify({name:$('departmentName').value,monthlyFee:western($('departmentFee').value)})});await load();$('departmentName').value='';$('departmentFee').value='';renderDepartments();toast('تمت إضافة القسم.')}catch(e2){toast(e2.message)}};
function renderDepartments(){$('departmentsTable').innerHTML=state.departments.map(d=>{const count=state.data.students.filter(s=>s.className===d.name).length;return `<tr><td>${esc(d.name)}</td><td>${money(d.monthlyFee)}</td><td>${money(count)}</td><td class="actions"><button class="btn-edit" onclick="editDepartment(${d.id})">تعديل</button><button class="btn-delete" onclick="deleteDepartment(${d.id})">حذف</button></td></tr>`}).join('')}
window.editDepartment=async id=>{if(!(await requirePassword()))return;const d=state.departments.find(x=>x.id===id);if(!d)return;const name=await askInput('اسم القسم الجديد',d.name);if(name===null)return;const fee=await askInput('الرسوم الشهرية للقسم',d.monthlyFee);if(fee===null)return;try{await api(`/departments/${id}`,{method:'PUT',body:JSON.stringify({name,monthlyFee:western(fee)})});await load();renderDepartments();renderStudents();renderFees();toast('تم تعديل القسم ورسومه.')}catch(e){toast(e.message)}};
window.deleteDepartment=async id=>{await deleteWithPassword(`/departments/${id}`,'هل تريد حذف هذا القسم؟','تم حذف القسم.');};


async function refreshAll(){
  await load();
  renderDashboard();
  renderStudents();
  renderFees();
  renderPaymentHistory();
  renderTeachers();
  renderSalary();
  renderAdvances();
  renderExpenses();
  if($('exams')?.classList.contains('active-section')) renderExamSection();
  if($('settings')?.classList.contains('active-section')) {
    renderSettings();
    renderDepartments();
  }
}
async function deleteWithPassword(path, confirmMessage, successMessage){
  if(!(await askConfirm(confirmMessage))) return false;
  if(!(await requirePassword())) return false;
  try{
    await api(path,{method:'DELETE'});
    await refreshAll();
    toast(successMessage);
    return true;
  }catch(error){
    toast(error.message || 'تعذر حذف السجل.');
    return false;
  }
}

// One round trip, and no session created: /login used to leave an unused token
// on the server for every confirmation.
async function requirePassword(){const p=await askInput('أدخل كلمة المرور لإتمام هذه العملية:');if(p===null)return false;try{const x=await api('/verify-password',{method:'POST',body:JSON.stringify({password:western(p)})});return Boolean(x.ok)}catch(error){toast(error.message||'كلمة المرور غير صحيحة.');return false}}
function renderDashboard(){const d=state.data,male=d.students.filter(s=>s.gender==='ذكر').length,female=d.students.filter(s=>s.gender==='أنثى').length,fees=d.studentPayments.reduce((a,x)=>a+Number(x.amount||0),0),sal=d.teacherPayments.reduce((a,x)=>a+Number(x.amount||0),0),adv=d.teacherAdvances.reduce((a,x)=>a+Number(x.amount||0),0),exp=d.expenses.reduce((a,x)=>a+Number(x.amount||0),0);$('sStudents').textContent=money(d.students.length);$('studentGenderSummary').textContent=`ذكور: ${money(male)} | إناث: ${money(female)}`;$('sTeachers').textContent=money(d.teachers.length);$('sFees').textContent=money(fees);$('sSalaries').textContent=money(sal+adv);$('sExpenses').textContent=money(exp);$('sNet').textContent=money(fees-sal-adv-exp);
const m=currentMonth();$('dMonth').textContent=m;$('dFees').textContent=money(d.studentPayments.filter(x=>x.month===m).reduce((a,x)=>a+Number(x.amount||0),0));$('dSalary').textContent=money(d.teacherPayments.filter(x=>x.month===m).reduce((a,x)=>a+Number(x.amount||0),0));$('dExpenses').textContent=money(d.expenses.filter(x=>x.date.slice(0,7)===today().slice(0,7)).reduce((a,x)=>a+Number(x.amount||0),0))}
function renderDuesReports(){
  const accounts=state.data.students.map(student=>({student,ledger:ledgerOf(student)}));
  const byDepartment=new Map();
  for(const account of accounts){
    const key=account.student.className||'—';
    const totals=byDepartment.get(key)||{count:0,due:0,paid:0,remaining:0,late:0};
    totals.count++;totals.due+=account.ledger.totalDue;totals.paid+=account.ledger.allocated;totals.remaining+=account.ledger.outstanding;
    if(account.ledger.oldestUnpaid&&account.ledger.oldestUnpaid.dueDate<today())totals.late++;
    byDepartment.set(key,totals);
  }
  const departments=[...byDepartment.entries()].sort((a,b)=>b[1].remaining-a[1].remaining);
  const grand=departments.reduce((a,[,t])=>({count:a.count+t.count,due:a.due+t.due,paid:a.paid+t.paid,remaining:a.remaining+t.remaining,late:a.late+t.late}),{count:0,due:0,paid:0,remaining:0,late:0});
  $('departmentDuesTable').innerHTML=departments.map(([name,t])=>`<tr><td>${esc(name)}</td><td>${money(t.count)}</td><td>${money(t.due)}</td><td class="status-paid">${money(t.paid)}</td><td class="${t.remaining>0?'overdue-soft':'status-paid'}">${money(t.remaining)}</td><td class="${t.late>0?'overdue-strong':''}">${money(t.late)}</td></tr>`).join('')
    +(departments.length?`<tr class="totals-row"><td>الإجمالي</td><td>${money(grand.count)}</td><td>${money(grand.due)}</td><td class="status-paid">${money(grand.paid)}</td><td class="overdue-soft">${money(grand.remaining)}</td><td>${money(grand.late)}</td></tr>`:'<tr><td colspan="6">لا يوجد طلاب.</td></tr>');
  const debtors=accounts.filter(a=>a.ledger.outstanding>0).sort((a,b)=>b.ledger.outstanding-a.ledger.outstanding).slice(0,20);
  $('topDebtorsTable').innerHTML=debtors.map(({student,ledger})=>`<tr><td>${esc(student.name)}</td><td>${esc(student.className)}</td><td>${esc(student.guardianName||'—')}</td><td>${esc(student.guardianPhone||'—')}</td><td>${money(ledger.unpaidCount)}</td><td>${ledger.oldestUnpaid?esc(ledger.oldestUnpaid.month)+' — '+western(ledger.oldestUnpaid.dueDate):'—'}</td><td class="overdue-strong">${money(ledger.outstanding)}</td></tr>`).join('')||'<tr><td colspan="7">لا توجد مستحقات غير مسددة.</td></tr>';
}
function renderReports(){const d=state.data,income=d.studentPayments.reduce((a,x)=>a+Number(x.amount||0),0),out=d.teacherPayments.reduce((a,x)=>a+Number(x.amount||0),0)+d.teacherAdvances.reduce((a,x)=>a+Number(x.amount||0),0)+d.expenses.reduce((a,x)=>a+Number(x.amount||0),0);$('rIncome').textContent=money(income);$('rOut').textContent=money(out);$('rNet').textContent=money(income-out);renderDuesReports()}
setDate('registrationDate');setDate('teacherStart');setDate('salaryDate');setDate('advanceDate');setDate('expenseDate');toggleRoleFields();


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
  $('remarksRulesTable').innerHTML=sortedRules(rr).map((r,i)=>`<tr><td>${money(r.min)}</td><td>${esc(r.remark)}</td><td><button class="btn-delete" onclick="deleteRemarkRule(${i})">حذف</button></td></tr>`).join('');
  $('decisionRulesTable').innerHTML=sortedRules(dr).map((r,i)=>`<tr><td>${money(r.min)}</td><td>${esc(r.decision)}</td><td><button class="btn-delete" onclick="deleteDecisionRule(${i})">حذف</button></td></tr>`).join('');
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

function applyApplicationMode(mode) {
  if (!['test','production'].includes(mode)) return;
  for (const id of ['loginModeBadge','appModeBadge']) {
    $(id).textContent = mode === 'test' ? 'نسخة للتجريب فقط' : 'وضع الإنتاج';
    $(id).classList.toggle('test-mode',mode === 'test');
  }
  document.title = `${mode === 'test' ? 'نسخة للتجريب فقط' : 'وضع الإنتاج'} — حسابات المدرسة`;
}
async function checkApplicationMode() {
  try {
    const info = await api('/mode');
    if (state.token && state.settings?.applicationMode && state.settings.applicationMode !== info.mode) return location.reload();
    applyApplicationMode(info.mode);
  } catch { /* Keep the last confirmed label while disconnected. */ }
}
$('applicationModeForm').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  if ($('applicationMode').value === state.settings.applicationMode) return toast('هذا هو الوضع الحالي بالفعل.');
  button.disabled = true;
  try {
    const result = await api('/mode',{method:'PUT',body:JSON.stringify({mode:$('applicationMode').value})});
    sessionStorage.setItem('modeSwitchToken',result.token);
    location.reload();
  } catch(error) { toast(error.message); } finally { button.disabled = false; }
};
checkApplicationMode();
setInterval(checkApplicationMode,15000);

// Consume the replacement session once; reload clears every old-mode form and record ID.
(async () => {
  const token = sessionStorage.getItem('modeSwitchToken');
  sessionStorage.removeItem('modeSwitchToken');
  if (!token) return;
  try { await enterApplication({token,settings:await api('/settings')}); }
  catch(error) { state.token = ''; toast(error.message); }
})();
