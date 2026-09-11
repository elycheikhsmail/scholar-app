// Écran « الإعدادات » : frais, départements, identité de l'école, compte et
// bascule entre le mode production et le mode d'essai.

// Cinq formulaires sur un même écran devenaient une page à faire défiler, où le
// bloc des frais se lisait à peine. Ils sont maintenant présentés un à la fois,
// derrière une liste d'onglets ; le dernier onglet ouvert est retenu.
const SETTINGS_TABS=[...document.querySelectorAll('[data-settings-tab]')].map(tab=>tab.dataset.settingsTab);
let settingsTab=SETTINGS_TABS[0];
try{
  const saved=localStorage.getItem('settingsTab');
  if(SETTINGS_TABS.includes(saved))settingsTab=saved;
}catch{}
function showSettingsTab(name,{focus=false}={}){
  if(!SETTINGS_TABS.includes(name))name=SETTINGS_TABS[0];
  settingsTab=name;
  try{localStorage.setItem('settingsTab',name)}catch{}
  for(const button of document.querySelectorAll('[data-settings-tab]')){
    const active=button.dataset.settingsTab===name;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
    // Roving tabindex: la liste d'onglets se parcourt aux flèches, pas au Tab.
    button.tabIndex=active?0:-1;
    if(active&&focus)button.focus();
  }
  for(const panel of document.querySelectorAll('[data-settings-panel]')){
    panel.classList.toggle('hidden',panel.dataset.settingsPanel!==name);
  }
}
document.querySelector('.settings-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-settings-tab]');
  if(button)showSettingsTab(button.dataset.settingsTab);
});
document.querySelector('.settings-tabs').addEventListener('keydown',event=>{
  const step={ArrowLeft:1,ArrowRight:-1,Home:'first',End:'last'}[event.key];
  if(step===undefined)return;
  event.preventDefault();
  const index=SETTINGS_TABS.indexOf(settingsTab);
  const next=step==='first'?0:step==='last'?SETTINGS_TABS.length-1
    :(index+step+SETTINGS_TABS.length)%SETTINGS_TABS.length;
  showSettingsTab(SETTINGS_TABS[next],{focus:true});
});

$('settingsForm').onsubmit=async e=>{
  e.preventDefault();
  if($('newPassword').value!==$('confirmPassword').value)return toast('تأكيد كلمة المرور غير مطابق.');
  try{
    const result=await api('/settings',{method:'PUT',body:JSON.stringify({
      schoolName:$('setSchoolName').value,
      schoolYear:$('setSchoolYear').value,
      username:$('setUsername').value,
      managerName:$('setManagerName').value,
      managerPhone:western($('setManagerPhone').value),
      schoolPhone:western($('setSchoolPhone').value),
      republic:$('setRepublic').value,
      ministry:$('setMinistry').value,
      regional:$('setRegional').value,
      currentPassword:$('currentPassword').value,
      newPassword:western($('newPassword').value)
    })});
    state.settings=result.settings;
    applySettings();
    // Les champs de mot de passe ne se rechargent jamais depuis le serveur.
    $('currentPassword').value='';
    $('newPassword').value='';
    $('confirmPassword').value='';
    renderSettings();
    toast('تم حفظ الإعدادات.');
  }catch(error){
    toast(error.message);
  }
};
// Les intitulés officiels ont une valeur par défaut : une base vide doit tout de
// même imprimer un en-tête complet.
function renderSettings(){
  showSettingsTab(settingsTab);
  const fields={
    applicationMode:state.settings.applicationMode||'production',
    setSchoolName:state.settings.schoolName,
    setSchoolYear:state.settings.schoolYear,
    setManagerName:state.settings.managerName||'',
    setManagerPhone:western(state.settings.managerPhone||''),
    setSchoolPhone:western(state.settings.schoolPhone||''),
    setRepublic:state.settings.republic||'الجمهورية الإسلامية الموريتانية',
    setMinistry:state.settings.ministry||'وزارة التعليم',
    setRegional:state.settings.regional||'الإدارة الجهوية للتعليم',
    setUsername:state.settings.username,
    setRegistrationFee:state.settings.registrationFee,
    setDefaultMonthlyFee:state.settings.defaultMonthlyFee
  };
  for(const [fieldId,value] of Object.entries(fields))$(fieldId).value=value;
}
// Les frais ne sont plus saisis élève par élève : ils sont fixés ici une fois,
// et chaque relevé les relit. Un changement vaut donc pour toute l'école.
$('feeSettingsForm').onsubmit=async e=>{
  e.preventDefault();
  if(!(await requirePassword()))return;
  try{
    const result=await api('/fee-settings',{method:'PUT',body:JSON.stringify({
      registrationFee:western($('setRegistrationFee').value),
      defaultMonthlyFee:western($('setDefaultMonthlyFee').value)
    })});
    state.settings={...state.settings,...result};
    renderSettings();
    renderStudents();
    renderFees();
    renderDashboard();
    toast('تم حفظ إعدادات الرسوم.');
  }catch(error){
    toast(error.message);
  }
};
$('clearDataBtn').onclick=async()=>{
  const first=await askConfirm('تحذير: سيتم حذف الطلاب والرسوم والمدفوعات والموظفين والرواتب والسلف والمصروفات. ستبقى الإعدادات والأقسام فقط. هل تريد المتابعة؟');
  if(!first)return;
  const second=await askInput('أدخل كلمة المرور لتأكيد تفريغ البيانات:');
  if(second===null)return;
  try{
    const resetResult=await api('/reset-data',{method:'POST',body:JSON.stringify({password:western(second)})});
    await load();
    // Les formulaires gardent les valeurs de l'année effacée : on les vide tous,
    // puis on redessine chaque écran sur les données vides.
    resetStudent();resetTeacher();resetExpense();resetSalaryDates();resetAdvance();
    renderDashboard();renderStudents();renderFees();renderPaymentHistory();
    renderTeachers();renderSalary();renderAdvances();renderExpenses();renderExamSection();
    toast(resetResult?.backup
      ?'تم التفريغ بنجاح، وتم إنشاء نسخة احتياطية للبيانات القديمة.'
      :'تم تفريغ بيانات السنة الدراسية بنجاح.');
  }catch(error){
    toast(error.message);
  }
};
$('departmentForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    await api('/departments',{method:'POST',body:JSON.stringify({
      name:$('departmentName').value,
      monthlyFee:western($('departmentFee').value)
    })});
    await load();
    $('departmentName').value='';
    $('departmentFee').value='';
    renderDepartments();
    toast('تمت إضافة القسم.');
  }catch(error){
    toast(error.message);
  }
};
function renderDepartments(){
  const rows=state.departments.map(d=>{
    const count=state.data.students.filter(s=>s.className===d.name).length;
    return `<tr>
      <td>${esc(d.name)}</td>
      <td>${money(d.monthlyFee)}</td>
      <td>${money(count)}</td>
      <td class="actions"><button class="btn-edit" onclick="editDepartment(${d.id})">تعديل</button><button class="btn-delete" onclick="deleteDepartment(${d.id})">حذف</button></td>
    </tr>`;
  }).join('');
  $('departmentsTable').innerHTML=rows||'<tr><td colspan="4">لا توجد أقسام مسجلة.</td></tr>';
}
// Changer les frais d'un département change ce que doivent ses élèves : les
// écrans « الطلاب » et « الرسوم » sont redessinés dans la foulée.
window.editDepartment=async id=>{
  if(!(await requirePassword()))return;
  const department=state.departments.find(x=>x.id===id);
  if(!department)return;
  const name=await askInput('اسم القسم الجديد',department.name);
  if(name===null)return;
  const fee=await askInput('الرسوم الشهرية للقسم',department.monthlyFee);
  if(fee===null)return;
  try{
    await api(`/departments/${id}`,{method:'PUT',body:JSON.stringify({name,monthlyFee:western(fee)})});
    await load();
    renderDepartments();
    renderStudents();
    renderFees();
    renderDashboard();
    toast('تم تعديل القسم ورسومه.');
  }catch(error){
    toast(error.message);
  }
};
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
