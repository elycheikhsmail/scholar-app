// Écran « المصروفات » (dépenses), tableau de bord et rapports financiers.
// Les trois partagent la même source : `state.data`, rechargée par `load()`.
// `sumAmount` vient de core.js.

// --- Dépenses ---------------------------------------------------------------

// Contrôles de la dépense, repris de `addExpense` (db.js), signalés champ par
// champ avant l'envoi (helpers de core.js).
function expenseFieldErrors(payload){
  const errors={};
  if(!payload.category.trim())errors.expenseCategory='نوع المصروف مطلوب.';
  if(payload.amount.trim()==='')errors.expenseAmount='المبلغ مطلوب.';
  else if(!(Number(payload.amount)>0))errors.expenseAmount='أدخل مبلغًا صحيحًا أكبر من صفر.';
  if(dateFieldState('expenseDate')==='partial')errors.expenseDate='أكمل التاريخ: اليوم والشهر والسنة.';
  else if(!payload.date)errors.expenseDate='تاريخ المصروف مطلوب.';
  return errors;
}
const EXPENSE_SERVER_ERROR_FIELDS=[['نوع المصروف','expenseCategory'],['المبلغ','expenseAmount'],['التاريخ','expenseDate']];
clearFieldErrorOnEdit($('expenseForm'));
$('expenseForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('expenseId').value;
  const payload={
    category:$('expenseCategory').value,
    description:$('expenseDescription').value,
    amount:western($('expenseAmount').value),
    date:$('expenseDate').value,
    beneficiary:$('expenseBeneficiary').value,
    paymentMethod:$('expenseMethod').value,
    notes:$('expenseNotes').value
  };
  const errors=expenseFieldErrors(payload);
  if(Object.keys(errors).length){
    showFormErrors($('expenseForm'),errors);
    return toast(`صحّح الحقول المحددة باللون الأحمر: ${Object.values(errors)[0]}`);
  }
  clearFormErrors($('expenseForm'));
  try{
    if(id){
      // Modifier une dépense déjà enregistrée demande la confirmation du mot de passe.
      if(!(await requirePassword()))return;
      await api(`/expenses/${id}`,{method:'PUT',body:JSON.stringify(payload)});
    }else{
      await api('/expenses',{method:'POST',body:JSON.stringify(payload)});
    }
    await load();
    resetExpense();
    renderExpenses();
    renderDashboard();
    toast('تم حفظ المصروف.');
  }catch(error){
    const field=serverErrorField(error.message,EXPENSE_SERVER_ERROR_FIELDS);
    if(field)showFormErrors($('expenseForm'),{[field]:error.message});
    toast(error.message);
  }
};

$('cancelExpense').onclick=resetExpense;

function resetExpense(){
  clearFormErrors($('expenseForm'));
  $('expenseForm').reset();
  $('expenseId').value='';
  $('expenseDate').value=today();
  setPaymentMethod('expenseMethod',DEFAULT_PAYMENT_METHOD);
}

// Filtre par mois scolaire : les mois déjà commencés (comme les rapports) ou
// tout le registre. Une dépense se range d'après sa date.
const ALL_EXPENSES='__all__';
function renderExpenseMonths(){
  const select=$('expenseMonth');
  // Le mois courant va jusqu'à sa fin : une dépense datée plus tard dans le mois reste visible.
  const startYear=startYearOf(state.settings?.schoolYear);
  const periods=reportPeriods().filter(p=>p.value!==YEAR_PERIOD).map(p=>({...p,end:monthDate(p.value,startYear,31)}));
  periods.unshift({value:ALL_EXPENSES,label:'كل الأشهر',start:'',end:'9999-12-31'});
  const chosen=periods.some(p=>p.value===select.value)?select.value:ALL_EXPENSES;
  select.innerHTML=periods.map(p=>`<option value="${esc(p.value)}">${esc(p.label)}</option>`).join('');
  select.value=chosen;
  return periods.find(p=>p.value===chosen);
}
$('expenseMonth').onchange=renderExpenses;

function renderExpenses(){
  const period=renderExpenseMonths();
  const expenses=state.data.expenses.filter(e=>e.date>=period.start&&e.date<=period.end);
  $('expenseCount').textContent=money(expenses.length);
  $('expenseTotal').textContent=money(sumAmount(expenses));
  const rows=expenses.map(e=>`<tr>
    <td>${esc(e.category)}</td>
    <td>${esc(e.description)}</td>
    <td>${money(e.amount)}</td>
    <td>${western(e.date)}</td>
    <td>${esc(e.beneficiary)}</td>
    <td>${esc(e.paymentMethod||DEFAULT_PAYMENT_METHOD)}</td>
    <td>${esc(e.createdBy||'—')}</td>
    <td class="actions"><button class="btn-edit" onclick="editExpense(${e.id})">تعديل</button><button class="btn-delete" onclick="removeExpense(${e.id})">حذف</button></td>
  </tr>`).join('');
  $('expensesTable').innerHTML=rows||`<tr><td colspan="8">${period.value===ALL_EXPENSES?'لا توجد مصروفات مسجلة.':`لا توجد مصروفات في شهر ${esc(period.label)}.`}</td></tr>`;
}

window.editExpense=id=>{
  const expense=state.data.expenses.find(x=>x.id===id);
  if(!expense)return;
  const fields={
    expenseId:expense.id,
    expenseCategory:expense.category,
    expenseDescription:expense.description,
    expenseAmount:expense.amount,
    expenseDate:expense.date,
    expenseBeneficiary:expense.beneficiary,
    expenseNotes:expense.notes
  };
  for(const [fieldId,value] of Object.entries(fields))$(fieldId).value=value??'';
  setPaymentMethod('expenseMethod',expense.paymentMethod||DEFAULT_PAYMENT_METHOD);
  showEditForm('expenses','expenseForm','expenseCategory');
};

window.removeExpense=async id=>{
  await deleteWithPassword(`/expenses/${id}`,'هل تريد حذف هذا المصروف؟','تم حذف المصروف.');
};

// --- Tableau de bord --------------------------------------------------------

function renderDashboard(){
  const d=state.data;
  const male=d.students.filter(s=>s.gender==='ذكر').length;
  const female=d.students.filter(s=>s.gender==='أنثى').length;
  const fees=sumAmount(live(d.studentPayments));
  const salaries=sumAmount(live(d.teacherPayments));
  const advances=sumAmount(live(d.teacherAdvances));
  const expenses=sumAmount(d.expenses);

  $('sStudents').textContent=money(d.students.length);
  $('studentGenderSummary').textContent=`ذكور: ${money(male)} | إناث: ${money(female)}`;
  $('sTeachers').textContent=money(d.teachers.length);
  $('sFees').textContent=money(fees);
  $('sSalaries').textContent=money(salaries+advances);
  $('sExpenses').textContent=money(expenses);
  $('sNet').textContent=money(fees-salaries-advances-expenses);

  // Le mois en cours se lit de deux façons, toutes deux affichées : ce que le
  // moteur a réellement affecté au frais de ce mois (toutes factures
  // confondues), et ce qui est entré en caisse d'après la date des reçus — le
  // même chiffre que le rapport du mois. Un salaire porte son mois ; une
  // dépense porte seulement sa date, donc le mois courant s'y lit sur `AAAA-MM`.
  const month=currentMonth();
  const thisMonth=today().slice(0,7);
  const period=reportPeriods().find(p=>p.value===month);
  let monthPaid=0,monthDue=0;
  for(const ledger of ledgers().values()){const row=ledger.byMonth.get(month);if(row){monthPaid+=row.paid;monthDue+=row.amount}}
  $('dMonth').textContent=month;
  $('dFees').textContent=money(monthPaid);
  $('dFeesRemaining').textContent=`المتبقي من رسوم الشهر: ${money(round2(monthDue-monthPaid))}`;
  $('dCollected').textContent=money(period?sumAmount(live(d.studentPayments).filter(x=>x.date>=period.start&&x.date<=period.end)):0);
  $('dSalary').textContent=money(sumAmount(live(d.teacherPayments).filter(x=>x.month===month)));
  $('dExpenses').textContent=money(sumAmount(d.expenses.filter(x=>x.date.slice(0,7)===thisMonth)));
}

// --- Rapports mensuels -------------------------------------------------------
// Un rapport couvre un mois scolaire déjà commencé : ce qui est entré et sorti
// pendant ce mois (d'après la date des reçus et des dépenses), et l'état des
// créances à la fin du mois. Le mois courant s'arrête à aujourd'hui ; la
// dernière option cumule l'année scolaire. Les inscriptions de septembre (avant
// le premier mois) comptent dans le rapport d'octobre, comme dans les relevés.
const YEAR_PERIOD='__year__';
function reportPeriods(){
  const startYear=startYearOf(state.settings?.schoolYear);
  const last=monthIndexOf(today(),startYear)??0;
  const periods=months.slice(0,last+1).map((month,i)=>{
    const end=monthDate(month,startYear,31);
    return {value:month,label:month,start:i?monthDate(month,startYear,1):'',end:end<today()?end:today()};
  });
  periods.push({value:YEAR_PERIOD,label:'السنة الدراسية كاملة',start:'',end:today()});
  return periods;
}
// Le comptable ferme aussi sa caisse au jour : « اليوم » et une période libre
// (من – إلى) s'ajoutent aux mois scolaires et à l'année.
const DAY_PERIOD='__day__',CUSTOM_PERIOD='__custom__';
function customPeriod(){
  const from=$('reportFrom').value||today(),to=$('reportTo').value||today();
  return {value:CUSTOM_PERIOD,label:`من ${western(from)} إلى ${western(to)}`,start:from<=to?from:to,end:from<=to?to:from};
}
function renderReportPeriods(){
  const select=$('reportMonth');
  const periods=[{value:DAY_PERIOD,label:`اليوم (${western(today())})`,start:today(),end:today()},...reportPeriods(),{value:CUSTOM_PERIOD,label:'فترة مخصصة (من – إلى)',start:'',end:''}];
  const chosen=periods.some(p=>p.value===select.value)?select.value:currentMonth();
  select.innerHTML=periods.map(p=>`<option value="${esc(p.value)}">${esc(p.label)}</option>`).join('');
  select.value=periods.some(p=>p.value===chosen)?chosen:periods[periods.length-2].value;
  const custom=select.value===CUSTOM_PERIOD;
  $('reportFromWrap').classList.toggle('hidden',!custom);
  $('reportToWrap').classList.toggle('hidden',!custom);
  if(custom){if(!$('reportFrom').value)$('reportFrom').value=today();if(!$('reportTo').value)$('reportTo').value=today();return customPeriod()}
  return periods.find(p=>p.value===select.value);
}
$('reportMonth').onchange=renderReports;
$('reportFrom').onchange=renderReports;
$('reportTo').onchange=renderReports;

// --- يومية الصندوق ------------------------------------------------------------
// Chaque mouvement de la période, dans l'ordre : ce qui est entré (فواتير) et
// sorti (رواتب, سلف, مصروفات), avec la méthode de paiement et l'auteur. Le
// solde d'ouverture est le net de tout ce qui précède la période.
const JOURNAL_KINDS={fee:'رسوم طالب',salary:'راتب',advance:'سلفة',expense:'مصروف'};
function journalMovements(){
  const d=state.data;
  const students=new Map(d.students.map(s=>[Number(s.id),s]));
  const teachers=new Map(d.teachers.map(t=>[Number(t.id),t]));
  const method=r=>r.paymentMethod||DEFAULT_PAYMENT_METHOD;
  const rows=[];
  for(const p of live(d.studentPayments)){
    const s=students.get(Number(p.studentId));
    rows.push({date:p.date,time:p.time||'',id:Number(p.id),kind:'fee',ref:invoiceNo(p),party:s?`${s.name} — ${s.className}`:'طالب محذوف',detail:settledText(p),method:method(p),inflow:Number(p.amount)||0,outflow:0,by:p.createdBy||''});
  }
  for(const p of live(d.teacherPayments)){
    const t=teachers.get(Number(p.teacherId));
    rows.push({date:p.date,time:p.time||'',id:Number(p.id),kind:'salary',ref:salaryReceiptNo(p),party:t?t.name:'موظف محذوف',detail:`راتب ${p.month}${p.extra?' (دفعة إضافية)':''}${p.notes?' — '+p.notes:''}`,method:method(p),inflow:0,outflow:Number(p.amount)||0,by:p.createdBy||''});
  }
  for(const a of live(d.teacherAdvances)){
    const t=teachers.get(Number(a.teacherId));
    rows.push({date:a.date,time:a.time||'',id:Number(a.id),kind:'advance',ref:advanceReceiptNo(a),party:t?t.name:'موظف محذوف',detail:`سلفة على راتب ${a.month}${a.notes?' — '+a.notes:''}`,method:method(a),inflow:0,outflow:Number(a.amount)||0,by:a.createdBy||''});
  }
  for(const e of d.expenses){
    rows.push({date:e.date,time:'',id:Number(e.id),kind:'expense',ref:'',party:e.beneficiary||'—',detail:[e.category,e.description].filter(Boolean).join(' — '),method:method(e),inflow:0,outflow:Number(e.amount)||0,by:e.createdBy||''});
  }
  return rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))||a.id-b.id);
}
let journalView={period:null,rows:[],opening:0,inflow:0,outflow:0,methods:[]};
function renderCashJournal(period){
  const all=journalMovements();
  const before=period.start?all.filter(r=>r.date<period.start):[];
  const rows=all.filter(r=>r.date>=period.start&&r.date<=period.end);
  const opening=round2(before.reduce((s,r)=>s+r.inflow-r.outflow,0));
  const inflow=round2(rows.reduce((s,r)=>s+r.inflow,0)),outflow=round2(rows.reduce((s,r)=>s+r.outflow,0));
  const byMethod=new Map();
  for(const r of rows){const m=byMethod.get(r.method)||{inflow:0,outflow:0};m.inflow+=r.inflow;m.outflow+=r.outflow;byMethod.set(r.method,m)}
  const methods=[...byMethod.entries()].map(([name,m])=>({name,inflow:round2(m.inflow),outflow:round2(m.outflow),net:round2(m.inflow-m.outflow)}));
  journalView={period,rows,opening,inflow,outflow,methods};
  const cell=(cls,label,value)=>`<span${cls?` class="${cls}"`:''}><small>${label}</small><b>${money(value)}</b></span>`;
  $('cashJournalTotals').innerHTML=cell('','رصيد ما قبل الفترة',opening)+cell('status-paid','داخل',inflow)+cell('status-unpaid','خارج',outflow)+cell('','صافي الفترة',round2(inflow-outflow))+cell('status-overpaid','رصيد نهاية الفترة',round2(opening+inflow-outflow))+cell('','عدد الحركات',rows.length);
  $('cashJournalTable').innerHTML=rows.map(r=>`<tr>
    <td>${esc(western(r.date))}${r.time?` <small>${esc(western(r.time))}</small>`:''}</td>
    <td>${esc(r.ref||'—')}</td>
    <td>${esc(JOURNAL_KINDS[r.kind])}</td>
    <td>${esc(r.party)}</td>
    <td class="paid-months">${esc(r.detail)}</td>
    <td>${esc(r.method)}</td>
    <td class="journal-in">${r.inflow?money(r.inflow):''}</td>
    <td class="journal-out">${r.outflow?money(r.outflow):''}</td>
    <td>${esc(r.by||'—')}</td>
  </tr>`).join('')||'<tr><td colspan="9">لا توجد حركات في هذه الفترة.</td></tr>';
  $('cashMethodsTable').innerHTML=methods.map(m=>`<tr><td>${esc(m.name)}</td><td class="journal-in">${money(m.inflow)}</td><td class="journal-out">${money(m.outflow)}</td><td>${money(m.net)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد حركات.</td></tr>';
}
function journalSheetRows(){
  const head=['التاريخ','الوقت','الوصل','النوع','الطرف','البيان','طريقة الدفع','داخل','خارج','سجّلها'];
  return [head,...journalView.rows.map(r=>[r.date,r.time,r.ref,JOURNAL_KINDS[r.kind],r.party,r.detail,r.method,r.inflow||'',r.outflow||'',r.by])];
}
$('exportJournal').onclick=()=>{
  if(!journalView.rows.length)return toast('لا توجد حركات لتصديرها.');
  downloadXlsx(`يومية الصندوق — ${journalView.period.label} — ${today()}.xlsx`,'يومية الصندوق',journalSheetRows());
  toast('تم تصدير يومية الصندوق إلى Excel.');
};

function renderDuesReports(period){
  // Les créances telles qu'elles se présentaient à la fin de la période : seuls
  // les reçus datés avant cette fin comptent, et le mois suivant n'est pas encore dû.
  const settings={...feeSettings(),asOf:period.end};
  const byStudent=new Map();
  for(const p of live(state.data.studentPayments)){
    if(p.date>period.end)continue;
    const list=byStudent.get(Number(p.studentId));
    if(list)list.push(p);else byStudent.set(Number(p.studentId),[p]);
  }
  const accounts=state.data.students.map(student=>({student,ledger:ledgerFor(student,byStudent.get(Number(student.id))||[],settings)}));
  const byDepartment=new Map();
  for(const account of accounts){
    const key=account.student.className||'—';
    const totals=byDepartment.get(key)||{count:0,due:0,paid:0,remaining:0,late:0};
    totals.count++;totals.due+=account.ledger.totalDue;totals.paid+=account.ledger.allocated;totals.remaining+=account.ledger.outstanding;
    if(account.ledger.oldestUnpaid&&account.ledger.oldestUnpaid.dueDate<period.end)totals.late++;
    byDepartment.set(key,totals);
  }
  const departments=[...byDepartment.entries()].sort((a,b)=>b[1].remaining-a[1].remaining);
  const grand=departments.reduce((a,[,t])=>({count:a.count+t.count,due:a.due+t.due,paid:a.paid+t.paid,remaining:a.remaining+t.remaining,late:a.late+t.late}),{count:0,due:0,paid:0,remaining:0,late:0});
  const departmentRows=departments.map(([name,t])=>`<tr>
    <td>${esc(name)}</td>
    <td>${money(t.count)}</td>
    <td>${money(t.due)}</td>
    <td class="status-paid">${money(t.paid)}</td>
    <td class="${t.remaining>0?'overdue-soft':'status-paid'}">${money(t.remaining)}</td>
    <td class="${t.late>0?'overdue-strong':''}">${money(t.late)}</td>
  </tr>`).join('');
  const grandRow=departments.length?`<tr class="totals-row">
    <td>الإجمالي</td>
    <td>${money(grand.count)}</td>
    <td>${money(grand.due)}</td>
    <td class="status-paid">${money(grand.paid)}</td>
    <td class="overdue-soft">${money(grand.remaining)}</td>
    <td>${money(grand.late)}</td>
  </tr>`:'<tr><td colspan="6">لا يوجد طلاب.</td></tr>';
  $('departmentDuesTable').innerHTML=departmentRows+grandRow;
  const duesInfo=`المستحقات كما كانت بتاريخ ${western(period.end)}: الرسوم المستحقة حتى ذلك اليوم والدفعات المسجلة قبله.`;
  $('departmentDuesInfo').textContent=duesInfo;
  // Les vingt comptes qui doivent le plus, du plus lourd au plus léger.
  const debtors=accounts.filter(a=>a.ledger.outstanding>0)
    .sort((a,b)=>b.ledger.outstanding-a.ledger.outstanding)
    .slice(0,20);
  const debtorRows=debtors.map(({student,ledger})=>`<tr>
    <td>${esc(student.name)}</td>
    <td>${esc(student.className)}</td>
    <td>${esc(student.guardianName||'—')}</td>
    <td>${esc(student.guardianPhone||'—')}</td>
    <td>${money(ledger.unpaidCount)}</td>
    <td>${ledger.oldestUnpaid?esc(ledger.oldestUnpaid.month)+' — '+western(ledger.oldestUnpaid.dueDate):'—'}</td>
    <td class="overdue-strong">${money(ledger.outstanding)}</td>
  </tr>`).join('');
  $('topDebtorsTable').innerHTML=debtorRows||'<tr><td colspan="7">لا توجد مستحقات غير مسددة.</td></tr>';
  return {duesInfo,departmentTable:$('departmentDuesTable').innerHTML,debtorTable:$('topDebtorsTable').innerHTML};
}

function renderReports(){
  const d=state.data;
  const period=renderReportPeriods();
  const within=x=>x.date>=period.start&&x.date<=period.end;
  const fees=sumAmount(live(d.studentPayments).filter(within));
  const salaries=sumAmount(live(d.teacherPayments).filter(within));
  const advances=sumAmount(live(d.teacherAdvances).filter(within));
  const expenses=sumAmount(d.expenses.filter(within));
  const out=salaries+advances+expenses;
  $('rIncome').textContent=money(fees);
  $('rOutSalaries').textContent=money(salaries+advances);
  $('rOutExpenses').textContent=money(expenses);
  $('rOut').textContent=money(out);
  $('rNet').textContent=money(fees-out);
  $('rFees').textContent=money(fees);
  $('rSalaries').textContent=money(salaries);
  $('rAdvances').textContent=money(advances);
  $('rExpenses').textContent=money(expenses);
  const isYear=period.value===YEAR_PERIOD;
  const periodName=isYear?'السنة الدراسية':period.value===DAY_PERIOD?'اليوم':period.value===CUSTOM_PERIOD?'الفترة':`شهر ${period.label}`;
  $('reportBreakdownTitle').textContent=isYear?'تفصيل السنة الدراسية':`تفصيل ${periodName}`;
  $('reportPeriodInfo').textContent=`${periodName}: ${period.start?`من ${western(period.start)} `:'من بداية السنة '}إلى ${western(period.end)} — الدخل والخارج بحسب تاريخ التسجيل الفعلي للدفعات والمصروفات.`;
  renderCashJournal(period);
  const dues=renderDuesReports(period);
  // Ce que le bouton d'impression reproduit : la période affichée, ni plus ni moins.
  currentReport={period,isYear,periodName,fees,salaries,advances,expenses,out,expensesByCategory:expensesByCategory(d.expenses.filter(within)),journal:journalView,...dues};
}

let currentReport=null;
function expensesByCategory(expenses){
  const totals=new Map();
  for(const e of expenses)totals.set(e.category,(totals.get(e.category)||0)+Number(e.amount||0));
  return [...totals.entries()].sort((a,b)=>b[1]-a[1]);
}

// Rapport imprimé (A4) : la synthèse du mois, les dépenses par nature, puis
// les créances par classe et les principaux débiteurs, tels qu'affichés.
$('printReport').onclick=()=>{
  if(!currentReport)renderReports();
  const r=currentReport;
  const periodLabel=r.isYear?'السنة الدراسية كاملة':r.period.value===DAY_PERIOD||r.period.value===CUSTOM_PERIOD?r.period.label:`شهر ${r.period.label}`;
  const range=`${r.period.start?`من ${western(r.period.start)} `:'من بداية السنة '}إلى ${western(r.period.end)}`;
  const line=(label,value,cls='')=>`<tr class="${cls}"><td>${label}</td><td>${money(value)}</td></tr>`;
  const summary=`<h3>${esc(periodLabel)} — ${range}</h3><table><thead><tr><th>البند</th><th>المبلغ (أوقية)</th></tr></thead><tbody>`
    +line('رسوم الطلاب المحصَّلة (الدخل)',r.fees,'total')
    +line('الرواتب المدفوعة',r.salaries)+line('السلف المصروفة',r.advances)+line('الخارج: الرواتب والسلف',r.salaries+r.advances,'total')
    +line('الخارج: المصروفات',r.expenses,'total')
    +line('إجمالي الخارج',r.out,'total')+line('الصافي',r.fees-r.out,'total')+'</tbody></table>';
  const categories=r.expensesByCategory.length
    ?`<h3>المصروفات حسب النوع</h3><table><thead><tr><th>نوع المصروف</th><th>المبلغ</th></tr></thead><tbody>${r.expensesByCategory.map(([c,v])=>line(esc(c),v)).join('')}</tbody></table>`
    :'';
  const j=r.journal;
  const journal=`<h3>يومية الصندوق</h3><table><thead><tr><th>البند</th><th>المبلغ (أوقية)</th></tr></thead><tbody>`
    +line('رصيد ما قبل الفترة',j.opening)+line('داخل',j.inflow)+line('خارج',j.outflow)+line('رصيد نهاية الفترة',j.opening+j.inflow-j.outflow,'total')+'</tbody></table>'
    +(j.methods.length?`<h3>حسب طريقة الدفع</h3><table><thead><tr><th>طريقة الدفع</th><th>داخل</th><th>خارج</th><th>الصافي</th></tr></thead><tbody>${j.methods.map(m=>`<tr><td>${esc(m.name)}</td><td>${money(m.inflow)}</td><td>${money(m.outflow)}</td><td>${money(m.net)}</td></tr>`).join('')}</tbody></table>`:'')
    +`<h3>حركات الفترة (${money(j.rows.length)})</h3><table><thead><tr><th>التاريخ</th><th>الوصل</th><th>النوع</th><th>الطرف</th><th>البيان</th><th>طريقة الدفع</th><th>داخل</th><th>خارج</th><th>سجّلها</th></tr></thead><tbody>`
    +(j.rows.map(x=>`<tr><td>${esc(western(x.date))} ${esc(western(x.time))}</td><td>${esc(x.ref)}</td><td>${esc(JOURNAL_KINDS[x.kind])}</td><td>${esc(x.party)}</td><td>${esc(x.detail)}</td><td>${esc(x.method)}</td><td>${x.inflow?money(x.inflow):''}</td><td>${x.outflow?money(x.outflow):''}</td><td>${esc(x.by)}</td></tr>`).join('')||'<tr><td colspan="9">لا توجد حركات.</td></tr>')
    +`<tr class="total"><td colspan="6">الإجمالي</td><td>${money(j.inflow)}</td><td>${money(j.outflow)}</td><td></td></tr></tbody></table>`;
  const dues=`<h3>ملخص المستحقات حسب القسم</h3><p>${esc(r.duesInfo)}</p><table><thead><tr><th>القسم</th><th>عدد الطلاب</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>عدد المتأخرين</th></tr></thead><tbody>${r.departmentTable}</tbody></table>`
    +`<h3>أعلى المديونين</h3><table><thead><tr><th>الطالب</th><th>القسم</th><th>ولي الأمر</th><th>الهاتف</th><th>أشهر غير مسدَّدة</th><th>أقدم استحقاق</th><th>المتبقي</th></tr></thead><tbody>${r.debtorTable}</tbody></table>`;
  openPrintWindow(`التقرير المالي — ${periodLabel}`,`${summary}${categories}${journal}${dues}`);
};
