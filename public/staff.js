// Écran « الموظفون » : fiches du personnel, versements de salaire et avances.
// Deux régimes de rémunération coexistent :
//   - أستاذ    : payé à l'heure, l'estimation dépend des heures du mois ;
//   - les autres : salaire fixe mensuel.
// `roleNeedsFixed` sépare les deux partout dans le fichier.

function roleNeedsFixed(role){return role!=='أستاذ'}
// Le champ « طبيعة العمل » relit la liste des réglages ; la valeur en cours
// (ou le rôle d'une fiche ancienne absent de la liste) est conservée.
// L'écran regroupait كشف الشهر, le registre, la paie et les avances à la suite :
// ils sont présentés un à la fois derrière des onglets, le dernier ouvert retenu.
const staffTabs=createTabs({nav:'#staff .staff-tabs',tabAttr:'staff-tab',panelAttr:'staff-panel',storageKey:'staffTab'});
function showStaffTab(name){staffTabs.show(name)}

function renderStaffRoleOptions(selected){
  const select=$('teacherRole');
  const current=selected??select.value;
  const roles=staffRoleList().slice();
  if(current&&!roles.includes(current))roles.push(current);
  select.innerHTML=roles.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');
  select.value=roles.includes(current)?current:(roles.includes('معلم')?'معلم':roles[0]);
}

// Un mois postérieur au mois en cours de l'année scolaire se saisit après confirmation.
async function confirmFutureMonth(month,what){
  if(months.indexOf(month)<=months.indexOf(currentMonth()))return true;
  return askConfirm(`شهر ${month} لم يحل بعد. هل تريد تسجيل ${what} له مسبقًا؟`);
}
// القاعدة: الراتب لا يُستحق إلا في اليوم الأخير من الشهر (`fees.js`). Le كشف et
// le formulaire de paie s'y réfèrent ; avant cette date seule une سلفة est possible.
const schoolStartYear=()=>startYearOf(state.settings?.schoolYear);
const salaryDueDateOf=month=>salaryDueDate(month,schoolStartYear());
const salaryEarned=(month,date=today())=>salaryEarnedOn(month,schoolStartYear(),date);
function rejectUnearnedSalary(month,date,focusId){
  if(salaryEarned(month,date))return false;
  toast(`راتب شهر ${month} لا يُستحق إلا في اليوم الأخير من الشهر (${western(salaryDueDateOf(month))})؛ قبل ذلك سجّل سلفة.`);
  $(focusId).focus();
  return true;
}
const salaryReceiptNo=p=>p?.receiptNo||`S-${String(p?.id||0).padStart(6,'0')}`;
const advanceReceiptNo=a=>a?.receiptNo||`A-${String(a?.id||0).padStart(6,'0')}`;

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
function toggleTeacherStatusFields(){
  const stopped=$('teacherStatus').value==='stopped';
  $('teacherEndDateWrap').classList.toggle('hidden-field',!stopped);
  if(!stopped)$('teacherEndDate').value='';
  else if(!$('teacherEndDate').value)$('teacherEndDate').value=today();
}
$('teacherStatus').onchange=toggleTeacherStatusFields;
const isActiveTeacher=t=>(t.status||'active')!=='stopped';
// Only employees still in service are proposed for payments and advances.
const activeTeachers=()=>state.data.teachers.filter(isActiveTeacher);
// Recherche partagée par le registre, le كشف, la paie et les avances : le nom,
// طبيعة العمل ou le téléphone (chiffres arabes acceptés) suffisent.
const teacherQuery=id=>western($(id).value||'').trim().toLowerCase();
const teacherMatches=(t,query)=>!query||`${t.name} ${t.role} ${western(t.phone||'')}`.toLowerCase().includes(query);

function resetTeacher(){
  clearFormErrors($('teacherForm'));
  $('teacherForm').reset();
  $('teacherId').value='';
  renderStaffRoleOptions('معلم');
  $('teacherStart').value=today();
  $('teacherStatus').value='active';
  toggleTeacherStatusFields();
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

// Contrôles de la fiche employé, repris de `addTeacher` (db.js), signalés
// champ par champ avant l'envoi (helpers de core.js).
function teacherFieldErrors(payload){
  const errors={};
  if(!payload.name.trim())errors.teacherName='اسم الموظف مطلوب.';
  if(!payload.role)errors.teacherRole='اختر طبيعة العمل من القائمة المحددة في الإعدادات.';
  if(payload.phone.trim()&&!/^\d{8}$/.test(payload.phone.trim()))errors.teacherPhone='الهاتف يجب أن يتكون من 8 أرقام.';
  if(payload.role==='أستاذ'){
    if(payload.hourlyRate!==''&&!(Number(payload.hourlyRate)>=0))errors.hourlyRate='أدخل سعر ساعة صحيحًا لا يقل عن صفر.';
  }else if(payload.fixedSalary!==''&&!(Number(payload.fixedSalary)>=0))errors.fixedSalary='أدخل راتبًا شهريًا صحيحًا لا يقل عن صفر.';
  for(const id of ['teacherStart','teacherEndDate'])if(dateFieldState(id)==='partial')errors[id]='أكمل التاريخ: اليوم والشهر والسنة.';
  if(!errors.teacherStart&&!payload.startDate)errors.teacherStart='تاريخ التوظيف مطلوب.';
  if(payload.status==='stopped'&&!errors.teacherEndDate){
    if(!payload.endDate)errors.teacherEndDate='حدد تاريخ نهاية الخدمة عند إيقاف الموظف.';
    else if(payload.startDate&&payload.endDate<payload.startDate)errors.teacherEndDate='تاريخ نهاية الخدمة يجب أن يكون بعد تاريخ التوظيف.';
  }
  return errors;
}
const TEACHER_SERVER_ERROR_FIELDS=[['اسم الموظف','teacherName'],['طبيعة العمل','teacherRole'],['الهاتف','teacherPhone'],['نهاية الخدمة','teacherEndDate']];
clearFieldErrorOnEdit($('teacherForm'));
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
    status:$('teacherStatus').value,
    endDate:$('teacherEndDate').value,
    notes:$('teacherNotes').value
  };
  const errors=teacherFieldErrors(payload);
  if(Object.keys(errors).length){
    showFormErrors($('teacherForm'),errors);
    return toast(`صحّح الحقول المحددة باللون الأحمر: ${Object.values(errors)[0]}`);
  }
  clearFormErrors($('teacherForm'));
  // Un salaire ou un taux à zéro donne une estimation nulle : on le signale avant d'enregistrer.
  if(payload.role==='أستاذ'&&!(Number(payload.hourlyRate)>0)){
    if(!(await askConfirm('سعر الساعة غير محدد (0). سيكون استحقاق الأستاذ صفرًا حتى يُضبط. هل تريد الحفظ على هذا النحو؟')))return;
  }else if(payload.role!=='أستاذ'&&!(Number(payload.fixedSalary)>0)){
    if(!(await askConfirm('الراتب الشهري الثابت غير محدد (0). لن يُحسب استحقاق شهري لهذا الموظف. هل تريد الحفظ على هذا النحو؟')))return;
  }
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
    const field=serverErrorField(error.message,TEACHER_SERVER_ERROR_FIELDS);
    if(field)showFormErrors($('teacherForm'),{[field]:error.message});
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

// Le registre se filtre par nom/téléphone, طبيعة العمل et statut ; le filtre
// de statut montre les actifs par défaut pour que les anciens n'encombrent pas.
function renderTeacherRoleFilter(){
  const select=$('teacherRoleFilter'),current=select.value;
  select.innerHTML='<option value="">الكل</option>'+staffRoleList().map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');
  select.value=[...select.options].some(o=>o.value===current)?current:'';
}
function lastPaymentOf(teacherId){
  return state.data.teacherPayments.filter(p=>Number(p.teacherId)===Number(teacherId)).sort((a,b)=>Number(b.id)-Number(a.id))[0]||null;
}
function filteredTeachers(){
  const query=teacherQuery('teacherSearch');
  const role=$('teacherRoleFilter').value,status=$('teacherStatusFilter').value;
  return state.data.teachers.filter(t=>(!role||t.role===role)
    &&(!status||(t.status||'active')===status)
    &&teacherMatches(t,query));
}
$('teacherSearch').oninput=debounce(renderTeachers,150);
$('teacherRoleFilter').onchange=renderTeachers;
$('teacherStatusFilter').onchange=renderTeachers;
function renderTeachers(){
  staffTabs.show();
  if(!state.data)return;
  renderTeacherRoleFilter();
  const list=filteredTeachers();
  const fixedTotal=list.filter(t=>roleNeedsFixed(t.role)&&isActiveTeacher(t)).reduce((sum,t)=>sum+Number(t.fixedSalary||0),0);
  $('teacherCount').innerHTML=`<span>عدد الموظفين المعروضين: ${money(list.length)} من ${money(state.data.teachers.length)}</span><span>النشطون: ${money(activeTeachers().length)}</span><span>مجموع الرواتب الثابتة الشهرية (المعروضون النشطون): ${money(fixedTotal)}</span>`;
  const rows=list.map(t=>{
    const last=lastPaymentOf(t.id);
    return `<tr class="${isActiveTeacher(t)?'':'staff-row-stopped'}">
    <td>${esc(t.name)}</td>
    <td>${esc(t.role)}</td>
    <td class="${isActiveTeacher(t)?'status-paid':'staff-status-stopped'}">${isActiveTeacher(t)?'نشط':`متوقف${t.endDate?` منذ ${western(t.endDate)}`:''}`}</td>
    <td>${esc(t.stage||'—')}</td>
    <td>${esc(t.subject||'—')}</td>
    <td>${roleNeedsFixed(t.role)?money(t.fixedSalary):'—'}</td>
    <td>${roleNeedsFixed(t.role)?'—':money(t.hourlyRate)}</td>
    <td>${esc(western(t.phone||'—'))}</td>
    <td>${last?`${esc(last.month)} — ${esc(western(last.date))}`:'—'}</td>
    <td class="actions"><button class="btn-edit" onclick="editTeacher(${t.id})">تعديل</button><button class="btn-delete" onclick="removeTeacher(${t.id})">حذف</button></td>
  </tr>`;
  }).join('');
  $('teachersTable').innerHTML=rows||`<tr><td colspan="10">${state.data.teachers.length?'لا يوجد موظف مطابق للتصفية.':'لا يوجد موظفون مسجلون.'}</td></tr>`;
  renderStaffRoleOptions();
  populateStaffSelects();
  updateSalaryHoursVisibility();
}

// Les listes des formulaires de paie et d'avance se filtrent par leur champ de
// recherche (nom, طبيعة العمل ou téléphone) ; la paie marque d'un ✓ les employés
// déjà soldés pour le mois choisi ; la sélection en cours est conservée quand
// elle reste visible.
function populateStaffSelects(){
  const query=teacherQuery('salaryTeacherSearch');
  const month=$('salaryMonth').value;
  const previous=$('salaryTeacher').value;
  const visible=activeTeachers().filter(t=>teacherMatches(t,query));
  $('salaryTeacher').innerHTML=visible.map(t=>{
    const st=month?teacherMonthState(t,month):null;
    const settled=!!st&&st.due>0&&st.rem<=0;
    return `<option value="${t.id}">${settled?'✓ ':''}${esc(t.name)} - ${esc(t.role)}</option>`;
  }).join('');
  if(visible.some(t=>String(t.id)===previous))$('salaryTeacher').value=previous;
  const advancePrevious=$('advanceTeacher').value;
  const advanceVisible=activeTeachers().filter(t=>teacherMatches(t,teacherQuery('advanceTeacherSearch')));
  $('advanceTeacher').innerHTML=advanceVisible.map(t=>`<option value="${t.id}">${esc(t.name)} - ${esc(t.role)}</option>`).join('');
  if(advanceVisible.some(t=>String(t.id)===advancePrevious))$('advanceTeacher').value=advancePrevious;
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
    teacherStatus:t.status||'active',
    teacherEndDate:t.endDate,
    teacherNotes:t.notes
  };
  renderStaffRoleOptions(t.role);
  for(const [fieldId,value] of Object.entries(fields))$(fieldId).value=value??'';
  toggleTeacherStatusFields();
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
$('salaryDate').onchange=updateSalaryHint;
$('salaryHours').oninput=updateSalaryHint;
$('salaryForm').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();resetSalaryDates();updateSalaryHoursVisibility();updateSalaryHint()}});
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

// Aucun employé sélectionné (recherche sans résultat, liste vide) : le rappel
// le dit clairement au lieu de garder les montants du dernier employé affiché.
function missingSalaryTeacherText(){
  const query=$('salaryTeacherSearch').value.trim();
  if(query)return `⚠️ لا يوجد موظف مطابق للبحث «${query}». امسح حقل البحث أو اكتب اسم الموظف أو رقم هاتفه.`;
  return activeTeachers().length?'⚠️ اختر الموظف من القائمة.':'⚠️ لا يوجد موظفون نشطون؛ أضف موظفًا أولًا.';
}
function updateSalaryHint(){
  const t=selectedSalaryTeacher();
  if(!t){$('salaryDueInfo').textContent=missingSalaryTeacherText();return}
  const month=$('salaryMonth').value;
  const enteredHours=$('salaryHours').value;
  const due=salaryDue(t,month,enteredHours||null);
  const st=teacherMonthState(t,month);
  const remaining=Math.max(0,due-st.adv-st.paid);
  suggestSalaryAmount(remaining);
  const advances=monthRows(state.data.teacherAdvances,t.id,month);
  const advanceText=advances.length
    ?`تُخصم السلف: ${advances.map(a=>`${money(a.amount)} (${western(a.date)})`).join('، ')} = ${money(st.adv)}.`
    :'لا توجد سلف لهذا الشهر.';
  const dueDate=western(salaryDueDateOf(month));
  const earned=salaryEarned(month,$('salaryDate').value||today());
  const dueText=earned?`تاريخ الاستحقاق: ${dueDate}.`:`⚠️ لم يحل موعد الاستحقاق بعد (اليوم الأخير من الشهر: ${dueDate})؛ قبل ذلك تُسجَّل سلفة.`;
  const tail=`${advanceText} المتبقي قبل الدفعة: ${money(remaining)}. ${dueText}`;
  $('salaryDueInfo').textContent=roleNeedsFixed(t.role)
    ? `الراتب الثابت للشهر: ${money(due)}. ${tail}`
    : `الاستحقاق = الساعات × سعر الساعة = ${money(Number(enteredHours||0))} × ${money(t.hourlyRate)} = ${money(due)}. ${tail}`;
}

$('salaryForm').onsubmit=async e=>{
  e.preventDefault();
  const t=selectedSalaryTeacher();
  // Validation en JavaScript (novalidate) : un message lisible plutôt que la bulle du navigateur.
  if(!t){toast(missingSalaryTeacherText());$($('salaryTeacherSearch').value.trim()?'salaryTeacherSearch':'salaryTeacher').focus();return}
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
  if(rejectUnearnedSalary(month,$('salaryDate').value||today(),'salaryDate'))return;
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
const PAYROLL_STATUS_LABELS={paid:'مسدَّد',partial:'جزئي',unpaid:'لم يُصرف',pending:'لم يحل بعد',hours:'الساعات غير مدخلة',nodue:'بلا راتب محدد'};

// Un mois dont le dernier jour n'est pas passé n'est pas « لم يُصرف » mais
// « لم يحل بعد » : rien n'est dû, seules les avances sont possibles.
function payrollStatusOf(t,st,earned=true){
  if(!earned&&!(st.due>0&&st.rem<=0))return 'pending';
  if(st.due<=0&&st.paid<=0&&st.adv<=0)return t.role==='أستاذ'?'hours':'nodue';
  if(st.rem<=0)return 'paid';
  return st.paid>0||st.adv>0?'partial':'unpaid';
}
function monthlyPayroll(month){
  const earned=salaryEarned(month);
  return activeTeachers().map(t=>{
    const st=teacherMonthState(t,month);
    return {teacher:t,...st,status:payrollStatusOf(t,st,earned)};
  });
}
function payrollFilterMatches(status){
  if(payrollStatusFilter==='all')return true;
  if(payrollStatusFilter==='unpaid')return status==='unpaid'||status==='hours'||status==='pending';
  return status===payrollStatusFilter;
}
let payrollVisibleRows=[];
function renderPayroll(){
  if(!state.data)return;
  const month=$('payrollMonth').value;
  const rows=monthlyPayroll(month);
  const totals=rows.reduce((a,r)=>({due:a.due+r.due,adv:a.adv+r.adv,paid:a.paid+r.paid,rem:a.rem+r.rem}),{due:0,adv:0,paid:0,rem:0});
  const settled=rows.filter(r=>r.status==='paid').length;
  const dueNote=salaryEarned(month)?'':`<span class="payroll-pending-note">⚠️ لم يحل موعد الاستحقاق بعد: ${western(salaryDueDateOf(month))}</span>`;
  $('payrollSummary').innerHTML=rows.length
    ?`${dueNote}<span>الموظفون: ${money(rows.length)}</span><span>مسدَّد: ${money(settled)}</span><span>إجمالي الاستحقاق: ${money(totals.due)}</span><span>السلف: ${money(totals.adv)}</span><span>المدفوع: ${money(totals.paid)}</span><span class="${totals.rem>0?'overdue-soft':'status-paid'}">المتبقي: ${money(totals.rem)}</span>`
    :'<span class="payroll-summary-empty">لا يوجد موظفون مسجلون.</span>';
  const query=teacherQuery('payrollSearch');
  const visible=rows.filter(r=>payrollFilterMatches(r.status)&&teacherMatches(r.teacher,query));
  payrollVisibleRows=visible;
  $('payrollTable').innerHTML=visible.map(({teacher:t,due,adv,paid,rem,status})=>{
    const actions=[];
    if(status==='pending');// الراتب لم يُستحق بعد : لا صرف قبل اليوم الأخير من الشهر.
    else if(status==='hours')actions.push(`<button class="btn-edit" onclick="prefillSalaryForm(${t.id},true)">أدخل الساعات</button>`);
    else if(rem>0)actions.push(`<button class="btn-pay" onclick="prefillSalaryForm(${t.id})">صرف المتبقي</button>`);
    actions.push(`<button class="btn-edit" onclick="prefillAdvanceForm(${t.id})">سلفة</button>`);
    return `<tr data-payroll-status="${status}" data-teacher-id="${t.id}">
      <td>${esc(t.name)}</td>
      <td>${esc(western(t.phone||'—'))}</td>
      <td>${esc(t.role)}</td>
      <td>${status==='hours'?'—':money(due)}</td>
      <td>${money(adv)}</td>
      <td>${money(paid)}</td>
      <td class="${rem>0?'overdue-soft':'status-paid'}">${status==='hours'?'—':money(rem)}</td>
      <td class="payroll-status ${status}">${PAYROLL_STATUS_LABELS[status]}</td>
      <td class="actions">${actions.join('')}</td>
    </tr>`;
  }).join('')||`<tr><td colspan="9">${!rows.length?'لا يوجد موظفون مسجلون.':query?`لا يوجد موظف مطابق للبحث «${esc($('payrollSearch').value.trim())}».`:'لا يوجد موظف بهذه الحالة لهذا الشهر.'}</td></tr>`;
  syncFilterButtons('#payrollPanel [data-payroll-status]','payrollStatus',payrollStatusFilter);
}
$('payrollMonth').onchange=renderPayroll;
// Les exports Excel du personnel passent par la boîte commune de choix des
// colonnes (core.js) et suivent la liste affichée, filtres compris.
const PAYROLL_EXPORT_COLUMNS=[
  {key:'name',label:'الموظف',value:r=>r.teacher.name||''},
  {key:'phone',label:'الهاتف',value:r=>western(r.teacher.phone||'')},
  {key:'role',label:'طبيعة العمل',value:r=>r.teacher.role||''},
  {key:'month',label:'الشهر',value:()=>$('payrollMonth').value},
  {key:'due',label:'الاستحقاق',value:r=>r.status==='hours'?'':Number(r.due||0)},
  {key:'adv',label:'السلف',value:r=>Number(r.adv||0)},
  {key:'paid',label:'المدفوع',value:r=>Number(r.paid||0)},
  {key:'rem',label:'المتبقي',value:r=>r.status==='hours'?'':Number(r.rem||0)},
  {key:'status',label:'الحالة',value:r=>PAYROLL_STATUS_LABELS[r.status]||''}
];
$('exportPayroll').onclick=()=>openColumnExport({
  storageKey:'payrollExportColumns',columns:PAYROLL_EXPORT_COLUMNS,rows:payrollVisibleRows,
  title:'كشف رواتب الشهر',unit:'موظف',filename:`كشف رواتب ${$('payrollMonth').value}`,sheetName:'كشف الرواتب'
});
const TEACHER_EXPORT_COLUMNS=[
  {key:'name',label:'الموظف',value:t=>t.name||''},
  {key:'role',label:'طبيعة العمل',value:t=>t.role||''},
  {key:'status',label:'الحالة',value:t=>isActiveTeacher(t)?'نشط':'متوقف'},
  {key:'endDate',label:'تاريخ التوقف',value:t=>isActiveTeacher(t)?'':(t.endDate||'')},
  {key:'stage',label:'المرحلة',value:t=>t.stage||''},
  {key:'subject',label:'المادة',value:t=>t.subject||''},
  {key:'fixedSalary',label:'الثابت',value:t=>roleNeedsFixed(t.role)?Number(t.fixedSalary||0):''},
  {key:'hourlyRate',label:'سعر الساعة',value:t=>roleNeedsFixed(t.role)?'':Number(t.hourlyRate||0)},
  {key:'phone',label:'الهاتف',value:t=>western(t.phone||'')},
  {key:'lastPayment',label:'آخر دفعة',value:t=>{const last=lastPaymentOf(t.id);return last?`${last.month} — ${western(last.date)}`:''}}
];
$('exportTeachers').onclick=()=>openColumnExport({
  storageKey:'teacherExportColumns',columns:TEACHER_EXPORT_COLUMNS,rows:filteredTeachers(),
  title:'سجل الموظفين',unit:'موظف',filename:'سجل الموظفين',sheetName:'الموظفون'
});
$('payrollSearch').oninput=debounce(renderPayroll,150);
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
  showStaffTab('salaries');
  $('salaryForm').scrollIntoView({behavior:'smooth',block:'center'});
  (focusHours&&t.role==='أستاذ'?$('salaryHours'):$('salaryAmount')).focus();
};
window.prefillAdvanceForm=teacherId=>{
  const t=state.data.teachers.find(x=>Number(x.id)===Number(teacherId));
  if(!t)return;
  $('advanceTeacherSearch').value='';
  populateStaffSelects();
  $('advanceTeacher').value=String(t.id);
  $('advanceMonth').value=$('payrollMonth').value;
  updateAdvanceHint();
  showStaffTab('advances');
  $('advanceForm').scrollIntoView({behavior:'smooth',block:'center'});
  $('advanceAmount').focus();
};

// --- Impressions : reçus de salaire, d'avance et كشف du mois -------------------

function staffReceiptHtml({title,number,record,teacher,lines,amountLabel,amount}){
  const school=state.settings?.schoolName||'';
  const line=(label,value)=>`<div class="row"><span class="label">${label}</span><span>${value}</span></div>`;
  return `<div class="receipt">`
    +`<div class="center title">${TEST_MODE_LABEL}</div>`
    +`<div class="center school">${esc(school)}</div>`
    +`<div class="center small">السنة الدراسية: ${esc(state.settings?.schoolYear||'')}</div>`
    +`<div class="line"></div>`
    +`<div class="center title">${title}</div>`
    +line('رقم الإيصال',esc(number))
    +line('التاريخ',dateTime(record)||western(today()))
    +`<div class="line"></div>`
    +line('الموظف',esc(teacher?.name||'محذوف'))
    +line('طبيعة العمل',esc(teacher?.role||''))
    +line('الشهر',esc(record.month))
    +`<div class="line"></div>`
    +lines.map(([label,value,cls])=>`<div class="row ${cls||''}"><span class="label">${label}</span><span>${value}</span></div>`).join('')
    +`<div class="row amount"><span>${amountLabel}</span><span>${money(amount)} أوقية</span></div>`
    +(record.notes?line('ملاحظات',esc(record.notes)):'')
    +`<div class="line"></div>`
    +`<div class="signature">توقيع المحاسب: __________________</div>`
    +`<div class="signature">توقيع المستلم: __________________</div>`
    +`<button class="print" onclick="window.print()">طباعة الإيصال</button>`
    +`</div>`;
}
function openStaffReceipt(title,body){
  printWindow({title,style:RECEIPT_STYLE,body,width:420,height:700,blockedMessage:'اسمح للنوافذ المنبثقة حتى يتم فتح الإيصال.',autoPrint:true});
}
window.printSalaryReceipt=id=>{
  const p=state.data.teacherPayments.find(x=>Number(x.id)===Number(id));
  if(!p)return;
  const t=state.data.teachers.find(x=>Number(x.id)===Number(p.teacherId));
  const due=Number(p.salaryDue||(t?salaryDue(t,p.month,p.hours,p.hourlyRate):0));
  const adv=teacherAdvance(p.teacherId,p.month);
  const paid=teacherPaid(p.teacherId,p.month);
  const lines=[];
  if(t&&t.role==='أستاذ')lines.push(['الساعات × سعر الساعة',`${money(Number(p.hours||0))} × ${money(Number(p.hourlyRate||0))}`]);
  lines.push(['استحقاق الشهر',`${money(due)} أوقية`]);
  lines.push(['السلف المخصومة',`${money(adv)} أوقية`]);
  lines.push(['إجمالي المدفوع لهذا الشهر',`${money(paid)} أوقية`]);
  lines.push(['المتبقي بعد هذه الدفعة',`${money(Math.max(0,due-adv-paid))} أوقية`,'remaining']);
  openStaffReceipt(salaryReceiptNo(p),staffReceiptHtml({title:'إيصال صرف راتب',number:salaryReceiptNo(p),record:p,teacher:t,lines,amountLabel:'المبلغ المستلم',amount:p.amount}));
};
window.printAdvanceReceipt=id=>{
  const a=state.data.teacherAdvances.find(x=>Number(x.id)===Number(id));
  if(!a)return;
  const t=state.data.teachers.find(x=>Number(x.id)===Number(a.teacherId));
  const due=Number(a.salaryDue||(t?salaryDue(t,a.month):0));
  const lines=[['استحقاق الشهر',`${money(due)} أوقية`],['إجمالي سلف الشهر',`${money(teacherAdvance(a.teacherId,a.month))} أوقية`,'remaining']];
  openStaffReceipt(advanceReceiptNo(a),staffReceiptHtml({title:'إيصال سلفة على الراتب',number:advanceReceiptNo(a),record:a,teacher:t,lines,amountLabel:'مبلغ السلفة',amount:a.amount}));
};
// Le كشف du mois s'imprime en une page A4 avec une colonne de signature par employé.
$('printPayroll').onclick=()=>{
  if(!state.data)return;
  const month=$('payrollMonth').value;
  const rows=monthlyPayroll(month);
  const totals=rows.reduce((a,r)=>({due:a.due+r.due,adv:a.adv+r.adv,paid:a.paid+r.paid,rem:a.rem+r.rem}),{due:0,adv:0,paid:0,rem:0});
  const body=`<table><thead><tr><th>#</th><th>الموظف</th><th>طبيعة العمل</th><th>الاستحقاق</th><th>السلف</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>التوقيع</th></tr></thead><tbody>`
    +rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.teacher.name)}</td><td>${esc(r.teacher.role)}</td><td>${money(r.due)}</td><td>${money(r.adv)}</td><td>${money(r.paid)}</td><td>${money(r.rem)}</td><td>${PAYROLL_STATUS_LABELS[r.status]}</td><td style="min-width:120px"></td></tr>`).join('')
    +`<tr class="total"><td></td><td colspan="2">الإجمالي</td><td>${money(totals.due)}</td><td>${money(totals.adv)}</td><td>${money(totals.paid)}</td><td>${money(totals.rem)}</td><td colspan="2"></td></tr>`
    +`</tbody></table>`
    +`<p style="margin-top:28px">المحاسب: __________________ &nbsp;&nbsp;&nbsp;&nbsp; المدير: __________________</p>`;
  openPrintWindow(`كشف رواتب شهر ${month}`,body);
};

// --- Filtres des journaux (rواتب et سلف) ----------------------------------------
// Employé, mois et plage de dates ; les listes gardent leur sélection au rendu.
function renderLogFilters(prefix){
  const teacherSelect=$(`${prefix}Teacher`),monthSelect=$(`${prefix}Month`);
  const teacherValue=teacherSelect.value,monthValue=monthSelect.value;
  teacherSelect.innerHTML='<option value="">الكل</option>'+state.data.teachers.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
  teacherSelect.value=[...teacherSelect.options].some(o=>o.value===teacherValue)?teacherValue:'';
  if(monthSelect.options.length<=1)monthSelect.innerHTML='<option value="">كل الأشهر</option>'+months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  monthSelect.value=monthValue;
}
function logFilterMatches(prefix,record){
  const teacher=$(`${prefix}Teacher`).value,month=$(`${prefix}Month`).value,from=$(`${prefix}From`).value,to=$(`${prefix}To`).value;
  return (!teacher||Number(record.teacherId)===Number(teacher))
    &&(!month||record.month===month)
    &&(!from||String(record.date||'')>=from)&&(!to||String(record.date||'')<=to);
}
for(const prefix of ['salaryLog','advanceLog']){
  const rerender=prefix==='salaryLog'?()=>renderSalary():()=>renderAdvances();
  for(const suffix of ['Teacher','Month','From','To'])$(`${prefix}${suffix}`).onchange=rerender;
}

// --- Tableau des versements de salaire ------------------------------------------

let salaryLogRows=[];
function renderSalary(){
  if(!state.data)return;
  renderLogFilters('salaryLog');
  const payments=state.data.teacherPayments.filter(p=>logFilterMatches('salaryLog',p)).map(p=>{
    const t=state.data.teachers.find(q=>q.id===p.teacherId);
    // Un versement enregistré garde son estimation ; sinon on la recalcule.
    const due=Number(p.salaryDue||salaryDue(t,p.month,p.hours,p.hourlyRate));
    return {p,t,due,adv:teacherAdvance(p.teacherId,p.month)};
  }).sort((a,b)=>b.p.id-a.p.id);

  salaryLogRows=payments.map(({p,t,due,adv})=>({p,t,due,adv,allPaid:teacherPaid(p.teacherId,p.month),rem:Math.max(0,due-adv-teacherPaid(p.teacherId,p.month))}));
  $('salaryLogTotals').innerHTML=`<span>عدد الدفعات المعروضة: ${money(payments.length)}</span><span>إجمالي المدفوع المعروض: ${money(sumAmount(payments.map(x=>x.p)))} أوقية</span>`;
  const rows=salaryLogRows.map(({p,t,due,adv,allPaid,rem})=>{
    // Le reste du mois tient compte de tous les versements, pas seulement celui-ci.
    return `<tr>
      <td>${esc(salaryReceiptNo(p))}</td>
      <td>${esc(t?.name||'محذوف')}</td>
      <td>${esc(western(t?.phone||'—'))}</td>
      <td>${esc(p.month)}</td>
      <td>${money(due)}</td>
      <td>${money(adv)}</td>
      <td>${money(allPaid)}</td>
      <td class="${rem>0?'overdue-soft':'status-paid'}">${money(rem)}</td>
      <td>${esc(dateTime(p))}</td>
      <td class="actions"><button class="btn-pay" onclick="printSalaryReceipt(${p.id})">إيصال</button><button class="btn-edit" onclick="editSalaryPayment(${p.id})">تعديل</button><button class="btn-delete" onclick="deleteSalaryPayment(${p.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('salaryTable').innerHTML=rows||`<tr><td colspan="10">${state.data.teacherPayments.length?'لا توجد دفعات مطابقة للتصفية.':'لا توجد دفعات رواتب.'}</td></tr>`;
  renderPayroll();
}
const SALARY_EXPORT_COLUMNS=[
  {key:'receiptNo',label:'رقم الإيصال',value:r=>salaryReceiptNo(r.p)},
  {key:'name',label:'الموظف',value:r=>r.t?.name||'محذوف'},
  {key:'phone',label:'الهاتف',value:r=>western(r.t?.phone||'')},
  {key:'role',label:'طبيعة العمل',value:r=>r.t?.role||''},
  {key:'month',label:'الشهر',value:r=>r.p.month},
  {key:'due',label:'الاستحقاق',value:r=>r.due},
  {key:'adv',label:'السلف',value:r=>r.adv},
  {key:'amount',label:'المدفوع (هذه الدفعة)',value:r=>Number(r.p.amount||0)},
  {key:'allPaid',label:'إجمالي المدفوع للشهر',value:r=>r.allPaid},
  {key:'rem',label:'المتبقي',value:r=>r.rem},
  {key:'date',label:'التاريخ',value:r=>r.p.date||''},
  {key:'time',label:'الساعة',value:r=>r.p.time||''},
  {key:'hours',label:'الساعات',value:r=>Number(r.p.hours||0)},
  {key:'hourlyRate',label:'سعر الساعة',value:r=>Number(r.p.hourlyRate||0)},
  {key:'notes',label:'ملاحظات',value:r=>r.p.notes||''}
];
$('exportSalaryLog').onclick=()=>openColumnExport({
  storageKey:'salaryExportColumns',columns:SALARY_EXPORT_COLUMNS,rows:salaryLogRows,
  title:'سجل دفعات الرواتب',unit:'دفعة',filename:'دفعات الرواتب',sheetName:'دفعات الرواتب'
});

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
  if(rejectUnearnedSalary($('salaryEditMonth').value,$('salaryEditDate').value||p.date,'salaryEditDate'))return;
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
  const list=activeTeachers();
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

const selectedAdvanceTeacher=()=>state.data?.teachers.find(x=>Number(x.id)===Number($('advanceTeacher').value));
// L'estimation d'un أستاذ dépend des heures : le champ apparaît dans le
// formulaire même, comme pour la paie, au lieu d'une fenêtre séparée.
function missingAdvanceTeacherText(){
  const query=$('advanceTeacherSearch').value.trim();
  if(query)return `⚠️ لا يوجد موظف مطابق للبحث «${query}». امسح حقل البحث أو اكتب اسم الموظف أو رقم هاتفه.`;
  return activeTeachers().length?'':'⚠️ لا يوجد موظفون نشطون؛ أضف موظفًا أولًا.';
}
function updateAdvanceHint(){
  const t=selectedAdvanceTeacher();
  if(!t){$('advanceDueInfo').textContent=missingAdvanceTeacherText();return}
  const month=$('advanceMonth').value;
  const hourly=!roleNeedsFixed(t.role);
  $('advanceHoursWrap').classList.toggle('hidden-field',!hourly);
  if(!hourly)$('advanceHours').value='';
  else if(!$('advanceHours').value&&latestHours(t.id,month))$('advanceHours').value=String(latestHours(t.id,month));
  const due=salaryDue(t,month,hourly?($('advanceHours').value||null):null);
  const available=Math.max(0,due-teacherAdvance(t.id,month)-teacherPaid(t.id,month));
  $('advanceDueInfo').textContent=hourly
    ?`الاستحقاق = ${money(Number($('advanceHours').value||0))} × ${money(t.hourlyRate)} = ${money(due)}. السلف السابقة: ${money(teacherAdvance(t.id,month))}. المدفوع: ${money(teacherPaid(t.id,month))}. المتاح للسلفة: ${money(available)}.`
    :`الراتب الثابت: ${money(due)}. السلف السابقة: ${money(teacherAdvance(t.id,month))}. المدفوع: ${money(teacherPaid(t.id,month))}. المتاح للسلفة: ${money(available)}.`;
}
$('advanceTeacher').onchange=updateAdvanceHint;
$('advanceTeacherSearch').oninput=debounce(()=>{populateStaffSelects();updateAdvanceHint()},150);
$('advanceMonth').onchange=updateAdvanceHint;
$('advanceHours').oninput=updateAdvanceHint;
$('advanceForm').onsubmit=async e=>{
  e.preventDefault();
  const t=state.data.teachers.find(x=>x.id===Number($('advanceTeacher').value));
  if(!t){toast(missingAdvanceTeacherText()||'⚠️ اختر الموظف من القائمة.');$($('advanceTeacherSearch').value.trim()?'advanceTeacherSearch':'advanceTeacher').focus();return}
  const month=$('advanceMonth').value;
  const hours=roleNeedsFixed(t.role)?0:Number($('advanceHours').value)||0;
  const due=salaryDue(t,month,hours);
  const amount=Number($('advanceAmount').value)||0;
  const available=Math.max(0,due-teacherAdvance(t.id,month)-teacherPaid(t.id,month));
  if(amount<=0)return toast('أدخل مبلغ السلفة.');
  if(!(await confirmFutureMonth(month,'سلفة')))return;
  if(due>0&&amount>available){
    $('advanceAmount').value=available>0?String(available):'';
    $('advanceAmount').focus();
    return toast(available>0?`السلفة المتاحة لهذا الشهر ${money(available)} وقد وُضعت في حقل المبلغ.`:'لا يوجد متاح للسلفة في هذا الشهر.');
  }
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

let advanceLogRows=[];
function renderAdvances(){
  if(!state.data)return;
  renderLogFilters('advanceLog');
  advanceLogRows=state.data.teacherAdvances.filter(a=>logFilterMatches('advanceLog',a)).map(a=>({a,t:state.data.teachers.find(x=>x.id===a.teacherId)}));
  $('advanceLogTotals').innerHTML=`<span>عدد السلف المعروضة: ${money(advanceLogRows.length)}</span><span>إجمالي السلف المعروضة: ${money(sumAmount(advanceLogRows.map(x=>x.a)))} أوقية</span>`;
  const rows=advanceLogRows.map(({a,t})=>{
    return `<tr>
      <td>${esc(advanceReceiptNo(a))}</td>
      <td>${esc(t?.name||'محذوف')}</td>
      <td>${esc(western(t?.phone||'—'))}</td>
      <td>${esc(a.month)}</td>
      <td>${money(a.amount)}</td>
      <td>${esc(dateTime(a))}</td>
      <td>${esc(a.notes)}</td>
      <td class="actions"><button class="btn-pay" onclick="printAdvanceReceipt(${a.id})">إيصال</button><button class="btn-edit" onclick="editAdvance(${a.id})">تعديل</button><button class="btn-delete" onclick="deleteAdvance(${a.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('advanceTable').innerHTML=rows||`<tr><td colspan="8">${state.data.teacherAdvances.length?'لا توجد سلف مطابقة للتصفية.':'لا توجد سلف.'}</td></tr>`;
  renderPayroll();
}
const ADVANCE_EXPORT_COLUMNS=[
  {key:'receiptNo',label:'رقم الإيصال',value:r=>advanceReceiptNo(r.a)},
  {key:'name',label:'الموظف',value:r=>r.t?.name||'محذوف'},
  {key:'phone',label:'الهاتف',value:r=>western(r.t?.phone||'')},
  {key:'role',label:'طبيعة العمل',value:r=>r.t?.role||''},
  {key:'month',label:'الشهر',value:r=>r.a.month},
  {key:'amount',label:'السلفة',value:r=>Number(r.a.amount||0)},
  {key:'date',label:'التاريخ',value:r=>r.a.date||''},
  {key:'time',label:'الساعة',value:r=>r.a.time||''},
  {key:'notes',label:'ملاحظات',value:r=>r.a.notes||''}
];
$('exportAdvanceLog').onclick=()=>openColumnExport({
  storageKey:'advanceExportColumns',columns:ADVANCE_EXPORT_COLUMNS,rows:advanceLogRows,
  title:'سجل سلف الموظفين',unit:'سلفة',filename:'سلف الموظفين',sheetName:'سلف الموظفين'
});

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
  if(state.data){populateStaffSelects();updateAdvanceHint()}
}
