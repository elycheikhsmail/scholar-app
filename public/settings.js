$('settingsForm').onsubmit=async e=>{e.preventDefault();if($('newPassword').value!==$('confirmPassword').value)return toast('تأكيد كلمة المرور غير مطابق.');try{const x=await api('/settings',{method:'PUT',body:JSON.stringify({schoolName:$('setSchoolName').value,schoolYear:$('setSchoolYear').value,username:$('setUsername').value,defaultMonthlyFee:western($('setDefaultMonthlyFee').value),managerName:$('setManagerName').value,managerPhone:western($('setManagerPhone').value),schoolPhone:western($('setSchoolPhone').value),republic:$('setRepublic').value,ministry:$('setMinistry').value,regional:$('setRegional').value,currentPassword:$('currentPassword').value,newPassword:western($('newPassword').value)})});state.settings=x.settings;applySettings();$('currentPassword').value='';$('newPassword').value='';$('confirmPassword').value='';renderSettings();toast('تم حفظ الإعدادات.')}catch(e2){toast(e2.message)}};
function renderSettings(){$('applicationMode').value=state.settings.applicationMode||'production';$('setSchoolName').value=state.settings.schoolName;$('setSchoolYear').value=state.settings.schoolYear;$('setManagerName').value=state.settings.managerName||'';$('setManagerPhone').value=western(state.settings.managerPhone||'');$('setSchoolPhone').value=western(state.settings.schoolPhone||'');$('setRepublic').value=state.settings.republic||'الجمهورية الإسلامية الموريتانية';$('setMinistry').value=state.settings.ministry||'وزارة التعليم';$('setRegional').value=state.settings.regional||'الإدارة الجهوية للتعليم';$('setUsername').value=state.settings.username;$('setDefaultMonthlyFee').value=state.settings.defaultMonthlyFee}
$('clearDataBtn').onclick=async()=>{
  const first=await askConfirm('تحذير: سيتم حذف الطلاب والرسوم والمدفوعات والموظفين والرواتب والسلف والمصروفات. ستبقى الإعدادات والأقسام فقط. هل تريد المتابعة؟');
  if(!first)return;
  const second=await askInput('أدخل كلمة المرور لتأكيد تفريغ البيانات:');
  if(second===null)return;
  try{const resetResult=await api('/reset-data',{method:'POST',body:JSON.stringify({password:western(second)})});await load();resetStudent();resetTeacher();resetExpense();resetSalaryDates();resetAdvance();renderDashboard();renderStudents();renderFees();renderPaymentHistory();renderTeachers();renderSalary();renderAdvances();renderExpenses();renderExamSection();toast(resetResult?.backup?'تم التفريغ بنجاح، وتم إنشاء نسخة احتياطية للبيانات القديمة.':'تم تفريغ بيانات السنة الدراسية بنجاح.')}catch(e){toast(e.message)}};
$('departmentForm').onsubmit=async e=>{e.preventDefault();try{await api('/departments',{method:'POST',body:JSON.stringify({name:$('departmentName').value,monthlyFee:western($('departmentFee').value)})});await load();$('departmentName').value='';$('departmentFee').value='';renderDepartments();toast('تمت إضافة القسم.')}catch(e2){toast(e2.message)}};
function renderDepartments(){$('departmentsTable').innerHTML=state.departments.map(d=>{const count=state.data.students.filter(s=>s.className===d.name).length;return `<tr><td>${esc(d.name)}</td><td>${money(d.monthlyFee)}</td><td>${money(count)}</td><td class="actions"><button class="btn-edit" onclick="editDepartment(${d.id})">تعديل</button><button class="btn-delete" onclick="deleteDepartment(${d.id})">حذف</button></td></tr>`}).join('')||'<tr><td colspan="4">لا توجد أقسام مسجلة.</td></tr>'}
window.editDepartment=async id=>{if(!(await requirePassword()))return;const d=state.departments.find(x=>x.id===id);if(!d)return;const name=await askInput('اسم القسم الجديد',d.name);if(name===null)return;const fee=await askInput('الرسوم الشهرية للقسم',d.monthlyFee);if(fee===null)return;try{await api(`/departments/${id}`,{method:'PUT',body:JSON.stringify({name,monthlyFee:western(fee)})});await load();renderDepartments();renderStudents();renderFees();toast('تم تعديل القسم ورسومه.')}catch(e){toast(e.message)}};
window.deleteDepartment=async id=>{await deleteWithPassword(`/departments/${id}`,'هل تريد حذف هذا القسم؟','تم حذف القسم.');};


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
