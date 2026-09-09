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
