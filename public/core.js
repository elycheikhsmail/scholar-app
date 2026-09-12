const months=MONTHS;
const monthNumber=MONTH_NUMBER;
let state={token:'',settings:null,user:null,data:null,departments:[],examData:{settings:{},exams:[]}};
const $=id=>document.getElementById(id);
const API_BASE=window.location.protocol==='file:'?'http://127.0.0.1:3780/api':'/api';
const money=n=>Number(n||0).toLocaleString('en-US',{useGrouping:true,maximumFractionDigits:2});
const western=v=>String(v??'').replace(/[٠-٩۰-۹]/g,d=>String(Math.max('٠١٢٣٤٥٦٧٨٩'.indexOf(d),'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
// Date d'une facture suivie de l'heure de saisie quand elle est connue (« 2026-09-11 14:05 »).
const dateTime=row=>[western(row?.date),western(row?.time)].filter(Boolean).join(' ');
// Totalise le champ `amount` d'une liste d'enregistrements (paiements, avances, dépenses).
const sumAmount=rows=>rows.reduce((total,row)=>total+Number(row.amount||0),0);

// Native prompt() is unavailable in Electron and some embedded browsers.
function showInputDialog(message, defaultValue = '', confirmation = false) {
  if (document.querySelector('.input-dialog[open]')) return Promise.resolve(confirmation ? false : null);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'input-dialog';
    dialog.setAttribute('aria-labelledby', 'input-dialog-title');
    const form = document.createElement('form');
    form.method = 'dialog';
    const title = document.createElement('h3');
    title.id = 'input-dialog-title';
    title.textContent = message;
    form.append(title);
    const input = document.createElement('input');
    input.setAttribute('aria-label', message);
    input.type = /كلمة المرور/.test(message) ? 'password' : 'text';
    input.autocomplete = input.type === 'password' ? 'current-password' : 'off';
    input.value = String(defaultValue ?? '');
    if (!confirmation) form.append(input);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.type = 'submit';
    submit.textContent = 'تأكيد';
    const cancel = document.createElement('button');
    cancel.className = 'secondary';
    cancel.type = 'button';
    cancel.textContent = 'إلغاء';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    form.addEventListener('submit', event => { event.preventDefault(); dialog.close('confirm'); });
    actions.append(submit, cancel);
    form.append(actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue === 'confirm' ? (confirmation ? true : input.value) : (confirmation ? false : null);
      input.value = '';
      dialog.remove();
      resolve(result);
    }, { once: true });
    dialog.showModal();
    (confirmation ? cancel : input).focus();
  });
}
const askInput = (message, value = '') => showInputDialog(message, value);
const askConfirm = message => showInputDialog(message, '', true);

// Date de test (الإعدادات ← وضع الاستخدام) : l'application se comporte comme si
// l'on était ce jour-là, sur cet appareil seulement. Tout ce qui dépend du jour
// (échéances, mois courant, dates proposées) passe par now()/today().
const SIMULATED_DATE_KEY='simulatedDate';
const simulatedDate=(()=>{try{const v=localStorage.getItem(SIMULATED_DATE_KEY)||'';return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:''}catch{return ''}})();
function now(){
  const real=new Date();
  if(!simulatedDate)return real;
  const d=new Date(`${simulatedDate}T00:00:00`);
  d.setHours(real.getHours(),real.getMinutes(),real.getSeconds());
  return d;
}
const today=()=>simulatedDate||new Date().toISOString().slice(0,10);
const currentMonth=()=>{const m=now().getMonth()+1;return m>=10?months[m-10]:m<=6?months[m+2]:months[0]};
const debounce=(fn,ms=200)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms)}};
// The total view is an extra entry in the fee selector only; the selectors that
// pick which fee a payment settles must stay a plain list of months.
const monthOptionsHtml=()=>`<option value="${REGISTRATION}">${REGISTRATION}</option>`+MONTHS.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
// Copie en lecture seule : aucune écriture ne part vers le réseau ; le serveur
// la refuserait de toute façon (405), mais l'utilisateur a droit à un message net.
const READ_ONLY_MESSAGE='هذه النسخة للعرض فقط؛ لا يمكن الحفظ أو التعديل.';
function applyReadOnly(flag){
  state.readOnly=!!flag;
  document.body.classList.toggle('read-only',state.readOnly);
}
function api(path,options={}){if(state.readOnly&&(options.method||'GET')!=='GET'&&!['/login','/logout'].includes(path))return Promise.reject(Error(READ_ONLY_MESSAGE));const headers={'Content-Type':'application/json',...(options.headers||{})};if(state.token)headers.Authorization=`Bearer ${state.token}`;return fetch(`${API_BASE}${path}`,{...options,headers}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&state.token&&path!=='/login')location.reload();throw Error(x.error||'حدث خطأ.');}return x})}
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',3200)}
function setDate(id){if($(id)&&!$(id).value)$(id).value=today()}

// A native date input lays its parts out in the browser locale order, often
// mm/dd/yyyy. Every `.date-dmy` input is hidden and driven by three visible
// fields in the order the school writes dates: اليوم ثم الشهر ثم السنة. The
// original input keeps the ISO value, so code reading or writing `.value`
// (resetStudent, editStudent, the submit handlers) stays unchanged.
const GREGORIAN_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function isoFromDmy(day,month,year){
  if(!day||!month||year.length!==4)return '';
  const iso=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  const date=new Date(`${iso}T00:00:00`);
  // Rejects impossible days such as 31/02 that Date would roll over silently.
  return Number.isNaN(date.getTime())||date.getDate()!==Number(day)||date.getMonth()+1!==Number(month)?'':iso;
}
function setupDateFields(root=document){
  const valueProperty=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  for(const native of root.querySelectorAll('input.date-dmy')){
    if(native.dmyGroup)continue;
    const group=document.createElement('span');
    group.className='dmy-group';
    const fieldName=native.closest('label')?.firstChild?.textContent?.trim()||'';
    group.setAttribute('role','group');
    if(fieldName)group.setAttribute('aria-label',fieldName);
    const error=document.createElement('small');
    error.className='dmy-error hidden';
    error.setAttribute('role','alert');
    const writeBack=()=>{
      const iso=isoFromDmy(fields[0].value,fields[1].value,fields[2].value);
      if(valueProperty.get.call(native)===iso)return;
      valueProperty.set.call(native,iso);
      native.dispatchEvent(new Event('change',{bubbles:true}));
    };
    const makeField=(key,label,control)=>{
      const wrapper=document.createElement('span');
      wrapper.className='dmy-field';
      const caption=document.createElement('small');
      caption.textContent=label;
      control.className=`dmy-part dmy-${key}`;
      control.setAttribute('aria-label',fieldName?`${label} - ${fieldName}`:label);
      control.required=native.required;
      wrapper.append(caption,control);
      group.append(wrapper);
      return control;
    };
    const day=makeField('day','اليوم',document.createElement('select'));
    const month=makeField('month','الشهر',document.createElement('select'));
    month.innerHTML='<option value="">اختر الشهر</option>'+GREGORIAN_MONTHS.map((name,index)=>`<option value="${index+1}">${name}</option>`).join('');
    const yearInput=document.createElement('input');
    yearInput.inputMode='numeric';
    yearInput.maxLength=4;
    yearInput.placeholder='مثال: 2026';
    const year=makeField('year','السنة',yearInput);
    const fields=[day,month,year];
    const daysInSelectedMonth=()=>{
      const typedYear=Number(year.value),typedMonth=Number(month.value);
      return typedMonth>=1&&typedMonth<=12&&year.value.length===4?new Date(typedYear,typedMonth,0).getDate():31;
    };
    const updateDays=()=>{
      const previous=Number(day.value),maximum=daysInSelectedMonth();
      day.innerHTML='<option value="">اختر اليوم</option>'+Array.from({length:maximum},(_,index)=>`<option value="${index+1}">${index+1}</option>`).join('');
      if(previous&&previous<=maximum)day.value=String(previous);
      const invalidDay=previous>maximum;
      error.textContent=invalidDay?`هذا الشهر يحتوي على ${maximum} يومًا فقط. اختر يومًا صالحًا.`:'';
      error.classList.toggle('hidden',!invalidDay);
      day.setCustomValidity(invalidDay?error.textContent:'');
    };
    day.addEventListener('change',()=>{day.setCustomValidity('');error.classList.add('hidden');writeBack()});
    month.addEventListener('change',()=>{updateDays();writeBack()});
    year.addEventListener('input',()=>{
      year.value=western(year.value).replace(/\D/g,'').slice(0,4);
      updateDays();
      writeBack();
    });
    const paint=()=>{
      const [year,month,day]=String(valueProperty.get.call(native)||'').split('-');
      fields[1].value=month?String(Number(month)):'';
      fields[2].value=year||'';
      updateDays();
      fields[0].value=day?String(Number(day)):'';
      error.classList.add('hidden');
      fields[0].setCustomValidity('');
    };
    // The hidden input must not carry `required`: an invisible invalid control
    // blocks submission without showing a message, so the day field asks instead.
    native.required=false;
    native.tabIndex=-1;
    native.dmyGroup=group;
    Object.defineProperty(native,'value',{configurable:true,
      get(){return valueProperty.get.call(native)},
      set(value){valueProperty.set.call(native,value);paint()}});
    group.append(error);
    native.after(group);
    // form.reset() clears the hidden input without going through the setter.
    native.form?.addEventListener('reset',()=>setTimeout(paint));
    paint();
  }
}
setupDateFields();
function tick(){const d=now();$('clock').textContent=western(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d));// La date du bandeau se lit en arabe (jour, mois en toutes lettres) avec des chiffres occidentaux.
$('today').textContent=(simulatedDate?'⚠️ تاريخ تجريبي: ':'')+western(new Intl.DateTimeFormat('ar-EG-u-nu-latn',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d));document.querySelector('.top-date').classList.toggle('simulated',!!simulatedDate)}
setInterval(tick,1000);tick();
document.addEventListener('input',e=>{if(e.target.matches('input[type=number],input[inputmode="numeric"]'))e.target.value=western(e.target.value)});

async function load(){state.data=await api('/data');state.departments=await api('/departments');state.examData=await api('/exams');populateDepartments();populateExamDepartments();refreshStudentFeeDetails()}
function applySettings(){applyApplicationMode(state.settings.applicationMode);$('schoolName').textContent=state.settings.schoolName;$('schoolYear').textContent=state.settings.schoolYear;$('loginSchoolName').textContent=state.settings.schoolName;$('managerNameHome').textContent=state.settings.managerName||'غير محدد';$('managerPhoneHome').textContent=western(state.settings.managerPhone||'');$('appVersion').textContent=western(state.settings.version||window.schoolAPI?.version||'—')}
function setupMonths(id){$(id).innerHTML=months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}
$('feeMonth').innerHTML=monthOptionsHtml();setupMonths('salaryMonth');setupMonths('advanceMonth');setupMonths('payrollMonth');$('payrollMonth').value=currentMonth();$('feeMonth').value=currentMonth();$('salaryMonth').value=currentMonth();$('advanceMonth').value=currentMonth();

// Comptes et rôles : le serveur refuse de toute façon ce que le rôle n'autorise
// pas ; ici l'interface masque ce qui ne le concerne pas. Le superviseur lit
// tout sans rien saisir (no-write, mêmes règles CSS que la copie web) ; les
// onglets marqués data-roles ne s'affichent qu'aux rôles listés.
const ROLE_LABELS={developer:'مطوّر',admin:'مدير النظام',secretary:'سكرتير',supervisor:'مشرف'};
function applyRole(){
  const role=state.user?.role||'admin';
  document.body.dataset.role=role;
  document.body.classList.toggle('no-write',role==='supervisor');
  for(const element of document.querySelectorAll('[data-roles]'))element.hidden=!element.getAttribute('data-roles').split(/\s+/).includes(role);
  $('currentUser').textContent=state.user?`${state.user.username} · ${ROLE_LABELS[role]||role}`:'';
}
async function enterApplication(x){state.token=x.token;state.settings=x.settings;await load();state.user=x.user||state.data.user||{username:state.settings.username,role:'admin'};applyRole();$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');applySettings();resetStudent();resetTeacher();resetExpense();resetSalaryDates();resetAdvance();const requested=sectionFromLocation();go(DETAIL_SECTIONS.has(requested)?'fees':requested||'dashboard',{historyMode:'replace'})}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const x=await api('/login',{method:'POST',body:JSON.stringify({username:western($('loginUsername').value),password:western($('loginPassword').value)})});await enterApplication(x)}catch(err){toast(err.message)}});
$('logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}location.reload()};
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.section));
const APP_SECTIONS=new Set([...document.querySelectorAll('.section[id]')].map(section=>section.id));
const DETAIL_SECTIONS=new Set(['student-fees']);
const NAVIGATION_INDEX_KEY='schoolNavigationIndex';
let navigationIndex=Number.isInteger(history.state?.[NAVIGATION_INDEX_KEY])?history.state[NAVIGATION_INDEX_KEY]:0;
function sectionFromLocation(){
  try{
    const section=decodeURIComponent(location.hash.slice(1));
    if(section==='student-ledger')return 'fees';
    return APP_SECTIONS.has(section)?section:null;
  }catch{return null}
}
function go(id,{historyMode='push'}={}){
  if(!APP_SECTIONS.has(id))id='dashboard';
  const targetHash=`#${id}`;
  if(historyMode==='replace'){
    history.replaceState({[NAVIGATION_INDEX_KEY]:navigationIndex},'',targetHash);
  }else if(historyMode==='push'&&location.hash!==targetHash){
    navigationIndex+=1;
    history.pushState({[NAVIGATION_INDEX_KEY]:navigationIndex},'',targetHash);
  }
  const navSection=DETAIL_SECTIONS.has(id)?'fees':id;
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===navSection));
  // Le bandeau supérieur prend la couleur de la rubrique ouverte (voir .topbar[data-section] dans style.css).
  document.querySelector('.topbar').dataset.section=navSection;
  document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active-section',x.id===id));
  if(id==='dashboard')renderDashboard();
  if(id==='students')renderStudents();
  if(id==='fees')renderFees();
  if(id==='collections')renderPaymentHistory();
  if(id==='staff'){renderTeachers();renderSalary();renderAdvances()}
  if(id==='expenses')renderExpenses();
  if(id==='exams')renderExamSection();
  if(id==='reports')renderReports();
  if(id==='settings'){renderSettings();renderDepartments();renderStaffRoles()}
  updatePageBackButtons();
}
function updatePageBackButtons(){
  document.querySelectorAll('[data-page-back]').forEach(button=>{button.disabled=navigationIndex<=0});
}
function goToPreviousPage(){if(navigationIndex>0)history.back()}
document.querySelectorAll('[data-page-back]').forEach(button=>button.addEventListener('click',goToPreviousPage));
function followLocation(){
  if($('app').classList.contains('hidden'))return;
  navigationIndex=Number.isInteger(history.state?.[NAVIGATION_INDEX_KEY])?history.state[NAVIGATION_INDEX_KEY]:0;
  const requested=sectionFromLocation();
  if(requested)go(requested,{historyMode:'none'});
  else go('dashboard',{historyMode:'replace'});
}
window.addEventListener('hashchange',followLocation);
window.addEventListener('popstate',followLocation);

// Onglets internes à un écran (الإعدادات, الموظفون) : un seul panneau visible à
// la fois, dernier onglet retenu sur l'appareil, parcours aux flèches.
function createTabs({nav,tabAttr,panelAttr,storageKey}){
  const list=document.querySelector(nav);
  const names=[...list.querySelectorAll(`[data-${tabAttr}]`)].map(tab=>tab.getAttribute(`data-${tabAttr}`));
  let current=names[0];
  try{
    const saved=localStorage.getItem(storageKey);
    if(names.includes(saved))current=saved;
  }catch{}
  const tab=name=>list.querySelector(`[data-${tabAttr}="${name}"]`);
  function show(name=current,{focus=false}={}){
    const visible=names.filter(n=>!tab(n).hidden);
    if(!visible.includes(name))name=visible[0]||names[0];
    current=name;
    try{localStorage.setItem(storageKey,name)}catch{}
    for(const button of list.querySelectorAll(`[data-${tabAttr}]`)){
      const active=button.getAttribute(`data-${tabAttr}`)===name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      // Roving tabindex: la liste d'onglets se parcourt aux flèches, pas au Tab.
      button.tabIndex=active?0:-1;
      if(active&&focus)button.focus();
    }
    for(const panel of document.querySelectorAll(`[data-${panelAttr}]`)){
      panel.classList.toggle('hidden',panel.getAttribute(`data-${panelAttr}`)!==name);
    }
  }
  list.addEventListener('click',event=>{
    const button=event.target.closest(`[data-${tabAttr}]`);
    if(button)show(button.getAttribute(`data-${tabAttr}`));
  });
  list.addEventListener('keydown',event=>{
    const step={ArrowLeft:1,ArrowRight:-1,Home:'first',End:'last'}[event.key];
    if(step===undefined)return;
    event.preventDefault();
    const visible=names.filter(n=>!tab(n).hidden);
    const index=visible.indexOf(current);
    const next=step==='first'?0:step==='last'?visible.length-1
      :(index+step+visible.length)%visible.length;
    show(visible[next],{focus:true});
  });
  return {show,get current(){return current}};
}

// Erreurs de saisie signalées champ par champ : le libellé du champ fautif
// passe en rouge avec son message dessous, le premier reçoit le focus, et
// corriger un champ efface aussitôt son signalement. `errors` associe l'id du
// contrôle à son message ; les formulaires `novalidate` s'en servent à la place
// des bulles du navigateur.
function clearFormErrors(form){
  form.querySelectorAll('.field-invalid').forEach(label=>label.classList.remove('field-invalid'));
  form.querySelectorAll('.field-error').forEach(note=>note.remove());
  form.querySelectorAll('[aria-invalid]').forEach(control=>control.removeAttribute('aria-invalid'));
}
function showFormErrors(form,errors){
  clearFormErrors(form);
  for(const [id,message] of Object.entries(errors)){
    const label=$(id).closest('label');
    label.classList.add('field-invalid');
    $(id).setAttribute('aria-invalid','true');
    const note=document.createElement('small');
    note.className='field-error';note.setAttribute('role','alert');note.textContent=message;
    label.append(note);
  }
  const first=Object.keys(errors)[0];
  if(!first)return;
  const control=$(first).dmyGroup?$(first).dmyGroup.querySelector('.dmy-part'):$(first);
  control.focus();
  control.scrollIntoView?.({block:'center',behavior:'smooth'});
}
function clearFieldErrorOnEdit(form){
  const clear=e=>{
    const label=e.target.closest('label.field-invalid');
    if(!label)return;
    label.classList.remove('field-invalid');
    label.querySelectorAll('.field-error').forEach(note=>note.remove());
    label.querySelectorAll('[aria-invalid]').forEach(control=>control.removeAttribute('aria-invalid'));
  };
  form.addEventListener('input',clear);
  form.addEventListener('change',clear);
}
// Une date saisie à moitié (jour sans année…) vaut '' pour le formulaire : on la distingue d'un champ vide.
function dateFieldState(id){
  if($(id).value)return 'complete';
  const parts=[...($(id).dmyGroup?.querySelectorAll('.dmy-part')||[])];
  return parts.some(part=>part.value)?'partial':'empty';
}
// Le champ visé par un refus du serveur se reconnaît à son libellé dans le message.
function serverErrorField(message,rules){
  return (rules.find(([text])=>String(message||'').includes(text))||[])[1];
}

function showEditForm(sectionId,formId,focusId){
  if(!$(sectionId)?.classList.contains('active-section'))go(sectionId);
  requestAnimationFrame(()=>{
    const form=$(formId),target=form?.closest('.panel')||form;
    if(!target)return;
    target.scrollIntoView({behavior:'smooth',block:'start'});
    target.classList.remove('editing-record');
    void target.offsetWidth;
    target.classList.add('editing-record');
    setTimeout(()=>target.classList.remove('editing-record'),1800);
    $(focusId)?.focus({preventScroll:true});
  });
}

async function refreshAll(){
  await load();
  renderDashboard();
  renderStudents();
  renderFees();
  renderPaymentHistory();
  renderTeachers();
  renderSalary();
  renderAdvances();
  renderExpenses();
  if($('exams')?.classList.contains('active-section')) renderExamSection();
  if($('settings')?.classList.contains('active-section')) {
    renderSettings();
    renderDepartments();
    renderStaffRoles();
  }
}
async function deleteWithPassword(path, confirmMessage, successMessage){
  if(!(await askConfirm(confirmMessage))) return false;
  if(!(await requirePassword())) return false;
  try{
    await api(path,{method:'DELETE'});
    await refreshAll();
    toast(successMessage);
    return true;
  }catch(error){
    toast(error.message || 'تعذر حذف السجل.');
    return false;
  }
}

// One round trip, and no session created: /login used to leave an unused token
// on the server for every confirmation.
async function requirePassword(){const p=await askInput('أدخل كلمة المرور لإتمام هذه العملية:');if(p===null)return false;try{const x=await api('/verify-password',{method:'POST',body:JSON.stringify({password:western(p)})});return Boolean(x.ok)}catch(error){toast(error.message||'كلمة المرور غير صحيحة.');return false}}
