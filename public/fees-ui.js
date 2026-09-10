const TOTAL_MODE='__total__';
const FEE_ROW_LIMIT=300;
let feeSort={key:'name',dir:1},feeShowAll=false,feeView={month:'',rows:[]};
let feeHiddenColumns=new Set();
try{feeHiddenColumns=new Set(JSON.parse(localStorage.getItem('feeHiddenColumns')||'[]'))}catch{}
const daysBetween=(from,to)=>Math.round((new Date(to+'T00:00:00')-new Date(from+'T00:00:00'))/86400000);

$('feeStatus').innerHTML=FEE_FILTERS.map(filter=>`<option value="${esc(filter.value)}">${esc(filter.label)}</option>`).join('');
$('feeMonth').insertAdjacentHTML('afterbegin',`<option value="${TOTAL_MODE}">إجمالي المستحقات (كل الأشهر)</option>`);
$('feeMonth').onchange=()=>{feeShowAll=false;renderFees();renderPaymentHistory()};
$('feeDepartment').onchange=renderFees;
$('feeStatus').onchange=renderFees;
$('feeMinRemaining').oninput=debounce(renderFees);
$('feeSearch').oninput=debounce(renderFees);
$('resetFeeFilters').onclick=()=>{
  $('feeDepartment').value='';
  $('feeStatus').value='';
  $('feeMinRemaining').value='';
  $('feeSearch').value='';
  feeShowAll=false;
  renderFees();
};
$('feeQuickFilters').onclick=event=>{
  const button=event.target.closest('[data-fee-status]');
  if(!button)return;
  $('feeStatus').value=button.dataset.feeStatus;
  feeShowAll=false;
  renderFees();
};
// One table row per student: a single month, or the whole year in the total view.
function feeRowFor(student,month){
  const ledger=ledgerOf(student);
  if(month===TOTAL_MODE){
    const oldest=ledger.oldestUnpaid;
    return {student,ledger,gross:round2(ledger.accruedRows.reduce((sum,row)=>sum+row.gross,0)),discount:ledger.totalDiscount,
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
  const charge=row.charged?{amount:row.due,paid:row.paid,remaining:row.remaining,dueDate:row.dueDate}:null;
  const[label,cls,key]=feeStatusOf(charge,today());
  // Across the whole year the count of open dues is what the reader needs.
  return[key==='late'||key==='partial'||key==='unpaid'?`${label}: ${money(row.unpaidCount)}`:label,cls];
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
const FEE_OPTIONAL_COLUMNS=[...FEE_COLUMNS.filter(column=>column.key!=='name'),
  {key:'status',label:'الحالة'}];
feeHiddenColumns=new Set([...feeHiddenColumns].filter(key=>FEE_OPTIONAL_COLUMNS.some(column=>column.key===key)));
function renderFeeColumnOptions(){
  const toggle=column=>`<label><input type="checkbox" data-fee-column-toggle="${column.key}" ${feeHiddenColumns.has(column.key)?'':'checked'}> ${esc(column.label)}</label>`;
  $('feeColumnOptions').innerHTML=FEE_OPTIONAL_COLUMNS.map(toggle).join('')
    +'<button type="button" class="secondary" id="showAllFeeColumns">إظهار الكل</button>';
}
function applyFeeColumnVisibility(){
  document.querySelectorAll('#fees [data-fee-column]').forEach(cell=>cell.classList.toggle('fee-column-hidden',feeHiddenColumns.has(cell.dataset.feeColumn)));
}
$('feeColumnOptions').onchange=event=>{
  const key=event.target.dataset.feeColumnToggle;
  if(!key)return;
  event.target.checked?feeHiddenColumns.delete(key):feeHiddenColumns.add(key);
  localStorage.setItem('feeHiddenColumns',JSON.stringify([...feeHiddenColumns]));
  applyFeeColumnVisibility();
};
$('feeColumnOptions').onclick=event=>{
  if(event.target.id!=='showAllFeeColumns')return;
  feeHiddenColumns.clear();
  localStorage.removeItem('feeHiddenColumns');
  renderFeeColumnOptions();
  applyFeeColumnVisibility();
};
renderFeeColumnOptions();
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
  if(!days)return '<td data-fee-column="age">—</td>';
  return `<td data-fee-column="age" class="${days>60?'overdue-strong':days>30?'status-partial':'overdue-soft'}">${money(days)} يومًا</td>`;
}
function feeRowHtml(row,month){
  const s=row.student;
  const days=overdueDays(row);
  const [label,cls]=rowStatus(row,month);
  const remainingClass=row.remaining>0?(days>0?'overdue-strong':'overdue-soft'):'status-paid';
  return `<tr class="${days>0?'overdue-row':''}">
    <td data-fee-column="className">${esc(s.className)}</td>
    <td data-fee-column="schoolNo">${esc(s.schoolNo)}</td>
    <td data-fee-column="callNo">${esc(s.callNo)}</td>
    <td data-fee-column="name" class="fee-student-cell"><strong>${esc(s.name)}</strong><small>${esc(s.className)} · ${esc(s.schoolNo)}</small></td>
    <td data-fee-column="gross">${money(row.gross)}</td>
    <td data-fee-column="discount" class="${row.discount>0?'status-exempt':''}">${row.discount>0?money(row.discount):'—'}</td>
    <td data-fee-column="due">${money(row.due)}</td>
    <td data-fee-column="paid">${money(row.paid)}</td>
    <td data-fee-column="remaining" class="${remainingClass}">${money(row.remaining)}</td>
    <td data-fee-column="dueDate">${row.charged&&row.dueDate?western(row.dueDate):'—'}</td>
    ${ageCell(days)}
    <td data-fee-column="status" class="${cls}">${esc(label)}</td>
    <td data-fee-column="actions" class="fee-row-actions"><button class="fee-form-trigger" onclick="openStudentFees(${s.id})" title="فتح استمارة الرسوم" aria-label="فتح استمارة الرسوم للطالب ${esc(s.name)}">+</button><button class="btn-edit" onclick="openStudentFees(${s.id},true)">كشف الحساب</button></td>
  </tr>`;
}
function renderFees(){
  const month=$('feeMonth').value;
  const dep=$('feeDepartment').value;
  const query=$('feeSearch').value.toLowerCase().trim();
  const status=$('feeStatus').value;
  const minRemaining=Number($('feeMinRemaining').value)||0;

  // `candidates` : tout ce que le département et la recherche laissent passer.
  // Les puces de filtrage rapide comptent sur cet ensemble, le tableau sur le
  // sous-ensemble que le filtre d'état retient.
  const candidates=state.data.students
    .filter(s=>(!dep||s.className===dep)&&[s.name,s.schoolNo,s.callNo].join(' ').toLowerCase().includes(query))
    .map(s=>feeRowFor(s,month));
  const rows=sortFeeRows(candidates.filter(row=>passesFeeFilter(row,status,minRemaining)));
  feeView={month,rows};

  const statusCounts={due:0,late:0,paid:0};
  for(const row of candidates){
    if(row.remaining>0)statusCounts.due++;
    if(overdueDays(row)>0)statusCounts.late++;
    if(row.due>0&&row.remaining<=0)statusCounts.paid++;
  }

  const sortMark=column=>feeSort.key===column.key?(feeSort.dir>0?' ▲':' ▼'):'';
  $('feesHead').innerHTML=FEE_COLUMNS.map(column=>
      `<th class="sortable" data-fee-column="${column.key}" data-sort="${column.key}" title="اضغط للفرز">${esc(feeColumnLabel(column,month))}${sortMark(column)}</th>`
    ).join('')
    +'<th data-fee-column="status">الحالة</th><th data-fee-column="actions">إجراءات</th>';

  // Au-delà de FEE_ROW_LIMIT lignes, le tableau est tronqué : le rendu d'un
  // millier de lignes fige la fenêtre, et un lecteur ne les parcourt pas.
  const shown=feeShowAll?rows:rows.slice(0,FEE_ROW_LIMIT);
  $('feesTable').innerHTML=shown.map(row=>feeRowHtml(row,month)).join('')
    ||`<tr><td colspan="13">لا توجد نتائج مطابقة للتصفية.</td></tr>`;
  applyFeeColumnVisibility();

  const capped=rows.length>FEE_ROW_LIMIT;
  $('feesRowNotice').classList.toggle('hidden',!capped);
  $('feesRowNotice').innerHTML=capped
    ? `يُعرض ${money(shown.length)} من ${money(rows.length)} صفًّا. <button type="button" class="secondary" id="showAllFees">${feeShowAll?'الاكتفاء بأول '+FEE_ROW_LIMIT:'عرض كل الصفوف'}</button>`
    : '';
  if($('showAllFees'))$('showAllFees').onclick=()=>{feeShowAll=!feeShowAll;renderFees()};

  const quickCounts={'':candidates.length,due:statusCounts.due,late:statusCounts.late,paid:statusCounts.paid};
  $('feeQuickFilters').innerHTML=FEE_FILTERS.filter(filter=>filter.value!=='none').map(filter=>
    `<button type="button" data-fee-status="${filter.value}" class="fee-filter-chip ${status===filter.value?'active':''}" aria-pressed="${status===filter.value}">${filter.label}<b>${money(quickCounts[filter.value])}</b></button>`
  ).join('');

  const activeFilters=[
    dep&&`القسم: ${dep}`,
    status&&`الحالة: ${$('feeStatus').selectedOptions[0].textContent}`,
    minRemaining>0&&`المتبقي من ${money(minRemaining)}`,
    query&&`البحث: ${$('feeSearch').value.trim()}`
  ].filter(Boolean);
  $('feesFilterSummary').innerHTML=`عرض <strong>${money(rows.length)}</strong> طالب`
    +(activeFilters.length?` · ${activeFilters.map(esc).join(' · ')}`:' · دون تصفية إضافية');

  const totals=rows.reduce((a,r)=>({
    gross:a.gross+r.gross,discount:a.discount+r.discount,due:a.due+r.due,
    paid:a.paid+r.paid,remaining:a.remaining+r.remaining,credit:a.credit+r.ledger.credit
  }),{gross:0,discount:0,due:0,paid:0,remaining:0,credit:0});
  const totalCell=(cls,label,value)=>`<span${cls?` class="${cls}"`:''}><small>${label}</small><b>${money(value)}</b></span>`;
  $('feeTotals').innerHTML=totalCell('','الطلاب',rows.length)
    +totalCell('','إجمالي المستحق',totals.due)
    +totalCell('status-paid','المدفوع',totals.paid)
    +totalCell('overdue-soft','المتبقي',totals.remaining)
    +totalCell('status-exempt','الخصم',totals.discount)
    +totalCell('status-overpaid','رصيد دائن',totals.credit);
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
// `openPrintWindow` et les feuilles de style d'impression vivent dans print.js.
$('exportFees').onclick=()=>{
  if(!feeView.rows.length)return toast('لا توجد صفوف للتصدير.');
  downloadXlsx(`${feeSheetTitle()} — ${today()}.xlsx`,'مستحقات الطلاب',feeSheetRows());
  toast('تم تصدير الملف إلى Excel.');
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
  const debtors=feeView.rows.filter(row=>row.ledger.outstanding>0);
  if(!debtors.length)return toast('لا يوجد طلاب عليهم متبقٍّ ضمن التصفية الحالية.');
  const notices=debtors.map(row=>{
    const unpaid=row.ledger.accruedRows.filter(charge=>charge.remaining>0);
    const lines=unpaid.map(charge=>`<tr><td>${esc(charge.month)}</td><td>${esc(charge.dueDate)}</td><td>${money(charge.remaining)}</td></tr>`).join('');
    return `<div class="notice">
      <h3>${esc(row.student.name)} — ${esc(row.student.className)} — رقم النداء ${esc(row.student.callNo)}</h3>
      <div>ولي الأمر: ${esc(row.student.guardianName||'—')} — الهاتف: ${esc(row.student.guardianPhone||'—')}</div>
      <table>
        <thead><tr><th>الاستحقاق</th><th>تاريخ الاستحقاق</th><th>المتبقي</th></tr></thead>
        <tbody>${lines}</tbody>
        <tfoot><tr class="total"><td colspan="2">إجمالي المتبقي</td><td>${money(row.ledger.outstanding)} أوقية</td></tr></tfoot>
      </table>
      <div>نرجو تسديد المبلغ لدى إدارة المدرسة. توقيع الإدارة: ____________</div>
    </div>`;
  }).join('');
  openPrintWindow(`إشعارات أولياء الأمور (${money(debtors.length)})`,notices);
};

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
    return `<tr>
      <td>${esc(invoiceNo(p))}</td>
      <td>${esc(student?.name||'محذوف')}</td>
      <td>${esc(paymentLabel(p))}</td>
      <td>${money(p.amount)}</td>
      <td>${esc(western(p.date))}</td>
      <td class="actions"><button class="btn-edit" onclick="printStudentReceipt(${p.id})">طباعة</button><button class="btn-edit" onclick="editStudentPayment(${p.id})">تعديل</button><button class="btn-delete" onclick="deleteStudentPayment(${p.id})">حذف</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6">${invalidRange?'صحّح الفترة الزمنية لعرض الدفعات.':'لا توجد دفعات مطابقة للتصفية.'}</td></tr>`;
}

// Reçu d'un versement, imprimé sur un rouleau de 80 mm. Il rappelle le reste dû sur
// ce mois-ci et sur l'ensemble du compte : c'est ce que le parent emporte.
function printStudentReceipt(paymentId){
  const payment=state.data.studentPayments.find(x=>Number(x.id)===Number(paymentId));
  if(!payment)return;
  const student=state.data.students.find(x=>Number(x.id)===Number(payment.studentId));
  if(!student)return;
  const charge=chargeOf(student,payment.month);
  const due=charge?charge.amount:0;
  const remaining=charge?charge.remaining:0;
  const credit=creditFor(student);
  const school=state.settings?.schoolName||'مدرسة مكارم الأخلاق الحرة';

  const line=(label,value)=>`<div class="row"><span class="label">${label}</span><span>${value}</span></div>`;
  const amountLine=(cls,label,value)=>`<div class="row ${cls}"><span>${label}</span><span>${value} أوقية</span></div>`;
  const body=`<div class="receipt">`
    +(isTestMode()?`<div class="center title">${TEST_MODE_LABEL}</div>`:'')
    +`<div class="center school">${esc(school)}</div>`
    +`<div class="center small">السنة الدراسية: ${esc(state.settings?.schoolYear||'')}</div>`
    +`<div class="line"></div>`
    +`<div class="center title">إيصال دفع</div>`
    +line('رقم الفاتورة',esc(invoiceNo(payment)))
    +line('التاريخ',western(payment.date||today()))
    +`<div class="line"></div>`
    +line('الطالب',esc(student.name))
    +line('القسم',esc(student.className))
    +line('رقم النداء',esc(student.callNo))
    +`<div class="line"></div>`
    +line('نوع الرسوم',esc(paymentLabel(payment)))
    +line('إجمالي الرسوم',`${money(due)} أوقية`)
    +amountLine('amount','المدفوع الآن',money(payment.amount))
    +amountLine('remaining','المتبقي لهذه الرسوم',money(remaining))
    +amountLine('remaining','إجمالي المتبقي على الطالب',money(totalOutstandingFor(student)))
    +(credit>0?amountLine('remaining','رصيد لصالح الطالب',money(credit)):'')
    +`<div class="line"></div>`
    +`<div class="signature">توقيع المحاسب: __________________</div>`
    +`<div class="center small" style="margin-top:10px">شكراً لكم</div>`
    +`<button class="print" onclick="window.print()">طباعة الفاتورة</button>`
    +`</div>`;

  printWindow({
    title:invoiceNo(payment),
    style:RECEIPT_STYLE,
    body,
    width:420,
    height:700,
    blockedMessage:'اسمح للنوافذ المنبثقة حتى يتم فتح الفاتورة.',
    autoPrint:true
  });
}
// One form for both places a payment is listed: the collections table and the
// student ledger. It edits the fee the payment settles too, so a payment entered
// against the wrong month is corrected without deleting and re-entering it.
window.editStudentPayment=async id=>{
  const payment=state.data.studentPayments.find(x=>Number(x.id)===Number(id));
  if(!payment)return;
  if(!(await requirePassword()))return;
  const student=state.data.students.find(x=>Number(x.id)===Number(payment.studentId));
  $('paymentEditId').value=payment.id;
  $('paymentEditIdentity').textContent=`${invoiceNo(payment)} — ${student?`${student.name} — القسم: ${student.className}`:'طالب محذوف'}`;
  $('paymentEditMonth').innerHTML=monthOptionsHtml();
  $('paymentEditMonth').value=payment.month;
  $('paymentEditAmount').value=payment.amount;
  $('paymentEditDate').value=payment.date||today();
  $('paymentEditNotes').value=payment.notes||'';
  const dialog=$('paymentEditDialog');
  if(!dialog.open)dialog.showModal();
  $('paymentEditAmount').focus();
};
$('paymentEditForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const id=$('paymentEditId').value;
  const body={month:$('paymentEditMonth').value,amount:western($('paymentEditAmount').value),date:$('paymentEditDate').value,notes:$('paymentEditNotes').value};
  try{
    await api(`/student-payments/${id}`,{method:'PUT',body:JSON.stringify(body)});
    $('paymentEditDialog').close();
    // Refreshes the ledger too: load() ends with refreshStudentFeeDetails().
    await refreshAll();
    toast('تم تعديل الدفعة.');
  }catch(error){toast(error.message)}
});
$('closePaymentEdit').onclick=()=>$('paymentEditDialog').close();
$('cancelPaymentEdit').onclick=()=>$('paymentEditDialog').close();
window.deleteStudentPayment=async id=>{await deleteWithPassword(`/student-payments/${id}`,'هل تريد حذف دفعة الطالب؟','تم حذف دفعة الطالب.');};
