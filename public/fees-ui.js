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
  const paymentLabel=blocked?'لا يوجد متبقٍّ':`دفعة ${s.name}`;
  return `<tr class="${days>0?'overdue-row':''}"><td>${esc(s.className)}</td><td>${esc(s.schoolNo)}</td><td>${esc(s.callNo)}</td><td class="fee-student-cell"><strong>${esc(s.name)}</strong><small>${esc(s.className)} · ${esc(s.schoolNo)}</small></td><td>${money(row.gross)}</td><td class="${row.discount>0?'status-exempt':''}">${row.discount>0?money(row.discount):'—'}</td><td>${money(row.due)}</td><td>${money(row.paid)}</td><td class="${row.remaining>0?(days>0?'overdue-strong':'overdue-soft'):'status-paid'}">${money(row.remaining)}</td><td>${row.charged&&row.dueDate?western(row.dueDate):'—'}</td>${ageCell(days)}<td class="${cls}">${esc(label)}</td><td><input id="fp-${s.id}" class="payment-input" type="number" min="1" max="${row.ledger.outstanding}" placeholder="المبلغ" aria-label="${esc(paymentLabel)}" ${blocked?'disabled':''}></td><td class="fee-row-actions"><button class="${registrationFeesPaid(s)?'btn-pay':'btn-edit'}" onclick="openStudentFees(${s.id})">${registrationFeesPaid(s)?'تم دفع الرسوم':'استمارة الرسوم'}</button><button class="btn-edit" onclick="openStudentFees(${s.id},true)">كشف الحساب</button><button class="btn-pay" onclick="payFee(${s.id})" ${blocked?'disabled':''}>حفظ وطباعة</button></td></tr>`;
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
  $('feesHead').innerHTML=FEE_COLUMNS.map(column=>`<th class="sortable" data-sort="${column.key}" title="اضغط للفرز">${esc(feeColumnLabel(column,month))}${feeSort.key===column.key?(feeSort.dir>0?' ▲':' ▼'):''}</th>`).join('')+'<th>الحالة</th><th>دفعة جديدة</th><th>إجراء</th>';
  const totals=rows.reduce((a,r)=>({gross:a.gross+r.gross,discount:a.discount+r.discount,due:a.due+r.due,paid:a.paid+r.paid,remaining:a.remaining+r.remaining,credit:a.credit+r.ledger.credit}),{gross:0,discount:0,due:0,paid:0,remaining:0,credit:0});
  const shown=feeShowAll?rows:rows.slice(0,FEE_ROW_LIMIT);
  $('feesTable').innerHTML=shown.map(row=>feeRowHtml(row,month)).join('')||`<tr><td colspan="14">لا توجد نتائج مطابقة للتصفية.</td></tr>`;
  const capped=rows.length>FEE_ROW_LIMIT;
  $('feesRowNotice').classList.toggle('hidden',!capped);
  $('feesRowNotice').innerHTML=capped?`يُعرض ${money(shown.length)} من ${money(rows.length)} صفًّا. <button type="button" class="secondary" id="showAllFees">${feeShowAll?'الاكتفاء بأول '+FEE_ROW_LIMIT:'عرض كل الصفوف'}</button>`:'';
  if($('showAllFees'))$('showAllFees').onclick=()=>{feeShowAll=!feeShowAll;renderFees()};
  const quickFilters=[['','الكل',candidates.length],['due','عليه متبقٍّ',statusCounts.due],['late','متأخر',statusCounts.late],['paid','مسدَّد',statusCounts.paid]];
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
