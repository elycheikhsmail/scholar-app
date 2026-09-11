// The school's official levels and monthly fees (MRU), in teaching order. One
// list feeds the production loader (apply-fees.js) and the test data
// generator (seed-testing.js), so both sides of the application agree.
const OFFICIAL_LEVELS = [
  { name: 'الحضانة', fee: 400, stage: 'روضة' },
  { name: 'التهجي', fee: 700, stage: 'روضة' },
  { name: 'التحضيري', fee: 800, stage: 'ابتدائي' },
  { name: '2AF', fee: 800, stage: 'ابتدائي' },
  { name: '3AF', fee: 800, stage: 'ابتدائي' },
  { name: '4AF', fee: 800, stage: 'ابتدائي' },
  { name: '5AF', fee: 800, stage: 'ابتدائي' },
  { name: '6AF', fee: 800, stage: 'ابتدائي' },
  { name: '1AS', fee: 1000, stage: 'إعدادي' },
  { name: '2AS', fee: 1000, stage: 'إعدادي' },
  { name: '3AS', fee: 1400, stage: 'إعدادي' },
  { name: '4AS', fee: 1400, stage: 'إعدادي' },
  { name: '5C', fee: 2000, stage: 'ثانوي' },
  { name: '5D', fee: 2000, stage: 'ثانوي' },
  { name: '6C', fee: 2000, stage: 'ثانوي' },
  { name: '6D', fee: 2000, stage: 'ثانوي' },
  { name: '7C', fee: 2500, stage: 'ثانوي' },
  { name: '7D', fee: 2500, stage: 'ثانوي' }
];
module.exports = { OFFICIAL_LEVELS };
