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
  $('feeColumnOptions').innerHTML=FEE_OPTIONAL_COLUMNS.map(column=>`<label><input type="checkbox" data-fee-column-toggle="${column.key}" ${feeHiddenColumns.has(column.key)?'':'checked'}> ${esc(column.label)}</label>`).join('')+'<button type="button" class="secondary" id="showAllFeeColumns">إظهار الكل</button>';
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
  const s=row.student,days=overdueDays(row),[label,cls]=rowStatus(row,month);
  return `<tr class="${days>0?'overdue-row':''}"><td data-fee-column="className">${esc(s.className)}</td><td data-fee-column="schoolNo">${esc(s.schoolNo)}</td><td data-fee-column="callNo">${esc(s.callNo)}</td><td data-fee-column="name" class="fee-student-cell"><strong>${esc(s.name)}</strong><small>${esc(s.className)} · ${esc(s.schoolNo)}</small></td><td data-fee-column="gross">${money(row.gross)}</td><td data-fee-column="discount" class="${row.discount>0?'status-exempt':''}">${row.discount>0?money(row.discount):'—'}</td><td data-fee-column="due">${money(row.due)}</td><td data-fee-column="paid">${money(row.paid)}</td><td data-fee-column="remaining" class="${row.remaining>0?(days>0?'overdue-strong':'overdue-soft'):'status-paid'}">${money(row.remaining)}</td><td data-fee-column="dueDate">${row.charged&&row.dueDate?western(row.dueDate):'—'}</td>${ageCell(days)}<td data-fee-column="status" class="${cls}">${esc(label)}</td><td data-fee-column="actions" class="fee-row-actions"><button class="fee-form-trigger" onclick="openStudentFees(${s.id})" title="فتح استمارة الرسوم" aria-label="فتح استمارة الرسوم للطالب ${esc(s.name)}">+</button><button class="btn-edit" onclick="openStudentFees(${s.id},true)">كشف الحساب</button></td></tr>`;
}
function renderFees(){
  const month=$('feeMonth').value,dep=$('feeDepartment').value,query=$('feeSearch').value.toLowerCase().trim();
  const status=$('feeStatus').value,minRemaining=Number($('feeMinRemaining').value)||0;
  const rows=sortFeeRows(state.data.students
    .filter(s=>(!dep||s.className===dep)&&[s.name,s.schoolNo,s.callNo].join(' ').toLowerCase().includes(query))
    .map(s=>feeRowFor(s,month))
    .filter(row=>passesFeeFilter(row,status,minRemaining)));
  const candidates=state.data.students
    .filter(s=>(!dep||s.className===dep)&&[s.name,s.schoolNo,s.callNo].join(' ').toLowerCase().includes(query))
    .map(s=>feeRowFor(s,month));
  const statusCounts={due:0,late:0,paid:0};
  candidates.forEach(row=>{
    if(row.remaining>0)statusCounts.due++;
    if(overdueDays(row)>0)statusCounts.late++;
    if(row.due>0&&row.remaining<=0)statusCounts.paid++;
  });
  feeView={month,rows};
  $('feesHead').innerHTML=FEE_COLUMNS.map(column=>`<th class="sortable" data-fee-column="${column.key}" data-sort="${column.key}" title="اضغط للفرز">${esc(feeColumnLabel(column,month))}${feeSort.key===column.key?(feeSort.dir>0?' ▲':' ▼'):''}</th>`).join('')+'<th data-fee-column="status">الحالة</th><th data-fee-column="actions">إجراءات</th>';
  const totals=rows.reduce((a,r)=>({gross:a.gross+r.gross,discount:a.discount+r.discount,due:a.due+r.due,paid:a.paid+r.paid,remaining:a.remaining+r.remaining,credit:a.credit+r.ledger.credit}),{gross:0,discount:0,due:0,paid:0,remaining:0,credit:0});
  const shown=feeShowAll?rows:rows.slice(0,FEE_ROW_LIMIT);
  $('feesTable').innerHTML=shown.map(row=>feeRowHtml(row,month)).join('')||`<tr><td colspan="13">لا توجد نتائج مطابقة للتصفية.</td></tr>`;
  applyFeeColumnVisibility();
  const capped=rows.length>FEE_ROW_LIMIT;
  $('feesRowNotice').classList.toggle('hidden',!capped);
  $('feesRowNotice').innerHTML=capped?`يُعرض ${money(shown.length)} من ${money(rows.length)} صفًّا. <button type="button" class="secondary" id="showAllFees">${feeShowAll?'الاكتفاء بأول '+FEE_ROW_LIMIT:'عرض كل الصفوف'}</button>`:'';
  if($('showAllFees'))$('showAllFees').onclick=()=>{feeShowAll=!feeShowAll;renderFees()};
  const quickCounts={'':candidates.length,due:statusCounts.due,late:statusCounts.late,paid:statusCounts.paid};
  const quickFilters=FEE_FILTERS.filter(filter=>filter.value!=='none').map(filter=>[filter.value,filter.label,quickCounts[filter.value]]);
  $('feeQuickFilters').innerHTML=quickFilters.map(([value,label,count])=>`<button type="button" data-fee-status="${value}" class="fee-filter-chip ${status===value?'active':''}" aria-pressed="${status===value}">${label}<b>${money(count)}</b></button>`).join('');
  const activeFilters=[dep&&`القسم: ${dep}`,status&&`الحالة: ${$('feeStatus').selectedOptions[0].textContent}`,minRemaining>0&&`المتبقي من ${money(minRemaining)}`,query&&`البحث: ${$('feeSearch').value.trim()}`].filter(Boolean);
  $('feesFilterSummary').innerHTML=`عرض <strong>${money(rows.length)}</strong> طالب${activeFilters.length?` · ${activeFilters.map(esc).join(' · ')}`:' · دون تصفية إضافية'}`;
  $('feeTotals').innerHTML=`<span><small>الطلاب</small><b>${money(rows.length)}</b></span><span><small>إجمالي المستحق</small><b>${money(totals.due)}</b></span><span class="status-paid"><small>المدفوع</small><b>${money(totals.paid)}</b></span><span class="overdue-soft"><small>المتبقي</small><b>${money(totals.remaining)}</b></span><span class="status-exempt"><small>الخصم</small><b>${money(totals.discount)}</b></span><span class="status-overpaid"><small>رصيد دائن</small><b>${money(totals.credit)}</b></span>`;
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
