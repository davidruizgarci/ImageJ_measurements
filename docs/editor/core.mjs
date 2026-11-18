// Pure measurement/ROI/OOXML logic. Image coordinates are never resized.
export const VIEWS=['Dorsal','Ventral'];
export const HEIGHTS=['R38','R40','R42','R44'];
export const length=points=>points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
export function geometry(points,width,height){
  if(!Array.isArray(points)||points.length<2||points.length>65535)throw Error('Una línea necesita entre 2 y 65535 puntos.');
  if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n))||p[0]<0||p[1]<0||p[0]>=width||p[1]>=height))throw Error('Hay coordenadas fuera de la foto. Comprueba su tamaño y orientación.');
  if(length(points)<=0)throw Error('La línea tiene longitud cero.');
}
export function readROI(bytes,filename='selection.roi'){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),d=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const check=(o,n)=>{if(o<0||o+n>b.length)throw Error('ROI truncado: '+filename);};
  const u16=o=>{check(o,2);return d.getUint16(o);},i16=o=>{check(o,2);return d.getInt16(o);},i32=o=>{check(o,4);return d.getInt32(o);},f32=o=>{check(o,4);return d.getFloat32(o);};
  check(0,64);if(String.fromCharCode(...b.slice(0,4))!=='Iout'||u16(4)<217)throw Error('Formato ROI no compatible: '+filename);
  const type=b[6],options=u16(50);if(![3,4,5].includes(type)||u16(48)!==0)throw Error('Solo líneas rectas, segmentadas o libres: '+filename);
  if(type!==3&&(options&1))throw Error('Desactiva Fit Spline en Fiji antes de importar: '+filename);
  let points;
  if(type===3)points=[[f32(18),f32(22)],[f32(26),f32(30)]];
  else{
    const n=u16(16);if(n<2)throw Error('ROI sin puntos: '+filename);check(64,4*n);
    if(options&128){check(64,12*n);points=Array.from({length:n},(_,i)=>[f32(64+4*n+4*i),f32(64+8*n+4*i)]);}
    else points=Array.from({length:n},(_,i)=>[u16(64+2*i)+i16(10),u16(64+2*n+2*i)+i16(8)]);
  }
  let name=filename.split('/').pop().replace(/\.roi$/i,'');const h=i32(60);
  if(h>=64&&h+24<=b.length){const p=i32(h+16),n=i32(h+20);if(p>=64&&n>0&&n<10000&&p+n*2<=b.length)name=Array.from({length:n},(_,i)=>String.fromCharCode(u16(p+i*2))).join('');}
  const id=/^(R\d{2})(?:$|[_ .-])/.exec(name)?.[1]||null;
  return{id,name,type,points,status:'proposed',note:''};
}
export function writeROI(roi){
  const p=roi.points,n=p.length,type=n===2?3:5,name=roi.name||roi.id||'Calibracion',coords=type===3?0:12*n,h=64+coords,np=h+64;
  const b=new Uint8Array(np+name.length*2),d=new DataView(b.buffer);b.set([73,111,117,116]);d.setUint16(4,228);b[6]=type;
  const left=Math.floor(Math.min(...p.map(p=>p[0]))),top=Math.floor(Math.min(...p.map(p=>p[1])));
  if(left<0||top<0||left>32767||top>32767)throw Error('Coordenadas fuera del rango ImageJ admitido.');
  d.setInt16(8,top);d.setInt16(10,left);d.setInt16(12,Math.min(32767,Math.ceil(Math.max(...p.map(p=>p[1])))));d.setInt16(14,Math.min(32767,Math.ceil(Math.max(...p.map(p=>p[0])))));
  if(type===3){[18,22,26,30].forEach((o,i)=>d.setFloat32(o,p[Math.floor(i/2)][i%2]));}
  else{d.setUint16(16,n);d.setUint16(50,128);p.forEach((q,i)=>{d.setUint16(64+2*i,Math.round(q[0]-left));d.setUint16(64+2*n+2*i,Math.round(q[1]-top));d.setFloat32(64+4*n+4*i,q[0]);d.setFloat32(64+8*n+4*i,q[1]);});}
  d.setUint16(34,2);d.setUint32(40,0xff00d6c5);d.setInt32(60,h);d.setInt32(h+16,np);d.setInt32(h+20,name.length);
  for(let i=0;i<name.length;i++)d.setUint16(np+2*i,name.charCodeAt(i));return b;
}
export function scale(view){return view.calibration&&Number.isFinite(view.knownCm)&&view.knownCm>0?length(view.calibration.points)/view.knownCm:null;}
export function included(roi,sex){return roi&&roi.status!=='excluded'&&!(roi.id==='R33'&&sex==='female');}
export function calculate(project,catalog){
  const candidates={};
  for(const v of VIEWS){const view=project.views[v],s=scale(view);for(const r of view.rois){if(!catalog.some(c=>c.id===r.id))throw Error('ID desconocido: '+r.id);if(included(r,project.sex))(candidates[r.id]??=[]).push({...r,view:v,px:length(r.points),cm:s?length(r.points)/s:null});}}
  const tlCandidates=candidates.R03||[],tl=tlCandidates.find(r=>r.view===project.tlView)?.cm||null;
  const conflicts=[];
  const rows=catalog.map(c=>{const cc=candidates[c.id]||[];let r=cc[0];if(cc.length>1){r=cc.find(r=>r.view===project.preferences[c.id]);if(!r)conflicts.push(c.id);}
    const omitted=VIEWS.map(v=>({...project.views[v].rois.find(r=>r.id===c.id),view:v})).find(r=>r.id&&(r.status==='excluded'||(c.id==='R33'&&project.sex==='female')));
    return{...c,view:r?.view||omitted?.view||'',cm:r?.cm??null,percent:r?.cm!=null&&tl?r.cm/tl*100:null,px:r?.px??null,status:r?.status||((c.id==='R33'&&project.sex==='female')?'not-applicable':omitted?'excluded':'missing'),note:r?.note||omitted?.note||'',method:r?(r.points.length===2?'Recta':'Trayecto segmentado/libre sin spline'):''};});
  return{rows,tl,conflicts,candidates};
}
export function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else cell+=c;}
  row.push(cell.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);if(quoted)throw Error('CSV con comillas sin cerrar.');
  const head=rows.shift()?.map(x=>x.replace(/^\uFEFF/,''));return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]||''])));
}
export const csv=rows=>'\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
const xml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const col=n=>{let r='';for(n++;n;n=Math.floor((n-1)/26))r=String.fromCharCode(65+(n-1)%26)+r;return r;};
// Minimal standards-based XLSX: values only, no drawings, printer settings or formulas.
export function workbookFiles(sheets){
  const files={},enc=s=>new TextEncoder().encode(s),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  files['[Content_Types].xml']=enc('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>');
  files['_rels/.rels']=enc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  files['xl/workbook.xml']=enc(`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`+sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>');
  files['xl/_rels/workbook.xml.rels']=enc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  files['xl/styles.xml']=enc(`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF163E4A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=enc(`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freeze||2}" topLeftCell="A${(s.freeze||2)+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>`+(s.widths||[12,46,18,18,18,18,65,26]).map((w,j)=>`<col min="${j+1}" max="${j+1}" width="${w}" customWidth="1"/>`).join('')+'</cols><sheetData>'+s.rows.map((r,y)=>`<row r="${y+1}">`+r.map((v,x)=>{const a=`r="${col(x)}${y+1}"`;if(v==null)return `<c ${a}/>`;if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Número no válido en Excel.');return `<c ${a} s="1"><v>${v}</v></c>`;}return `<c ${a} s="${y===(s.header??1)?2:0}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;}).join('')+'</row>').join('')+'</sheetData></worksheet>');});return files;
}
export const STATUS={proposed:'Propuesta',reviewed:'Revisada',excluded:'Descartada',missing:'Sin medida','not-applicable':'No aplica'};
export function excelSheets(project,catalog,view=null){
  const calc=calculate(project,catalog);if(calc.conflicts.length)throw Error('Elige la vista para: '+calc.conflicts.join(', '));
  const rows=view?catalog.map(c=>{const r=calc.candidates[c.id]?.find(r=>r.view===view),omitted=project.views[view].rois.find(r=>r.id===c.id);return{...c,view:r?.view||omitted&&view||'',cm:r?.cm??null,percent:r?.cm!=null&&calc.tl?r.cm/calc.tl*100:null,px:r?.px??null,status:r?.status||(c.id==='R33'&&project.sex==='female'?'not-applicable':omitted?'excluded':'missing'),note:r?.note||omitted?.note||'',method:r?(r.points.length===2?'Recta':'Trayecto segmentado/libre sin spline'):''};}):calc.rows;
  const notes=r=>[r.note,r.method&&'Método: '+r.method,r.cm!=null&&project.views[r.view].scaleNote&&'Escala: '+project.views[r.view].scaleNote].filter(Boolean).join(' | ');
  return[{name:'Medidas',rows:[[project.specimen+' · '+(view||'Dorsal + Ventral')],['ID','Medida','Vista','cm','%TL','Longitud (px)','Observaciones','Estado'],...rows.map(r=>[r.id,r.measurement,r.view,r.cm,r.percent,r.px,notes(r),STATUS[r.status]])]},
    {name:'Copiar_dataset',widths:[46,18,18,12],rows:[['Orden de Measurements.xlsx · pegar solo valores B3:C51'],['Medida','cm','%TL','ID'],...rows.map(r=>[r.measurement,r.cm,r.percent,r.id])]},
    {name:'Calibracion',widths:[22,25,22,20,65],rows:[[project.specimen,'Sexo: '+({male:'Macho',female:'Hembra',unknown:'Sin indicar'}[project.sex])],['Vista','Dimensiones (px)','Referencia (cm)','px/cm','Observaciones'],...VIEWS.map(v=>{const w=project.views[v];return[v,w.width?`${w.width} × ${w.height}`:'',w.knownCm||null,scale(w),w.scaleNote];}),['TL de referencia',calc.tl,'cm',project.tlView],['Estado','Las propuestas y puntos ocultos requieren revisión. Las medidas ausentes permanecen vacías.'],['Generado',new Date().toISOString()]]}];
}
