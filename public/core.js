const months=MONTHS;
const monthNumber=MONTH_NUMBER;
let state={token:'',settings:null,data:null,departments:[],examData:{settings:{},exams:[]}};
const $=id=>document.getElementById(id);
const API_BASE=window.location.protocol==='file:'?'http://127.0.0.1:3780/api':'/api';
const money=n=>Number(n||0).toLocaleString('en-US',{useGrouping:true,maximumFractionDigits:2});
const western=v=>String(v??'').replace(/[٠-٩۰-۹]/g,d=>String(Math.max('٠١٢٣٤٥٦٧٨٩'.indexOf(d),'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));

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

const today=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>{const m=new Date().getMonth()+1;return m>=10?months[m-10]:m<=6?months[m+2]:months[0]};
const debounce=(fn,ms=200)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms)}};
// The total view is an extra entry in the fee selector only; the selectors that
// pick which fee a payment settles must stay a plain list of months.
const monthOptionsHtml=()=>`<option value="${REGISTRATION}">${REGISTRATION}</option>`+MONTHS.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(state.token)headers.Authorization=`Bearer ${state.token}`;return fetch(`${API_BASE}${path}`,{...options,headers}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&state.token&&path!=='/login')location.reload();throw Error(x.error||'حدث خطأ.');}return x})}
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',3200)}
function setDate(id){if($(id)&&!$(id).value)$(id).value=today()}
function tick(){const d=new Date();$('clock').textContent=western(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d));$('today').textContent=western(new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d))}
setInterval(tick,1000);tick();
document.addEventListener('input',e=>{if(e.target.matches('input[type=number],input[inputmode="numeric"]'))e.target.value=western(e.target.value)});

async function load(){state.data=await api('/data');state.departments=await api('/departments');state.examData=await api('/exams');populateDepartments();populateExamDepartments();refreshStudentFeeDetails()}
function applySettings(){applyApplicationMode(state.settings.applicationMode);$('schoolName').textContent=state.settings.schoolName;$('schoolYear').textContent=state.settings.schoolYear;$('loginSchoolName').textContent=state.settings.schoolName;$('managerNameHome').textContent=state.settings.managerName||'غير محدد';$('managerPhoneHome').textContent=western(state.settings.managerPhone||'');$('appVersion').textContent=western(state.settings.version||window.schoolAPI?.version||'—')}
function setupMonths(id){$(id).innerHTML=months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}
$('feeMonth').innerHTML=monthOptionsHtml();setupMonths('salaryMonth');setupMonths('advanceMonth');$('feeMonth').value=currentMonth();$('salaryMonth').value=currentMonth();$('advanceMonth').value=currentMonth();

async function enterApplication(x){state.token=x.token;state.settings=x.settings;await load();$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');applySettings();resetStudent();resetTeacher();resetExpense();resetSalaryDates();resetAdvance();const requested=sectionFromLocation();go(requested||'dashboard',{historyMode:requested?'none':'replace'})}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const x=await api('/login',{method:'POST',body:JSON.stringify({username:western($('loginUsername').value),password:western($('loginPassword').value)})});await enterApplication(x)}catch(err){toast(err.message)}});
$('logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}location.reload()};
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.section));
const APP_SECTIONS=new Set([...document.querySelectorAll('.nav-item[data-section]')].map(item=>item.dataset.section));
function sectionFromLocation(){
  try{
    const section=decodeURIComponent(location.hash.slice(1));
    return APP_SECTIONS.has(section)?section:null;
  }catch{return null}
}
function go(id,{historyMode='push'}={}){
  if(!APP_SECTIONS.has(id))id='dashboard';
  const targetHash=`#${id}`;
  if(historyMode!=='none'&&location.hash!==targetHash){
    history[historyMode==='replace'?'replaceState':'pushState'](null,'',targetHash);
  }
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===id));
  document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active-section',x.id===id));
  if(id==='dashboard')renderDashboard();
  if(id==='students')renderStudents();
  if(id==='fees')renderFees();
  if(id==='collections')renderPaymentHistory();
  if(id==='staff'){renderTeachers();renderSalary();renderAdvances()}
  if(id==='expenses')renderExpenses();
  if(id==='exams')renderExamSection();
  if(id==='reports')renderReports();
  if(id==='settings'){renderSettings();renderDepartments()}
}
function followLocation(){
  if($('app').classList.contains('hidden'))return;
  const requested=sectionFromLocation();
  if(requested)go(requested,{historyMode:'none'});
  else go('dashboard',{historyMode:'replace'});
}
window.addEventListener('hashchange',followLocation);
window.addEventListener('popstate',followLocation);

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
