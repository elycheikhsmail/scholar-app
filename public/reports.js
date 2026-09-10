// Écran « المصروفات » (dépenses), tableau de bord et rapports financiers.
// Les trois partagent la même source : `state.data`, rechargée par `load()`.

const sumAmount=rows=>rows.reduce((total,row)=>total+Number(row.amount||0),0);

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

// --- Rapports de créances ---------------------------------------------------

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
}

function renderReports(){
  const d=state.data;
  const income=sumAmount(d.studentPayments);
  const out=sumAmount(d.teacherPayments)+sumAmount(d.teacherAdvances)+sumAmount(d.expenses);
  $('rIncome').textContent=money(income);
  $('rOut').textContent=money(out);
  $('rNet').textContent=money(income-out);
  renderDuesReports();
}
