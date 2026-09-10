function xlsxXml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]))}
function xlsxColumnName(index){let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name}
function xlsxCrc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0}
function xlsxU16(value){return new Uint8Array([value&255,(value>>>8)&255])}
function xlsxU32(value){return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255])}
function xlsxSize(parts){return parts.reduce((total,part)=>total+part.length,0)}
function xlsxZip(files){
  const encoder=new TextEncoder(),localParts=[],centralParts=[];
  let offset=0;
  for(const file of files){
    const name=encoder.encode(file.name),data=encoder.encode(file.text),crc=xlsxCrc32(data);
    const local=[xlsxU32(0x04034b50),xlsxU16(20),xlsxU16(0x0800),xlsxU16(0),xlsxU16(0),xlsxU16(0),xlsxU32(crc),xlsxU32(data.length),xlsxU32(data.length),xlsxU16(name.length),xlsxU16(0),name,data];
    localParts.push(...local);
    centralParts.push(xlsxU32(0x02014b50),xlsxU16(20),xlsxU16(20),xlsxU16(0x0800),xlsxU16(0),xlsxU16(0),xlsxU16(0),xlsxU32(crc),xlsxU32(data.length),xlsxU32(data.length),xlsxU16(name.length),xlsxU16(0),xlsxU16(0),xlsxU16(0),xlsxU16(0),xlsxU32(0),xlsxU32(offset),name);
    offset+=xlsxSize(local);
  }
  const centralSize=xlsxSize(centralParts);
  const end=[xlsxU32(0x06054b50),xlsxU16(0),xlsxU16(0),xlsxU16(files.length),xlsxU16(files.length),xlsxU32(centralSize),xlsxU32(offset),xlsxU16(0)];
  return new Blob([...localParts,...centralParts,...end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function downloadXlsx(filename,sheetName,rows){
  const cells=rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>{
    const ref=xlsxColumnName(columnIndex)+(rowIndex+1);
    return typeof value==='number'&&Number.isFinite(value)?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxXml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const safeSheet=xlsxXml(String(sheetName||'Sheet1').slice(0,31));
  const files=[
    {name:'[Content_Types].xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
    {name:'_rels/.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
    {name:'xl/worksheets/sheet1.xml',text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetData>${cells}</sheetData></worksheet>`}
  ];
  const url=URL.createObjectURL(xlsxZip(files)),link=document.createElement('a');
  link.href=url;link.download=filename.endsWith('.xlsx')?filename:`${filename}.xlsx`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
