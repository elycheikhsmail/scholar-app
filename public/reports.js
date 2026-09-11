// Écran « المصروفات » (dépenses), tableau de bord et rapports financiers.
// Les trois partagent la même source : `state.data`, rechargée par `load()`.
// `sumAmount` vient de core.js.

// --- Dépenses ---------------------------------------------------------------

$('expenseForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('expenseId').value;
  const payload={
    category:$('expenseCategory').value,
    description:$('expenseDescription').value,
    amount:western($('expenseAmount').value),
    date:$('expenseDate').value||today(),
    beneficiary:$('expenseBeneficiary').value,
    notes:$('expenseNotes').value
  };
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
    toast(error.message);
  }
};

$('cancelExpense').onclick=resetExpense;

function resetExpense(){
  $('expenseForm').reset();
  $('expenseId').value='';
  $('expenseDate').value=today();
}

function renderExpenses(){
  const rows=state.data.expenses.map(e=>`<tr>
    <td>${esc(e.category)}</td>
    <td>${esc(e.description)}</td>
    <td>${money(e.amount)}</td>
    <td>${western(e.date)}</td>
    <td>${esc(e.beneficiary)}</td>
    <td class="actions"><button class="btn-edit" onclick="editExpense(${e.id})">تعديل</button><button class="btn-delete" onclick="removeExpense(${e.id})">حذف</button></td>
  </tr>`).join('');
  $('expensesTable').innerHTML=rows||'<tr><td colspan="6">لا توجد مصروفات مسجلة.</td></tr>';
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
  const fees=sumAmount(d.studentPayments);
  const salaries=sumAmount(d.teacherPayments);
  const advances=sumAmount(d.teacherAdvances);
  const expenses=sumAmount(d.expenses);

  $('sStudents').textContent=money(d.students.length);
  $('studentGenderSummary').textContent=`ذكور: ${money(male)} | إناث: ${money(female)}`;
  $('sTeachers').textContent=money(d.teachers.length);
  $('sFees').textContent=money(fees);
  $('sSalaries').textContent=money(salaries+advances);
  $('sExpenses').textContent=money(expenses);
  $('sNet').textContent=money(fees-salaries-advances-expenses);

  // Les paiements portent le mois qu'ils règlent ; une dépense porte seulement
  // sa date, donc le mois courant s'y lit sur le préfixe `AAAA-MM`.
  const month=currentMonth();
  const thisMonth=today().slice(0,7);
  $('dMonth').textContent=month;
  $('dFees').textContent=money(sumAmount(d.studentPayments.filter(x=>x.month===month)));
  $('dSalary').textContent=money(sumAmount(d.teacherPayments.filter(x=>x.month===month)));
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
function renderReportPeriods(){
  const select=$('reportMonth');
  const periods=reportPeriods();
  const chosen=periods.some(p=>p.value===select.value)?select.value:currentMonth();
  select.innerHTML=periods.map(p=>`<option value="${esc(p.value)}">${esc(p.label)}</option>`).join('');
  select.value=periods.some(p=>p.value===chosen)?chosen:periods[periods.length-1].value;
  return periods.find(p=>p.value===select.value);
}
$('reportMonth').onchange=renderReports;

function renderDuesReports(period){
  // Les créances telles qu'elles se présentaient à la fin de la période : seuls
  // les reçus datés avant cette fin comptent, et le mois suivant n'est pas encore dû.
  const settings={...feeSettings(),asOf:period.end};
  const byStudent=new Map();
  for(const p of state.data.studentPayments){
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
  const fees=sumAmount(d.studentPayments.filter(within));
  const salaries=sumAmount(d.teacherPayments.filter(within));
  const advances=sumAmount(d.teacherAdvances.filter(within));
  const expenses=sumAmount(d.expenses.filter(within));
  const out=salaries+advances+expenses;
  $('rIncome').textContent=money(fees);
  $('rOut').textContent=money(out);
  $('rNet').textContent=money(fees-out);
  $('rFees').textContent=money(fees);
  $('rSalaries').textContent=money(salaries);
  $('rAdvances').textContent=money(advances);
  $('rExpenses').textContent=money(expenses);
  const isYear=period.value===YEAR_PERIOD;
  $('reportBreakdownTitle').textContent=isYear?'تفصيل السنة الدراسية':`تفصيل شهر ${period.label}`;
  $('reportPeriodInfo').textContent=`${isYear?'السنة الدراسية':`شهر ${period.label}`}: ${period.start?`من ${western(period.start)} `:'من بداية السنة '}إلى ${western(period.end)} — الدخل والخارج بحسب تاريخ التسجيل الفعلي للدفعات والمصروفات.`;
  const dues=renderDuesReports(period);
  // Ce que le bouton d'impression reproduit : la période affichée, ni plus ni moins.
  currentReport={period,isYear,fees,salaries,advances,expenses,out,expensesByCategory:expensesByCategory(d.expenses.filter(within)),...dues};
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
  const periodLabel=r.isYear?'السنة الدراسية كاملة':`شهر ${r.period.label}`;
  const range=`${r.period.start?`من ${western(r.period.start)} `:'من بداية السنة '}إلى ${western(r.period.end)}`;
  const line=(label,value,cls='')=>`<tr class="${cls}"><td>${label}</td><td>${money(value)}</td></tr>`;
  const summary=`<h3>${esc(periodLabel)} — ${range}</h3><table><thead><tr><th>البند</th><th>المبلغ (أوقية)</th></tr></thead><tbody>`
    +line('رسوم الطلاب المحصَّلة (الدخل)',r.fees,'total')
    +line('الرواتب المدفوعة',r.salaries)+line('السلف المصروفة',r.advances)+line('المصروفات',r.expenses)
    +line('إجمالي الخارج',r.out,'total')+line('الصافي',r.fees-r.out,'total')+'</tbody></table>';
  const categories=r.expensesByCategory.length
    ?`<h3>المصروفات حسب النوع</h3><table><thead><tr><th>نوع المصروف</th><th>المبلغ</th></tr></thead><tbody>${r.expensesByCategory.map(([c,v])=>line(esc(c),v)).join('')}</tbody></table>`
    :'';
  const dues=`<h3>ملخص المستحقات حسب القسم</h3><p>${esc(r.duesInfo)}</p><table><thead><tr><th>القسم</th><th>عدد الطلاب</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>عدد المتأخرين</th></tr></thead><tbody>${r.departmentTable}</tbody></table>`
    +`<h3>أعلى المديونين</h3><table><thead><tr><th>الطالب</th><th>القسم</th><th>ولي الأمر</th><th>الهاتف</th><th>أشهر غير مسدَّدة</th><th>أقدم استحقاق</th><th>المتبقي</th></tr></thead><tbody>${r.debtorTable}</tbody></table>`;
  openPrintWindow(`التقرير المالي — ${periodLabel}`,`${summary}${categories}${dues}`);
};
