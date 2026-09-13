// Impression partagée : ouverture de la fenêtre, feuilles de style et en-tête
// officiel de l'école. Les trois écrans qui impriment (les frais, les reçus et
// les relevés de notes des examens) passent par ici pour ne pas répéter le même document.

// Intitulés officiels : une base vide doit tout de même imprimer un en-tête
// complet. `settings.js` et `exams.js` remplissent leurs formulaires avec eux.
const OFFICIAL_HEADER_DEFAULTS={
  republic:'الجمهورية الإسلامية الموريتانية',
  ministry:'وزارة التعليم',
  regional:'الإدارة الجهوية للتعليم'
};
// Les listes A4 et les relevés de notes portent cette mention en mode test ;
// les reçus (frais, salaires, avances) ne l'affichent jamais.
const TEST_MODE_LABEL='نسخة للتجريب فقط';
const isTestMode=()=>state.settings?.applicationMode==='test';

// Tableaux imprimés sur A4 : listes de frais et relevés d'élève.
const PRINT_STYLE='*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#111;margin:14px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:0 0 10px;font-weight:400;color:#444}h3{font-size:14px;margin:14px 0 6px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:4px 5px;text-align:right}th{background:#eee}.notice{border:1px solid #999;border-radius:6px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}.notice h3{margin:0 0 6px;font-size:14px}.total{font-weight:900}.print{margin:10px 0;padding:8px 14px;border:0;background:#111;color:#fff;border-radius:5px;font-weight:700;cursor:pointer}@media print{.print{display:none}}';

// Reçus imprimés sur un rouleau de 80 mm.
const RECEIPT_STYLE='@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;font-family:Arial,Tahoma,sans-serif;color:#111}.receipt{width:72mm;margin:0 auto;padding:4mm 3mm;font-size:12px}.center{text-align:center}.school{font-size:15px;font-weight:900}.title{font-size:14px;font-weight:900;margin:4px 0}.line{border-top:1px dashed #555;margin:5px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:3px 0}.label{font-weight:700}.amount{font-size:14px;font-weight:900}.remaining{font-weight:900}.cancelled{color:#b3261e;border:2px solid #b3261e;padding:3px;margin:6px 0}.signature{margin-top:20px;text-align:left}.small{font-size:10px;color:#444}.print{margin-top:10px;width:100%;padding:8px;border:0;background:#111;color:#fff;border-radius:5px;font-weight:700}@media print{.print{display:none}} ';

// Écrit un document complet dans une fenêtre séparée. Le bloqueur de fenêtres
// surgissantes est le seul échec attendu, d'où le message dédié par appelant.
function printWindow({title,style,body,width,height,blockedMessage,autoPrint=false}){
  const w=window.open('','_blank',`width=${width},height=${height}`);
  if(!w){toast(blockedMessage);return null}
  // `<\/script>` : la balise fermante ne doit pas terminer ce script-ci.
  const auto=autoPrint?'<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>':'';
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${style}</style></head><body>${body}${auto}</body></html>`);
  w.document.close();
  return w;
}

// Page A4 : titre de l'école, sous-titre daté, puis le contenu de l'appelant.
function openPrintWindow(title,bodyHtml){
  const banner=isTestMode()?`<h2>${TEST_MODE_LABEL}</h2>`:'';
  const heading=`<h1>${esc(state.settings?.schoolName||'')}</h1>`
    +`<h2>${esc(title)} — السنة الدراسية ${esc(state.settings?.schoolYear||'')} — ${western(today())}</h2>`;
  return printWindow({
    title,
    style:PRINT_STYLE,
    body:`${heading}${banner}<button class="print" onclick="window.print()">طباعة</button>${bodyHtml}`,
    width:1000,
    height:760,
    blockedMessage:'اسمح للنوافذ المنبثقة حتى تتم الطباعة.'
  });
}

// En-tête officiel des relevés de notes : république, ministère, direction
// régionale, puis l'identité de l'école. `header` vient des réglages des
// examens ; à défaut, ce sont les intitulés par défaut qui sont imprimés.
// Attention : le formulaire de `exams.js` propose en plus les valeurs des
// réglages généraux, ce que l'impression ne fait pas.
function officialHeaderHtml(header={}){
  const line=key=>`<div>${esc(header[key]||OFFICIAL_HEADER_DEFAULTS[key])}</div>`;
  return (isTestMode()?`<div class="mode-badge">${TEST_MODE_LABEL}</div>`:'')
    +line('republic')
    +line('ministry')
    +line('regional')
    +`<div class="school-title">${esc(state.settings.schoolName||'')}</div>`
    +`<div class="phone">الهاتف: ${esc(header.schoolPhone||state.settings.schoolPhone||'')}</div>`
    +`<div>${esc(state.settings.schoolYear||'')}</div>`;
}
