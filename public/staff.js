// Écran « الموظفون » : fiches du personnel, versements de salaire et avances.
// Deux régimes de rémunération coexistent :
//   - أستاذ    : payé à l'heure, l'estimation dépend des heures du mois ;
//   - les autres : salaire fixe mensuel.
// `roleNeedsFixed` sépare les deux partout dans le fichier.

function roleNeedsFixed(role){return role!=='أستاذ'}
// Le champ « طبيعة العمل » relit la liste des réglages ; la valeur en cours
// (ou le rôle d'une fiche ancienne absent de la liste) est conservée.
function renderStaffRoleOptions(selected){
  const select=$('teacherRole');
  const current=selected??select.value;
  const roles=staffRoleList().slice();
  if(current&&!roles.includes(current))roles.push(current);
  select.innerHTML=roles.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');
  select.value=roles.includes(current)?current:(roles.includes('معلم')?'معلم':roles[0]);
}

// --- Fiche employé ----------------------------------------------------------

function toggleRoleFields(){
  const role=$('teacherRole').value,isTeacher=role==='أستاذ';
  // La matière n'a de sens que pour le personnel enseignant (أستاذ ou معلم).
  const teaches=isTeacher||role==='معلم';
  $('subjectWrap').classList.toggle('hidden-field',!teaches);
  if(!teaches)$('teacherSubject').value='';
  $('stageWrap').classList.toggle('hidden-field',!isTeacher);
  $('hourlyRateWrap').classList.toggle('hidden-field',!isTeacher);
  $('fixedSalaryWrap').classList.toggle('hidden-field',isTeacher);
  if(isTeacher)$('fixedSalary').value='';
  updateSalaryHoursVisibility();
}

$('teacherRole').onchange=toggleRoleFields;

function resetTeacher(){
  $('teacherForm').reset();
  $('teacherId').value='';
  renderStaffRoleOptions('معلم');
  $('teacherStart').value=today();
  toggleRoleFields();
}

function openTeacherDialog(title){
  $('teacherDialogTitle').textContent=title;
  if(!$('teacherDialog').open)$('teacherDialog').showModal();
  requestAnimationFrame(()=>$('teacherName').focus());
}

$('addTeacher').onclick=()=>{resetTeacher();openTeacherDialog('إضافة موظف')};
$('cancelTeacher').onclick=()=>$('teacherDialog').close();
$('closeTeacherDialog').onclick=()=>$('teacherDialog').close();
// Clic sur le fond de la fenêtre modale (et non sur son contenu) : fermeture.
$('teacherDialog').onclick=event=>{if(event.target===$('teacherDialog'))$('teacherDialog').close()};
$('teacherDialog').onclose=resetTeacher;

$('teacherForm').onsubmit=async e=>{
  e.preventDefault();
  const payload={
    name:$('teacherName').value,
    role:$('teacherRole').value,
    phone:western($('teacherPhone').value),
    stage:$('teacherStage').value,
    subject:$('teacherSubject').value,
    fixedSalary:western($('fixedSalary').value),
    hourlyRate:western($('hourlyRate').value),
    startDate:$('teacherStart').value,
    notes:$('teacherNotes').value
  };
  try{
    const id=$('teacherId').value;
    if(id){
      // Modifier une fiche existante demande la confirmation du mot de passe.
      if(!(await requirePassword()))return;
      await api(`/teachers/${id}`,{method:'PUT',body:JSON.stringify(payload)});
    }else{
      await api('/teachers',{method:'POST',body:JSON.stringify(payload)});
    }
    await load();
    $('teacherDialog').close();
    renderTeachers();
    renderSalary();
    renderAdvances();
    toast('تم حفظ الموظف.');
  }catch(error){
    toast(error.message);
  }
};

// --- Calcul de l'estimation du mois -----------------------------------------

// Les surcharges servent aux versements déjà enregistrés : un versement garde les
// heures et le taux qui s'appliquaient au moment où il a été payé.
function salaryDue(teacher,month,hoursOverride=null,rateOverride=null){
  if(teacher.role==='أستاذ'){
    const hours=hoursOverride!==null?Number(hoursOverride)||0:latestHours(teacher.id,month);
    const rate=rateOverride!==null?Number(rateOverride)||0:Number(teacher.hourlyRate||0);
    return hours*rate;
  }
  return Number(teacher.fixedSalary||0);
}

function latestHours(id,month){
  const payment=state.data.teacherPayments.find(x=>x.teacherId===id&&x.month===month&&Number(x.hours)>=0);
  return payment?Number(payment.hours||0):0;
}

const monthRows=(rows,teacherId,month)=>rows.filter(x=>Number(x.teacherId)===Number(teacherId)&&x.month===month);

function teacherAdvance(teacherId,month){
  return sumAmount(monthRows(state.data.teacherAdvances,teacherId,month));
}

function teacherPaid(teacherId,month){
  return sumAmount(monthRows(state.data.teacherPayments,teacherId,month));
}

function teacherMonthState(t,m){
  const due=salaryDue(t,m);
  const adv=teacherAdvance(t.id,m);
  const paid=teacherPaid(t.id,m);
  return {due,adv,paid,rem:Math.max(0,due-adv-paid)};
}

// --- Tableau des employés ---------------------------------------------------

function renderTeachers(){
  const rows=state.data.teachers.map(t=>`<tr>
    <td>${esc(t.name)}</td>
    <td>${esc(t.role)}</td>
    <td>${esc(t.stage||'—')}</td>
    <td>${esc(t.subject||'—')}</td>
    <td>${roleNeedsFixed(t.role)?money(t.fixedSalary):'—'}</td>
    <td>${roleNeedsFixed(t.role)?'—':money(t.hourlyRate)}</td>
    <td class="actions"><button class="btn-edit" onclick="editTeacher(${t.id})">تعديل</button><button class="btn-delete" onclick="removeTeacher(${t.id})">حذف</button></td>
  </tr>`).join('');
  $('teachersTable').innerHTML=rows||'<tr><td colspan="7">لا يوجد موظفون مسجلون.</td></tr>';
  renderStaffRoleOptions();
  populateStaffSelects();
  updateSalaryHoursVisibility();
}

// La liste du formulaire de paie se filtre par le champ de recherche et marque
// d'un ✓ les employés déjà soldés pour le mois choisi ; la sélection en cours
// est conservée quand elle reste visible.
function populateStaffSelects(){
  const query=western($('salaryTeacherSearch').value||'').trim().toLowerCase();
  const month=$('salaryMonth').value;
  const previous=$('salaryTeacher').value;
  const visible=state.data.teachers.filter(t=>!query||`${t.name} ${t.role} ${t.phone||''}`.toLowerCase().includes(query));
  $('salaryTeacher').innerHTML=visible.map(t=>{
    const st=month?teacherMonthState(t,month):null;
    const settled=!!st&&st.due>0&&st.rem<=0;
    return `<option value="${t.id}">${settled?'✓ ':''}${esc(t.name)} - ${esc(t.role)}</option>`;
  }).join('');
  if(visible.some(t=>String(t.id)===previous))$('salaryTeacher').value=previous;
  const options=state.data.teachers.map(t=>`<option value="${t.id}">${esc(t.name)} - ${esc(t.role)}</option>`).join('');
  $('advanceTeacher').innerHTML=options;
  updateSalaryHint();
}

window.editTeacher=id=>{
  const t=state.data.teachers.find(x=>x.id===id);
  if(!t)return;
  const fields={
    teacherId:t.id,
    teacherName:t.name,
    teacherRole:t.role,
    teacherPhone:t.phone,
    teacherStage:t.stage,
    teacherSubject:t.subject,
    fixedSalary:t.fixedSalary,
    hourlyRate:t.hourlyRate,
    teacherStart:t.startDate,
    teacherNotes:t.notes
  };
  renderStaffRoleOptions(t.role);
  for(const [fieldId,value] of Object.entries(fields))$(fieldId).value=value??'';
  toggleRoleFields();
  go('staff');
  openTeacherDialog(`تعديل بيانات ${t.name}`);
};

window.removeTeacher=async id=>{
  await deleteWithPassword(`/teachers/${id}`,'هل تريد حذف الموظف وجميع رواتبه وسلفه؟','تم حذف الموظف ورواتبه وسلفه المرتبطة به.');
};

// --- Saisie d'un versement de salaire ------------------------------------------

const selectedSalaryTeacher=()=>state.data?.teachers.find(x=>Number(x.id)===Number($('salaryTeacher').value));

$('salaryTeacher').onchange=()=>{updateSalaryHoursVisibility();updateSalaryHint()};
$('salaryMonth').onchange=()=>{populateStaffSelects();updateSalaryHoursVisibility();updateSalaryHint()};
$('salaryHours').oninput=updateSalaryHint;
$('salaryTeacherSearch').oninput=debounce(()=>{populateStaffSelects();updateSalaryHoursVisibility();updateSalaryHint()},150);
// Le montant est pré-rempli avec le reste du mois tant que le comptable ne l'a
// pas saisi lui-même ; une saisie manuelle n'est plus écrasée.
$('salaryAmount').oninput=()=>{$('salaryAmount').dataset.auto=$('salaryAmount').value?'0':'1'};
function suggestSalaryAmount(remaining){
  const field=$('salaryAmount');
  if(field.dataset.auto==='0')return;
  field.value=remaining>0?String(remaining):'';
}

// Le champ « heures » n'a de sens que pour un أستاذ.
function updateSalaryHoursVisibility(){
  const t=selectedSalaryTeacher();
  const hideHours=!t||roleNeedsFixed(t.role);
  $('salaryHoursWrap').classList.toggle('hidden-field',hideHours);
  if(hideHours)$('salaryHours').value='';
}

function updateSalaryHint(){
  const t=selectedSalaryTeacher();
  if(!t)return;
  const month=$('salaryMonth').value;
  const enteredHours=$('salaryHours').value;
  const due=salaryDue(t,month,enteredHours||null);
  const st=teacherMonthState(t,month);
  const remaining=Math.max(0,due-st.adv-st.paid);
  suggestSalaryAmount(remaining);
  const tail=`السلف: ${money(st.adv)}. المتبقي قبل الدفعة: ${money(remaining)}.`;
  $('salaryDueInfo').textContent=roleNeedsFixed(t.role)
    ? `الراتب الثابت للشهر: ${money(due)}. ${tail}`
    : `الاستحقاق = الساعات × سعر الساعة = ${money(Number(enteredHours||0))} × ${money(t.hourlyRate)} = ${money(due)}. ${tail}`;
}

$('salaryForm').onsubmit=async e=>{
  e.preventDefault();
  const t=state.data.teachers.find(x=>x.id===Number($('salaryTeacher').value));
  if(!t)return;
  const month=$('salaryMonth').value;
  const isTeacher=!roleNeedsFixed(t.role);
  const hours=isTeacher?Number($('salaryHours').value)||0:0;
  const rate=isTeacher?Number(t.hourlyRate||0):0;
  const due=salaryDue(t,month,hours,rate);
  const st=teacherMonthState(t,month);
  const available=Math.max(0,due-st.adv-st.paid);
  const amount=Number($('salaryAmount').value)||0;
  if(amount<=0)return toast('أدخل المبلغ المدفوع.');
  // Une estimation nulle (heures non encore saisies) ne bloque pas la saisie.
  if(due>0&&available<=0){
    // Mois déjà soldé : un versement supplémentaire (prime, rappel) reste possible après confirmation.
    if(!(await askConfirm(`راتب ${t.name} لشهر ${month} مسدَّد بالكامل. هل تريد تسجيل دفعة إضافية؟`)))return;
  }else if(due>0&&amount>available){
    // Le reste disponible est placé dans le champ : plus besoin de le recopier.
    $('salaryAmount').value=String(available);
    $('salaryAmount').dataset.auto='0';
    $('salaryAmount').focus();
    return toast(`المتبقي المتاح هو ${money(available)} وقد وُضع في حقل المبلغ.`);
  }
  try{
    await api('/teacher-payments',{method:'POST',body:JSON.stringify({
      teacherId:t.id,
      month,
      amount,
      date:$('salaryDate').value||today(),
      notes:$('salaryNotes').value,
      hours,
      hourlyRate:rate,
      salaryDue:due
    })});
    await load();
    const nextId=nextUnpaidTeacherId(t.id,month);
    resetSalaryDates();
    $('salaryMonth').value=month;
    renderTeachers();
    if(nextId){$('salaryTeacher').value=String(nextId);updateSalaryHoursVisibility();updateSalaryHint()}
    renderSalary();
    renderAdvances();
    renderDashboard();
    toast('تم تسجيل دفعة الراتب.');
  }catch(error){
    toast(error.message);
  }
};

// --- كشف رواتب الشهر ---------------------------------------------------------
// Une ligne par employé pour le mois choisi : qui a été payé, qui reste, et les
// totaux. Les boutons pré-remplissent les formulaires de paie et d'avance.

let payrollStatusFilter='all';
const PAYROLL_STATUS_LABELS={paid:'مسدَّد',partial:'جزئي',unpaid:'لم يُصرف',hours:'الساعات غير مدخلة',nodue:'بلا راتب محدد'};

function payrollStatusOf(t,st){
  if(st.due<=0&&st.paid<=0&&st.adv<=0)return t.role==='أستاذ'?'hours':'nodue';
  if(st.rem<=0)return 'paid';
  return st.paid>0||st.adv>0?'partial':'unpaid';
}
function monthlyPayroll(month){
  return state.data.teachers.map(t=>{
    const st=teacherMonthState(t,month);
    return {teacher:t,...st,status:payrollStatusOf(t,st)};
  });
}
function payrollFilterMatches(status){
  if(payrollStatusFilter==='all')return true;
  if(payrollStatusFilter==='unpaid')return status==='unpaid'||status==='hours';
  return status===payrollStatusFilter;
}
function renderPayroll(){
  if(!state.data)return;
  const month=$('payrollMonth').value;
  const rows=monthlyPayroll(month);
  const totals=rows.reduce((a,r)=>({due:a.due+r.due,adv:a.adv+r.adv,paid:a.paid+r.paid,rem:a.rem+r.rem}),{due:0,adv:0,paid:0,rem:0});
  const settled=rows.filter(r=>r.status==='paid').length;
  $('payrollSummary').innerHTML=rows.length
    ?`<span>الموظفون: ${money(rows.length)}</span><span>مسدَّد: ${money(settled)}</span><span>إجمالي الاستحقاق: ${money(totals.due)}</span><span>السلف: ${money(totals.adv)}</span><span>المدفوع: ${money(totals.paid)}</span><span class="${totals.rem>0?'overdue-soft':'status-paid'}">المتبقي: ${money(totals.rem)}</span>`
    :'<span class="payroll-summary-empty">لا يوجد موظفون مسجلون.</span>';
  const visible=rows.filter(r=>payrollFilterMatches(r.status));
  $('payrollTable').innerHTML=visible.map(({teacher:t,due,adv,paid,rem,status})=>{
    const actions=[];
    if(status==='hours')actions.push(`<button class="btn-edit" onclick="prefillSalaryForm(${t.id},true)">أدخل الساعات</button>`);
    else if(rem>0)actions.push(`<button class="btn-pay" onclick="prefillSalaryForm(${t.id})">صرف المتبقي</button>`);
    actions.push(`<button class="btn-edit" onclick="prefillAdvanceForm(${t.id})">سلفة</button>`);
    return `<tr data-payroll-status="${status}" data-teacher-id="${t.id}">
      <td>${esc(t.name)}</td>
      <td>${esc(t.role)}</td>
      <td>${status==='hours'?'—':money(due)}</td>
      <td>${money(adv)}</td>
      <td>${money(paid)}</td>
      <td class="${rem>0?'overdue-soft':'status-paid'}">${status==='hours'?'—':money(rem)}</td>
      <td class="payroll-status ${status}">${PAYROLL_STATUS_LABELS[status]}</td>
      <td class="actions">${actions.join('')}</td>
    </tr>`;
  }).join('')||`<tr><td colspan="8">${rows.length?'لا يوجد موظف بهذه الحالة لهذا الشهر.':'لا يوجد موظفون مسجلون.'}</td></tr>`;
  syncFilterButtons('#payrollPanel [data-payroll-status]','payrollStatus',payrollStatusFilter);
}
$('payrollMonth').onchange=renderPayroll;
$('payrollPanel').addEventListener('click',event=>{
  const button=event.target.closest('[data-payroll-status]');
  if(!button||!('payrollStatus' in button.dataset)||button.tagName!=='BUTTON')return;
  payrollStatusFilter=button.dataset.payrollStatus;
  renderPayroll();
});
// « صرف المتبقي » : le formulaire de paie reçoit l'employé, le mois du كشف, les
// heures connues et le reste à payer, puis le curseur se place sur le montant.
window.prefillSalaryForm=(teacherId,focusHours=false)=>{
  const t=state.data.teachers.find(x=>Number(x.id)===Number(teacherId));
  if(!t)return;
  $('salaryTeacherSearch').value='';
  $('salaryMonth').value=$('payrollMonth').value;
  populateStaffSelects();
  $('salaryTeacher').value=String(t.id);
  $('salaryAmount').dataset.auto='1';
  updateSalaryHoursVisibility();
  if(t.role==='أستاذ')$('salaryHours').value=latestHours(t.id,$('salaryMonth').value)||'';
  updateSalaryHint();
  $('salaryForm').scrollIntoView({behavior:'smooth',block:'center'});
  (focusHours&&t.role==='أستاذ'?$('salaryHours'):$('salaryAmount')).focus();
};
window.prefillAdvanceForm=teacherId=>{
  const t=state.data.teachers.find(x=>Number(x.id)===Number(teacherId));
  if(!t)return;
  $('advanceTeacher').value=String(t.id);
  $('advanceMonth').value=$('payrollMonth').value;
  $('advanceForm').scrollIntoView({behavior:'smooth',block:'center'});
  $('advanceAmount').focus();
};

// --- Tableau des versements de salaire ------------------------------------------

function renderSalary(){
  const payments=state.data.teacherPayments.map(p=>{
    const t=state.data.teachers.find(q=>q.id===p.teacherId);
    // Un versement enregistré garde son estimation ; sinon on la recalcule.
    const due=Number(p.salaryDue||salaryDue(t,p.month,p.hours,p.hourlyRate));
    return {p,t,due,adv:teacherAdvance(p.teacherId,p.month)};
  }).sort((a,b)=>b.p.id-a.p.id);

  const rows=payments.map(({p,t,due,adv})=>{
    // Le reste du mois tient compte de tous les versements, pas seulement celui-ci.
    const allPaid=teacherPaid(p.teacherId,p.month);
    const rem=Math.max(0,due-adv-allPaid);
    return `<tr>
      <td>${esc(t?.name||'محذوف')}</td>
      <td>${esc(p.month)}</td>
      <td>${money(due)}</td>
      <td>${money(adv)}</td>
      <td>${money(allPaid)}</td>
      <td class="${rem>0?'overdue-soft':'status-paid'}">${money(rem)}</td>
      <td>${western(p.date)}</td>
      <td class="actions"><button class="btn-edit" onclick="editSalaryPayment(${p.id})">تعديل</button><button class="btn-delete" onclick="deleteSalaryPayment(${p.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('salaryTable').innerHTML=rows||'<tr><td colspan="8">لا توجد دفعات رواتب.</td></tr>';
  renderPayroll();
}

window.editSalaryPayment=id=>{
  const p=state.data.teacherPayments.find(x=>Number(x.id)===Number(id));
  if(!p)return;
  const t=state.data.teachers.find(x=>x.id===p.teacherId);
  if(!t)return;
  $('salaryEditId').value=p.id;
  $('salaryEditIdentity').textContent=`${t.name} — ${t.role}`;
  $('salaryEditMonth').innerHTML=$('salaryMonth').innerHTML;
  $('salaryEditMonth').value=p.month;
  $('salaryEditAmount').value=p.amount;
  $('salaryEditDate').value=p.date||today();
  $('salaryEditHours').value=Number(p.hours||0);
  $('salaryEditNotes').value=p.notes||'';
  $('salaryEditPassword').value='';
  $('salaryEditHoursWrap').classList.toggle('hidden-field',roleNeedsFixed(t.role));
  const dialog=$('salaryEditDialog');
  if(!dialog.open)dialog.showModal();
  $('salaryEditAmount').focus();
};

$('salaryEditForm').onsubmit=async event=>{
  event.preventDefault();
  const id=Number($('salaryEditId').value);
  const p=state.data.teacherPayments.find(x=>Number(x.id)===id);
  const t=p&&state.data.teachers.find(x=>Number(x.id)===Number(p.teacherId));
  if(!p||!t)return;
  const fixed=roleNeedsFixed(t.role);
  const hours=fixed?0:Number($('salaryEditHours').value)||0;
  const hourlyRate=fixed?0:Number(p.hourlyRate||t.hourlyRate||0);
  const salaryDue=fixed?Number(t.fixedSalary||p.salaryDue||0):hours*hourlyRate;
  try{
    await api('/verify-password',{method:'POST',body:JSON.stringify({password:western($('salaryEditPassword').value)})});
    await api(`/teacher-payments/${id}`,{method:'PUT',body:JSON.stringify({
      month:$('salaryEditMonth').value,
      amount:western($('salaryEditAmount').value),
      date:$('salaryEditDate').value,
      notes:$('salaryEditNotes').value,
      hours,
      hourlyRate,
      salaryDue
    })});
    $('salaryEditDialog').close();
    await refreshAll();
    toast('تم تعديل دفعة الراتب.');
  }catch(error){
    $('salaryEditPassword').value='';
    $('salaryEditPassword').focus();
    toast(error.message);
  }
};
$('closeSalaryEdit').onclick=()=>$('salaryEditDialog').close();
$('cancelSalaryEdit').onclick=()=>$('salaryEditDialog').close();
$('salaryEditDialog').onclick=event=>{if(event.target===$('salaryEditDialog'))$('salaryEditDialog').close()};

window.deleteSalaryPayment=async id=>{
  await deleteWithPassword(`/teacher-payments/${id}`,'هل تريد حذف دفعة الراتب؟','تم حذف دفعة الراتب.');
};

function resetSalaryDates(){
  $('salaryForm').reset();
  $('salaryAmount').dataset.auto='1';
  $('salaryMonth').value=currentMonth();
  $('salaryDate').value=today();
  if(state.data)populateStaffSelects();
}
// Après un versement, la liste passe à l'employé suivant qui reste à payer pour
// le mois, dans l'ordre de la liste : « payer tout le monde » s'enchaîne.
function nextUnpaidTeacherId(afterId,month){
  const list=state.data.teachers;
  const start=list.findIndex(t=>Number(t.id)===Number(afterId));
  for(let i=1;i<=list.length;i++){
    const t=list[(start+i)%list.length];
    if(Number(t.id)===Number(afterId))continue;
    const st=teacherMonthState(t,month);
    if(st.rem>0||(t.role==='أستاذ'&&st.due<=0&&st.paid<=0))return t.id;
  }
  return null;
}

// --- Avances ----------------------------------------------------------------

$('advanceForm').onsubmit=async e=>{
  e.preventDefault();
  const t=state.data.teachers.find(x=>x.id===Number($('advanceTeacher').value));
  if(!t)return;
  const month=$('advanceMonth').value;
  let hours=0;
  if(!roleNeedsFixed(t.role)){
    // L'estimation d'un أستاذ dépend des heures ; on les demande avant de valider.
    const enteredHours=await askInput('عدد ساعات الشهر لحساب استحقاق الأستاذ (اختياري):',latestHours(t.id,month)||0);
    if(enteredHours===null)return;
    hours=Number(enteredHours)||0;
  }
  const due=salaryDue(t,month,hours);
  const amount=Number($('advanceAmount').value)||0;
  const available=Math.max(0,due-teacherAdvance(t.id,month)-teacherPaid(t.id,month));
  if(amount<=0)return toast('أدخل مبلغ السلفة.');
  if(due>0&&amount>available)return toast(`السلفة المتاحة لهذا الشهر ${money(available)}.`);
  try{
    await api('/teacher-advances',{method:'POST',body:JSON.stringify({
      teacherId:t.id,
      month,
      amount,
      date:$('advanceDate').value||today(),
      notes:$('advanceNotes').value,
      salaryDue:due
    })});
    await load();
    resetAdvance();
    renderAdvances();
    renderSalary();
    renderDashboard();
    toast('تم تسجيل السلفة.');
  }catch(error){
    toast(error.message);
  }
};

function renderAdvances(){
  const rows=state.data.teacherAdvances.map(a=>{
    const t=state.data.teachers.find(x=>x.id===a.teacherId);
    return `<tr>
      <td>${esc(t?.name||'محذوف')}</td>
      <td>${esc(a.month)}</td>
      <td>${money(a.amount)}</td>
      <td>${western(a.date)}</td>
      <td>${esc(a.notes)}</td>
      <td class="actions"><button class="btn-edit" onclick="editAdvance(${a.id})">تعديل</button><button class="btn-delete" onclick="deleteAdvance(${a.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('advanceTable').innerHTML=rows||'<tr><td colspan="6">لا توجد سلف.</td></tr>';
  renderPayroll();
}

window.editAdvance=async id=>{
  if(!(await requirePassword()))return;
  const a=state.data.teacherAdvances.find(x=>x.id===id);
  if(!a)return;
  const amount=await askInput('مبلغ السلفة الجديد',a.amount);
  if(amount===null)return;
  const date=await askInput('تاريخ السلفة بصيغة YYYY-MM-DD',a.date);
  if(date===null)return;
  const notes=await askInput('ملاحظات',a.notes||'');
  if(notes===null)return;
  try{
    await api(`/teacher-advances/${id}`,{method:'PUT',body:JSON.stringify({
      month:a.month,
      amount:western(amount),
      date,
      notes,
      salaryDue:a.salaryDue
    })});
    await refreshAll();
    toast('تم تعديل السلفة.');
  }catch(error){
    toast(error.message);
  }
};

window.deleteAdvance=async id=>{
  await deleteWithPassword(`/teacher-advances/${id}`,'هل تريد حذف السلفة؟','تم حذف السلفة.');
};

function resetAdvance(){
  $('advanceForm').reset();
  $('advanceMonth').value=currentMonth();
  $('advanceDate').value=today();
  if(state.data)populateStaffSelects();
}
