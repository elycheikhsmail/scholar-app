// Écran « الإعدادات » : frais, départements, identité de l'école, compte et
// bascule entre le mode production et le mode d'essai.

// Cinq formulaires sur un même écran devenaient une page à faire défiler, où le
// bloc des frais se lisait à peine. Ils sont maintenant présentés un à la fois,
// derrière une liste d'onglets ; le dernier onglet ouvert est retenu.
const settingsTabs=createTabs({nav:'#settings .settings-tabs',tabAttr:'settings-tab',panelAttr:'settings-panel',storageKey:'settingsTab'});

$('settingsForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    const result=await api('/settings',{method:'PUT',body:JSON.stringify({
      schoolName:$('setSchoolName').value,
      schoolYear:$('setSchoolYear').value,
      managerName:$('setManagerName').value,
      managerPhone:western($('setManagerPhone').value),
      schoolPhone:western($('setSchoolPhone').value),
      republic:$('setRepublic').value,
      ministry:$('setMinistry').value,
      regional:$('setRegional').value,
      currentPassword:$('currentPassword').value
    })});
    state.settings=result.settings;
    applySettings();
    // Le champ de mot de passe ne se recharge jamais depuis le serveur.
    $('currentPassword').value='';
    renderSettings();
    toast('تم حفظ الإعدادات.');
  }catch(error){
    toast(error.message);
  }
};
// Les intitulés officiels ont une valeur par défaut : une base vide doit tout de
// même imprimer un en-tête complet.
function renderSettings(){
  settingsTabs.show();
  renderSimulatedDate();
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
    setRegistrationFee:state.settings.registrationFee,
    setDefaultMonthlyFee:state.settings.defaultMonthlyFee
  };
  for(const [fieldId,value] of Object.entries(fields))$(fieldId).value=value;
  renderSyncStatus();
  renderAccount();
  if(['admin','developer'].includes(state.user?.role)&&!state.readOnly)loadUsers();
}

// --- Comptes : « حسابي » pour tous, « المستخدمون » pour l'admin et le développeur ---
function renderAccount(){
  $('accountUsername').textContent=state.user?.username||'—';
  $('accountRole').textContent=ROLE_LABELS[state.user?.role]||'—';
}
$('passwordForm').onsubmit=async e=>{
  e.preventDefault();
  if($('accountNewPassword').value!==$('accountConfirmPassword').value)return toast('تأكيد كلمة المرور غير مطابق.');
  try{
    await api('/password',{method:'PUT',body:JSON.stringify({currentPassword:western($('accountCurrentPassword').value),newPassword:western($('accountNewPassword').value)})});
    for(const id of ['accountCurrentPassword','accountNewPassword','accountConfirmPassword'])$(id).value='';
    toast('تم تغيير كلمة المرور.');
  }catch(error){toast(error.message)}
};
let users=[];
async function loadUsers(){
  try{users=await api('/users');renderUsers()}catch(error){toast(error.message)}
}
function renderUsers(){
  const me=Number(state.user?.id);
  $('usersTable').innerHTML=users.map(u=>{
    const locked=u.role==='developer'||Number(u.id)===me;
    const roleCell=locked?esc(ROLE_LABELS[u.role]||u.role)
      :`<select class="role-select" aria-label="نوع المستخدم ${esc(u.username)}" onchange="changeUserRole(${u.id},this.value)">${['secretary','supervisor','admin'].map(r=>`<option value="${r}"${r===u.role?' selected':''}>${ROLE_LABELS[r]}</option>`).join('')}</select>`;
    const actions=u.role==='developer'?'':`<button class="btn-edit" onclick="resetUserPassword(${u.id})">تغيير كلمة المرور</button>${Number(u.id)===me?'':`<button class="btn-delete" onclick="deleteUser(${u.id})">حذف</button>`}`;
    return `<tr><td>${esc(u.username)}${Number(u.id)===me?' <small>(أنت)</small>':''}</td><td>${roleCell}</td><td class="actions">${actions}</td></tr>`;
  }).join('')||'<tr><td colspan="3">لا يوجد مستخدمون.</td></tr>';
}
$('userForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    await api('/users',{method:'POST',body:JSON.stringify({username:$('userName').value,role:$('userRole').value,password:western($('userPassword').value)})});
    $('userName').value='';$('userPassword').value='';
    toast('تمت إضافة المستخدم.');
    await loadUsers();
  }catch(error){toast(error.message)}
};
window.changeUserRole=async(id,role)=>{
  try{await api(`/users/${id}`,{method:'PUT',body:JSON.stringify({role})});toast('تم تغيير نوع المستخدم.')}
  catch(error){toast(error.message)}
  await loadUsers();
};
window.resetUserPassword=async id=>{
  const user=users.find(u=>Number(u.id)===Number(id));
  const password=await askInput(`كلمة المرور الجديدة للمستخدم ${user?.username||''}:`);
  if(password===null)return;
  try{await api(`/users/${id}`,{method:'PUT',body:JSON.stringify({password:western(password)})});toast('تم تغيير كلمة المرور.')}
  catch(error){toast(error.message)}
};
window.deleteUser=async id=>{
  const user=users.find(u=>Number(u.id)===Number(id));
  if(!(await askConfirm(`هل تريد حذف المستخدم ${user?.username||''}؟`)))return;
  try{await api(`/users/${id}`,{method:'DELETE'});toast('تم حذف المستخدم.')}
  catch(error){toast(error.message)}
  await loadUsers();
};
// --- Copie web en lecture seule : réglages et bouton de synchronisation ------
function renderSyncStatus(){
  const s=state.settings;
  $('syncUrl').value=s.syncUrl||'';
  $('syncToken').value='';
  $('syncTokenInfo').textContent=s.syncTokenSet?'رمز المزامنة محفوظ؛ اتركه فارغًا للإبقاء عليه.':'لم يُحفظ رمز مزامنة بعد.';
  $('syncLastAt').textContent=s.lastSyncAt?western(s.lastSyncAt.replace('T',' ').slice(0,16)):'لم تتم بعد';
  $('syncPending').textContent=money(s.writesSinceSync||0);
  $('syncNow').disabled=!s.syncUrl||!s.syncTokenSet;
}
$('syncSettingsForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    const result=await api('/sync-settings',{method:'PUT',body:JSON.stringify({syncUrl:$('syncUrl').value.trim(),syncToken:$('syncToken').value,currentPassword:$('syncCurrentPassword').value})});
    state.settings={...state.settings,...result.settings};
    $('syncCurrentPassword').value='';
    renderSyncStatus();
    toast('تم حفظ إعدادات المزامنة.');
  }catch(error){toast(error.message)}
};
$('syncNow').onclick=async()=>{
  const button=$('syncNow');
  button.disabled=true;button.textContent='جارٍ الإرسال…';
  try{
    const result=await api('/sync-remote',{method:'POST'});
    state.settings={...state.settings,...result.settings};
    toast(`تمت المزامنة: ${money(result.records)} سجلًا.`);
  }catch(error){toast(error.message)}
  finally{button.textContent='مزامنة الآن';renderSyncStatus()}
};
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

// --- Liste « طبيعة العمل » ---------------------------------------------------
// La liste vit dans les réglages ; le formulaire employé la relit à chaque rendu.
function staffRoleList(){
  const roles=Array.isArray(state.settings?.staffRoles)?state.settings.staffRoles:[];
  return roles.length?roles:['أستاذ','معلم','محاسب','مراقب','عامل يدوي','أخرى'];
}
async function saveStaffRoles(request,message){
  try{
    const settings=await api(request.path,{method:request.method,body:request.body?JSON.stringify(request.body):undefined});
    state.settings={...state.settings,...settings};
    await load();
    renderStaffRoles();
    renderTeachers();
    toast(message);
  }catch(error){toast(error.message)}
}
$('staffRoleForm').onsubmit=async e=>{
  e.preventDefault();
  const name=$('staffRoleName').value.trim();
  if(!name)return toast('أدخل اسم طبيعة العمل.');
  await saveStaffRoles({path:'/staff-roles',method:'POST',body:{name}},'تمت إضافة طبيعة العمل.');
  $('staffRoleName').value='';
};
function renderStaffRoles(){
  const pinned=['أستاذ','أخرى'];
  const rows=staffRoleList().map((role,index)=>{
    const count=state.data.teachers.filter(t=>t.role===role).length;
    const actions=pinned.includes(role)
      ?'<small>ثابتة</small>'
      :`<button class="btn-edit" onclick="editStaffRole(${index})">تعديل</button><button class="btn-delete" onclick="deleteStaffRole(${index})">حذف</button>`;
    return `<tr><td>${esc(role)}</td><td>${money(count)}</td><td class="actions">${actions}</td></tr>`;
  }).join('');
  $('staffRolesTable').innerHTML=rows||'<tr><td colspan="3">لا توجد عناصر.</td></tr>';
}
window.editStaffRole=async index=>{
  if(!(await requirePassword()))return;
  const role=staffRoleList()[index];
  if(role===undefined)return;
  const name=await askInput('الاسم الجديد لطبيعة العمل',role);
  if(name===null)return;
  await saveStaffRoles({path:`/staff-roles/${index}`,method:'PUT',body:{name}},'تم تعديل طبيعة العمل.');
};
window.deleteStaffRole=async index=>{
  if(!(await requirePassword()))return;
  if(!(await askConfirm('هل تريد حذف طبيعة العمل هذه؟')))return;
  await saveStaffRoles({path:`/staff-roles/${index}`,method:'DELETE'},'تم حذف طبيعة العمل.');
};


function applyApplicationMode(mode, readOnly = state.readOnly) {
  if (!['test','production'].includes(mode)) return;
  applyReadOnly(readOnly);
  const label = readOnly ? 'نسخة للعرض فقط' : mode === 'test' ? 'نسخة للتجريب فقط' : 'وضع الإنتاج';
  for (const id of ['loginModeBadge','appModeBadge']) {
    $(id).textContent = label;
    $(id).classList.toggle('test-mode',mode === 'test' && !readOnly);
    $(id).classList.toggle('read-only-badge',readOnly);
  }
  document.title = `${label} — حسابات المدرسة`;
}
async function checkApplicationMode() {
  try {
    const info = await api('/mode');
    if (state.token && state.settings?.applicationMode && state.settings.applicationMode !== info.mode) return location.reload();
    if (adoptTestDate(info)) return location.reload();
    applyApplicationMode(info.mode, !!info.readOnly);
  } catch { /* Keep the last confirmed label while disconnected. */ }
}
// La base de test peut proposer sa propre date (scripts/seed-testing.js) :
// adoptée une fois par émission sur cet appareil, puis modifiable ou effaçable
// comme une date saisie à la main.
function adoptTestDate(info) {
  if (info.mode !== 'test' || !/^\d{4}-\d{2}-\d{2}$/.test(info.testDate || '')) return false;
  try {
    const issued = `${info.testDate}@${info.testDateIssued || ''}`;
    if (localStorage.getItem('testDateAdopted') === issued) return false;
    localStorage.setItem('testDateAdopted', issued);
    localStorage.setItem(SIMULATED_DATE_KEY, info.testDate);
    return true;
  } catch { return false; }
}
// Date de test : mémorisée sur l'appareil, l'écran se recharge pour que tout
// (mois par défaut, échéances, bandeau) reparte de cette date.
function renderSimulatedDate() {
  $('simulatedDate').value = simulatedDate;
  $('clearSimulatedDate').classList.toggle('hidden', !simulatedDate);
  $('simulatedDateInfo').textContent = simulatedDate
    ? `⚠️ التطبيق يعمل الآن بتاريخ تجريبي: ${western(simulatedDate)}. الشهر الجاري المعتمد: ${currentMonth()}.`
    : 'التطبيق يعمل بالتاريخ الحقيقي للجهاز.';
}
$('simulatedDateForm').onsubmit = event => {
  event.preventDefault();
  const value = $('simulatedDate').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return toast('اختر تاريخًا صحيحًا.');
  if (value === simulatedDate) return toast('هذا هو التاريخ التجريبي الحالي بالفعل.');
  try { localStorage.setItem(SIMULATED_DATE_KEY, value); } catch { return toast('تعذر حفظ التاريخ على هذا الجهاز.'); }
  location.reload();
};
$('clearSimulatedDate').onclick = () => {
  try { localStorage.removeItem(SIMULATED_DATE_KEY); } catch {}
  location.reload();
};
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

// --- Base de données (développeur) : export en un fichier, import qui remplace tout ---
// Le mot de passe du développeur part avec chaque requête : le serveur le
// revérifie, une session ouverte ne suffit pas pour écraser les données réelles.
$('exportDatabaseBtn').onclick=async()=>{
  const password=await askInput('أدخل كلمة مرور المطوّر لتصدير قاعدة البيانات:');
  if(password===null)return;
  try{
    const response=await fetch(`${API_BASE}/database/export`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.token}`},body:JSON.stringify({password:western(password)})});
    if(!response.ok){const x=await response.json().catch(()=>({}));throw Error(x.error||'تعذر التصدير.')}
    const name=(response.headers.get('Content-Disposition')||'').match(/filename="([^"]+)"/)?.[1]||'school-data.sqlite';
    const url=URL.createObjectURL(await response.blob());
    const link=Object.assign(document.createElement('a'),{href:url,download:name});
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast('تم تصدير قاعدة البيانات.');
  }catch(error){toast(error.message)}
};
$('importDatabaseBtn').onclick=()=>{$('importDatabaseFile').value='';$('importDatabaseFile').click()};
$('importDatabaseFile').onchange=async()=>{
  const file=$('importDatabaseFile').files[0];
  if(!file)return;
  const password=await askInput(`أدخل كلمة مرور المطوّر لاستيراد الملف «${file.name}»:`);
  if(password===null)return;
  if(!(await askConfirm('سيتم استبدال قاعدة البيانات الحالية بالكامل بمحتوى هذا الملف (مع حفظ نسخة احتياطية). هل تريد المتابعة؟')))return;
  try{
    const response=await fetch(`${API_BASE}/database/import`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Confirm-Password':encodeURIComponent(western(password)),Authorization:`Bearer ${state.token}`},body:file});
    const x=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(x.error||'تعذر الاستيراد.');
    const c=x.counts||{};
    toast(`تم استيراد قاعدة البيانات (${c.students||0} طالبًا، ${c.departments||0} قسمًا). أعد تسجيل الدخول.`);
    // Les sessions de l'ancienne base sont closes : retour à l'écran de connexion.
    setTimeout(()=>location.reload(),2500);
  }catch(error){toast(error.message)}
};
