// Student dues engine, shared by the browser UI and the server (db.js).
//
// Three rules it exists to enforce:
//   1. Registration immediately charges both the registration fee and June;
//      every other monthly fee falls due on the first day of its own month.
//   2. A payment is a credit on the account, allocated to the oldest unpaid
//      charge first, so paying several months at once clears them all.
//   3. Fees are not a property of the student. The school sets one registration
//      fee and one monthly fee per level, both in the settings, and every charge
//      reads them from there, so a fee corrected once is corrected everywhere.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : globalThis, function () {

const MONTHS = ['أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو'];
const MONTH_NUMBER = {أكتوبر:10,نوفمبر:11,ديسمبر:12,يناير:1,فبراير:2,مارس:3,أبريل:4,مايو:5,يونيو:6};
const REGISTRATION = 'رسوم التسجيل';
const ACTIVE_STATUS = 'نشط';
const LEFT_STATUSES = ['منقطع','محوَّل','متخرج'];
const STUDENT_STATUSES = [ACTIVE_STATUS, ...LEFT_STATUSES];
const DISCOUNT_TYPES = ['', 'percent', 'amount'];
const DISCOUNT_LABELS = { percent: 'نسبة مئوية', amount: 'مبلغ ثابت' };

// One vocabulary for the state of a due, shared by the month view, the total
// view and the dues filters. Before this, the same situation could be called
// «تم الدفع» in one table, «مسدَّد بالكامل» in the next and «مسدَّد» on a filter chip.
const FEE_STATUS_LABELS = {
  outside: 'خارج فترة القيد',   // the student was not enrolled that month
  none: 'بلا رسوم',             // enrolled, but nothing is charged
  paid: 'مسدَّد بالكامل',
  late: 'متأخر',                // still owing after the due date
  partial: 'عليه متبقٍّ',        // part paid, not yet late
  unpaid: 'لم يُدفع بعد'         // nothing paid, not yet late
};
const FEE_STATUS_CLASSES = {
  outside: 'status-exempt', none: 'status-exempt', paid: 'status-paid',
  late: 'status-unpaid', partial: 'status-partial', unpaid: 'status-unpaid'
};

// `charge` is a ledger row, or null when the student is outside the period.
function feeStatusKey(charge, today) {
  if (!charge) return 'outside';
  if (!(charge.amount > 0)) return 'none';
  if (!(charge.remaining > 0)) return 'paid';
  if (charge.dueDate && String(today) > charge.dueDate) return 'late';
  return charge.paid > 0 ? 'partial' : 'unpaid';
}
function feeStatusOf(charge, today) {
  const key = feeStatusKey(charge, today);
  return [FEE_STATUS_LABELS[key], FEE_STATUS_CLASSES[key], key];
}

// The filters name the same states, so a chip and a row never disagree.
const FEE_FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'due', label: FEE_STATUS_LABELS.partial },
  { value: 'late', label: FEE_STATUS_LABELS.late },
  { value: 'paid', label: FEE_STATUS_LABELS.paid },
  { value: 'none', label: FEE_STATUS_LABELS.none }
];

// Money is entered to two decimals; rounding keeps allocation remainders exact.
function round2(value) { return Math.round((Number(value) || 0) * 100) / 100; }

function startYearOf(schoolYear) {
  return parseInt(String(schoolYear || '').split('/')[0].trim(), 10) || new Date().getFullYear();
}

// School months run October..June, so June belongs to the following calendar year.
function calendarYearOf(month, startYear) {
  return MONTH_NUMBER[month] >= 10 ? startYear : startYear + 1;
}

function monthDate(month, startYear, day = 1) {
  const mn = MONTH_NUMBER[month] || 10;
  const year = calendarYearOf(month, startYear);
  const last = new Date(year, mn, 0).getDate();
  const safeDay = Math.min(Math.max(1, Number(day) || 1), last);
  return `${year}-${String(mn).padStart(2,'0')}-${String(safeDay).padStart(2,'0')}`;
}

// Which school month a calendar date falls in, clamped to the year's own range:
// anything before October counts as the first month, anything after June the last.
function monthIndexOf(dateStr, startYear) {
  const text = String(dateStr || '');
  const year = parseInt(text.slice(0,4), 10), mn = parseInt(text.slice(5,7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(mn) || mn < 1 || mn > 12) return null;
  const offset = (year * 12 + (mn - 1)) - (startYear * 12 + 9);
  return Math.min(Math.max(offset, 0), MONTHS.length - 1);
}

// The two fees the school sets. `settings` carries the school's own values and
// the list of levels (departments), so both sides of the application resolve a
// fee the same way: the level's fee if it has one, the default otherwise.
function registrationFeeFor(settings) {
  return round2(Math.max(0, Number(settings && settings.registrationFee) || 0));
}

function departmentFeeOf(settings, className) {
  const departments = Array.isArray(settings && settings.departments) ? settings.departments : [];
  const department = departments.find(d => String(d && d.name) === String(className || ''));
  const fee = department ? Number(department.monthlyFee) : NaN;
  return Number.isFinite(fee) ? Math.max(0, fee) : null;
}

// The monthly fee is fixed for the whole year: it depends on the student's
// level, never on the month.
function monthlyFeeFor(student, settings) {
  const levelFee = departmentFeeOf(settings, student && student.className);
  return round2(levelFee === null ? Math.max(0, Number(settings && settings.defaultMonthlyFee) || 0) : levelFee);
}

// A scholarship or sibling discount reduces the monthly fee, never the
// registration fee, and can never take a charge below zero.
function discountOn(student, gross) {
  const type = String((student && student.discountType) || '');
  const value = Math.max(0, Number(student && student.discountValue) || 0);
  if (!value || gross <= 0) return 0;
  if (type === 'percent') return round2(gross * Math.min(value, 100) / 100);
  if (type === 'amount') return round2(Math.min(gross, value));
  return 0;
}

function enrolmentIndex(student, startYear) {
  const index = monthIndexOf(student && student.registrationDate, startYear);
  return index === null ? 0 : index;
}

function departureIndex(student, startYear) {
  const index = monthIndexOf(student && student.leaveDate, startYear);
  return index === null ? MONTHS.length - 1 : index;
}

// Monthly fees are prepaid: each falls due on the first day of its month.
// June is the exception required at enrolment, alongside the registration fee.
function dueDateFor(student, month, startYear) {
  const registrationDate = (student && student.registrationDate) || monthDate(MONTHS[0], startYear, 1);
  if (month === REGISTRATION || month === 'يونيو') return registrationDate;
  return monthDate(month, startYear, 1);
}

// Settlement priority is registration, June, then the remaining school months.
// This makes money received at enrolment clear the two compulsory charges first.
function chargesFor(student, settings) {
  const startYear = startYearOf(settings && settings.schoolYear);
  const first = enrolmentIndex(student, startYear);
  const last = departureIndex(student, startYear);
  const registration = registrationFeeFor(settings);
  const charges = [{
    month: REGISTRATION,
    dueDate: dueDateFor(student, REGISTRATION, startYear),
    gross: registration, discount: 0, amount: registration
  }];
  const gross = monthlyFeeFor(student, settings);
  const discount = discountOn(student, gross);
  charges.push({
    month: 'يونيو',
    dueDate: dueDateFor(student, 'يونيو', startYear),
    gross, discount, amount: round2(gross - discount)
  });
  for (let i = first; i <= last; i++) {
    if (MONTHS[i] === 'يونيو') continue;
    charges.push({
      month: MONTHS[i],
      dueDate: dueDateFor(student, MONTHS[i], startYear),
      gross, discount, amount: round2(gross - discount)
    });
  }
  return charges;
}

// Payments settle charges oldest first, in the order the receipts were issued
// (invoice sequence = id). A month only starts receiving money once the one
// before it is fully paid. Ordering by id rather than by the entered date keeps
// what an already printed receipt covers stable when a later receipt is edited
// or backdated. Whatever is left over stays on the account as a credit.
function allocate(charges, payments) {
  const ordered = (payments || []).slice().sort((a,b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  const rows = charges.map(charge => ({ ...charge, paid: 0, remaining: charge.amount, allocations: [] }));
  let index = 0, credit = 0;
  for (const payment of ordered) {
    let left = round2(Math.max(0, Number(payment.amount) || 0));
    while (left > 0 && index < rows.length) {
      const row = rows[index];
      if (row.remaining <= 0) { index++; continue; }
      const take = round2(Math.min(left, row.remaining));
      row.paid = round2(row.paid + take);
      row.remaining = round2(row.remaining - take);
      left = round2(left - take);
      row.allocations.push({ paymentId: payment.id, invoiceNo: payment.invoiceNo, date: payment.date, time: payment.time, amount: take });
      if (row.remaining <= 0) index++;
    }
    credit = round2(credit + left);
  }
  return { rows, credit };
}

function ledgerFor(student, payments, settings) {
  const charges = chargesFor(student, settings);
  const { rows, credit } = allocate(charges, payments);
  const byMonth = new Map(rows.map(row => [row.month, row]));
  // A whole calendar month becomes due at once. The exact due day still decides
  // whether an unpaid current-month fee is late, but never postpones the month
  // itself into the future balance.
  const asOf = String((settings && settings.asOf) || new Date().toISOString().slice(0,10));
  const monthEnd = /^\d{4}-\d{2}/.test(asOf) ? `${asOf.slice(0,7)}-31` : asOf;
  const accruedRows = rows.filter(row => !row.dueDate || row.dueDate <= monthEnd);
  const totalDue = round2(accruedRows.reduce((sum,row) => sum + row.amount, 0));
  const allocated = round2(accruedRows.reduce((sum,row) => sum + row.paid, 0));
  const unpaid = accruedRows.filter(row => row.remaining > 0);
  const scheduledTotalDue = round2(rows.reduce((sum,row) => sum + row.amount, 0));
  const scheduledAllocated = round2(rows.reduce((sum,row) => sum + row.paid, 0));
  return {
    rows, accruedRows, byMonth, credit,
    totalDiscount: round2(accruedRows.reduce((sum,row) => sum + (row.discount || 0), 0)),
    scheduledTotalDiscount: round2(rows.reduce((sum,row) => sum + (row.discount || 0), 0)),
    unpaidCount: unpaid.length,
    oldestUnpaid: unpaid[0] || null,
    totalDue,
    totalPaid: round2(scheduledAllocated + credit),
    allocated,
    outstanding: round2(totalDue - allocated),
    scheduledTotalDue,
    scheduledAllocated,
    scheduledOutstanding: round2(scheduledTotalDue - scheduledAllocated)
  };
}

// A normal balance stops at the current month. Once a family deliberately pays
// a future month, its receipt extends the balance only as far as that selected
// month, never through the rest of the school year.
function outstandingThrough(ledger, month) {
  const selectedIndex = ledger&&Array.isArray(ledger.rows)?ledger.rows.findIndex(row=>row.month===month):-1;
  const accruedIndex = (ledger && ledger.accruedRows ? ledger.accruedRows.length : 0) - 1;
  const end = Math.max(accruedIndex, selectedIndex);
  return round2((ledger && ledger.rows ? ledger.rows : []).slice(0,end + 1)
    .reduce((sum,row) => sum + Math.max(0, Number(row.remaining) || 0), 0));
}

return { MONTHS, MONTH_NUMBER, REGISTRATION, ACTIVE_STATUS, LEFT_STATUSES, STUDENT_STATUSES,
  DISCOUNT_TYPES, DISCOUNT_LABELS,
  FEE_STATUS_LABELS, FEE_STATUS_CLASSES, FEE_FILTERS, feeStatusKey, feeStatusOf,
  round2, startYearOf, monthDate, monthIndexOf,
  registrationFeeFor, departmentFeeOf, monthlyFeeFor, discountOn,
  enrolmentIndex, departureIndex, dueDateFor, chargesFor, allocate, ledgerFor, outstandingThrough };
});
