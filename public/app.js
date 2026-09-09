setDate('registrationDate');setDate('teacherStart');setDate('salaryDate');setDate('advanceDate');setDate('expenseDate');toggleRoleFields();


checkApplicationMode();
setInterval(checkApplicationMode,15000);

// Consume the replacement session once; reload clears every old-mode form and record ID.
(async () => {
  const token = sessionStorage.getItem('modeSwitchToken');
  sessionStorage.removeItem('modeSwitchToken');
  if (!token) return;
  try { await enterApplication({token,settings:await api('/settings')}); }
  catch(error) { state.token = ''; toast(error.message); }
})();
