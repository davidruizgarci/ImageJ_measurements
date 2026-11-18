import catalog from './catalog.mjs';
import {VIEWS,HEIGHTS,length,geometry,readROI,writeROI,scale,calculate,parseCSV,csv,workbookFiles,excelSheets,STATUS} from './core.mjs';
import {tr,localize,setLanguage,getLanguage} from './i18n.mjs';
const $=id=>document.getElementById(id),enc=new TextEncoder(),dec=new TextDecoder();
const emptyView=()=>({imageName:'',width:0,height:0,rois:[],calibration:null,knownCm:null,scaleNote:''});
let project={format:'radula-project',version:1,specimen:'Nuevo_ejemplar',sex:'unknown',tlView:'Ventral',preferences:{},views:{Dorsal:emptyView(),Ventral:emptyView()}};
let viewName='Ventral',selected='R03',images={},undo=[],redo=[],dirty=false,mode=null,draft=[],vertex=null,drag=null,camera={x:0,y:0,k:1},lastPoint=null,busy=false;
const cv=$('canvas'),ctx=cv.getContext('2d'),vp=$('viewport');
const view=()=>project.views[viewName],roi=()=>view().rois.find(r=>r.id===selected),fmt=n=>n==null?'—':n.toLocaleString(getLanguage()==='en'?'en-GB':'es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const syncValue=(id,value)=>{if(document.activeElement!==$(id))$(id).value=value;};
function notify(t,error=false){$('message').textContent=t;$('message').className=error?'error':'success';localize($('message'));}
function checkpoint(){undo.push(JSON.stringify(project));if(undo.length>60)undo.shift();redo=[];dirty=true;}
function history(back){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(JSON.stringify(project));project=JSON.parse(from.pop());dirty=true;cancel();render();}
function safeName(s){return(s||'Ejemplar').normalize('NFKC').replace(/[^\p{L}\p{N}_ .-]/gu,'_').slice(0,100).replace(/^\.+/,'')||'Ejemplar';}
function download(data,name,type='application/zip'){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function unpack(bytes){let total=0;return fflate.unzipSync(bytes,{filter:f=>{total+=f.originalSize;if(f.originalSize>150*1024*1024||total>350*1024*1024)throw Error('ZIP demasiado grande (máximo 350 MB descomprimido).');return !f.name.endsWith('/')&&!f.name.includes('__MACOSX');}});}
async function action(fn){if(busy)return;busy=true;$('export').disabled=true;try{await fn();}catch(e){console.error(e);notify(e.message||String(e),true);}finally{busy=false;render();}}
function bounds(points,v=view()){if(!v.width)throw Error('Carga primero la fotografía exacta para comprobar sus coordenadas.');geometry(points,v.width,v.height);}
function validateIds(rois){const ids=new Set();for(const r of rois){if(!r.id||!catalog.some(c=>c.id===r.id))throw Error('ROI sin ID R03–R51 válido: '+r.name);if(ids.has(r.id))throw Error('ID duplicado: '+r.id);ids.add(r.id);bounds(r.points);}}
async function decodeImage(file){
  const bytes=new Uint8Array(await file.arrayBuffer());let drawable,width,height;
  if(/\.tiff?$/i.test(file.name)||/tiff/.test(file.type)){
    const buffer=bytes.buffer,ifds=UTIF.decode(buffer);if(ifds.length!==1)throw Error('Utiliza un TIFF de una sola imagen.');const page=ifds[0];UTIF.decodeImage(buffer,page);width=page.width;height=page.height;
    if(width*height>60000000)throw Error('Imagen demasiado grande (máximo 60 megapíxeles).');
    if(page.t274&&page.t274[0]!==1)throw Error('Este TIFF tiene orientación EXIF pendiente. Usa el TIFF de trabajo con orientación explícita del paquete.');
    const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(page)),width,height),0,0);drawable=c;
  }else{drawable=await createImageBitmap(file,{imageOrientation:'from-image'});width=drawable.width;height=drawable.height;if(width*height>60000000){drawable.close();throw Error('Imagen demasiado grande (máximo 60 megapíxeles).');}}
  return{bytes,name:file.name,drawable,width,height};
}
async function loadImage(file){if(!file)return;const current=viewName,im=await decodeImage(file),v=project.views[current];
  if(v.width&&(im.width!==v.width||im.height!==v.height)&&(v.rois.length||v.calibration))throw Error(`La foto mide ${im.width} × ${im.height}; los ROI están asociados a ${v.width} × ${v.height}. Carga la imagen original del paquete.`);
  for(const r of [...v.rois,...(v.calibration?[v.calibration]:[])])geometry(r.points,im.width,im.height);
  checkpoint();images[current]?.drawable.close?.();images[current]=im;Object.assign(v,{imageName:im.name,width:im.width,height:im.height});undo=[];redo=[];fit();notify(`Foto ${current.toLowerCase()}: ${im.width} × ${im.height} px. Confirma visualmente la alineación de los ROI.`);
}
async function loadROIs(file){if(!file)return;if(!view().width)throw Error('Carga primero la fotografía.');const files=unpack(new Uint8Array(await file.arrayBuffer())),rois=[];let cal=null;
  for(const [name,bytes] of Object.entries(files)){if(!/\.roi$/i.test(name))continue;const r=readROI(bytes,name);if(!r.id){if(/calibra|scale|escala/i.test(r.name)){if(cal)throw Error('El ZIP contiene varias calibraciones. Importa una por separado.');if(r.points.length!==2)throw Error('La escala necesita una línea recta.');cal=r;}else throw Error('ROI sin ID válido: '+r.name);}else rois.push(r);}
  if(!rois.length)throw Error('El ZIP no contiene medidas R03–R51.');validateIds(rois);if(cal)bounds(cal.points);
  if(view().rois.length&&!confirm(tr('Esto sustituirá las líneas de esta vista. Puedes deshacerlo. ¿Continuar?')))return;
  const old=new Map(view().rois.map(r=>[r.id,r]));for(const r of rois){r.note=old.get(r.id)?.note||'';r.status='proposed';}
  checkpoint();view().rois=rois;if(cal)view().calibration=cal;selected=rois[0].id;notify(`${rois.length} medidas cargadas en ${viewName}. Revisa su posición y calibra la escala.`);
}
async function loadCalibration(file){if(!file)return;const r=readROI(new Uint8Array(await file.arrayBuffer()),file.name);if(r.points.length!==2)throw Error('La calibración necesita una línea recta.');bounds(r.points);checkpoint();view().calibration={...r,id:null,name:'Calibracion'};notify('Línea de escala cargada. Introduce su longitud real en cm.');}
async function loadNotes(file){if(!file)return;const rows=parseCSV(await file.text());let n=0;checkpoint();for(const row of rows){const id=row.id||row.ID,note=row.note||row.Observaciones||row.observaciones||'';for(const name of VIEWS){if(row.view&&row.view!==name)continue;const r=project.views[name].rois.find(r=>r.id===id);if(r&&note){r.note=note;n++;}}}notify(`${n} observaciones importadas. No se han sustituido coordenadas ni números.`);}
function buildList(calc){
  const search=$('search').value.toLowerCase(),filter=$('filter').value,list=$('measure-list');list.replaceChildren();
  for(const c of catalog){const r=view().rois.find(r=>r.id===c.id);if(search&&!`${c.id} ${c.measurement}`.toLowerCase().includes(search))continue;if(filter==='available'&&!r||['proposed','reviewed'].includes(filter)&&r?.status!==filter)continue;
    const b=document.createElement('button');b.className='measure-row'+(selected===c.id?' active':'')+(r?' '+r.status:'');b.setAttribute('aria-current',String(selected===c.id));
    const id=document.createElement('span');id.className='rid';id.textContent=c.id;const name=document.createElement('span');name.className='rname';name.textContent=c.measurement;const state=document.createElement('span');state.className='rstatus';state.textContent=c.id==='R33'&&project.sex==='female'?'No aplica · hembra':r?STATUS[r.status]:HEIGHTS.includes(c.id)?'Requiere vista lateral':'Sin línea';name.append(state);
    const val=document.createElement('span');val.className='rval';const s=scale(view());val.textContent=r&&r.status!=='excluded'&&s&&!(c.id==='R33'&&project.sex==='female')?fmt(length(r.points)/s):'—';b.append(id,name,val);b.onclick=()=>{selected=c.id;vertex=null;cancel();render();};const item=document.createElement('div');item.setAttribute('role','listitem');item.append(b);list.append(item);
  }
}
function render(){
  const v=view(),r=roi(),calc=calculate(project,catalog),s=scale(v);syncValue('specimen',project.specimen);$('sex').value=project.sex;$('tl-view').value=project.tlView;
  $('tl-number').textContent=fmt(calc.tl);$('count-number').textContent=calc.rows.filter(r=>r.cm!=null).length+' / 49';$('review-number').textContent=calc.rows.filter(r=>r.status==='reviewed'&&r.cm!=null).length;
  for(const name of VIEWS){const low=name.toLowerCase();$('tab-'+low).setAttribute('aria-selected',String(name===viewName));$('dot-'+low).className=images[name]?'loaded':'';}
  $('image-info').textContent=v.width?`${v.imageName} · ${v.width} × ${v.height} px`:'Ninguna imagen cargada';$('roi-info').textContent=v.rois.length?`${v.rois.length} líneas editables · ${v.rois.filter(r=>r.status==='reviewed').length} revisadas`:'Líneas rectas o segmentadas de ImageJ';
  syncValue('known-cm',v.knownCm??'');syncValue('scale-note',v.scaleNote);$('scale-badge').textContent=s?'Definida':'Pendiente';$('scale-info').textContent=s?`${s.toFixed(6)} px/cm · línea de ${fmt(length(v.calibration.points))} px`:'Carga o dibuja la línea e indica su longitud.';
  $('empty').hidden=!!images[viewName];$('empty-view').textContent=viewName.toLowerCase();$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
  $('selected-id').textContent=selected;$('selected-name').textContent=catalog.find(c=>c.id===selected)?.measurement;$('method').textContent=r?(r.points.length===2?'Recta':`Trayecto · ${r.points.length} vértices · sin spline`):'Sin línea en esta vista';
  const cm=r&&s&&r.status!=='excluded'&&!(selected==='R33'&&project.sex==='female')?length(r.points)/s:null;
  $('selected-cm').replaceChildren(document.createTextNode(fmt(cm)),Object.assign(document.createElement('small'),{textContent:'cm'}));$('selected-percent').replaceChildren(document.createTextNode(fmt(cm!=null&&calc.tl?cm/calc.tl*100:null)),Object.assign(document.createElement('small'),{textContent:'%TL'}));
  $('roi-status').value=r?.status||'proposed';$('roi-status').disabled=!r;syncValue('roi-note',r?.note||'');$('roi-note').disabled=!r;
  $('preference-label').hidden=(calc.candidates[selected]?.length||0)<2;$('preference').value=project.preferences[selected]||'';
  $('draw-line').disabled=$('draw-path').disabled=$('draw-cal').disabled=!images[viewName];$('add-point').disabled=!r;$('delete-point').disabled=!r||r.points.length<=2||vertex==null;
  $('finish').hidden=mode!=='path';$('cancel').hidden=!mode;
  for(const [id,m] of [['draw-line','line'],['draw-path','path'],['draw-cal','cal'],['add-point','add']])$(id).classList.toggle('active',mode===m);
  $('tool-hint').textContent=mode==='cal'?'Marca los dos extremos de la referencia de escala':mode==='line'?'Marca los dos extremos de la medida':mode==='path'?`${draft.length} puntos · Clic para añadir · Terminar o Enter para guardar`:mode==='add'?'Haz clic cerca de un segmento para insertar un vértice':'Rueda: zoom · Fondo: desplazar · Punto: arrastrar';
  $('export').disabled=busy;buildList(calc);localize();draw();
}
function fit(){const im=images[viewName];if(!im)return;camera.k=Math.min((vp.clientWidth-45)/im.width,(vp.clientHeight-45)/im.height);camera.x=(vp.clientWidth-im.width*camera.k)/2;camera.y=(vp.clientHeight-im.height*camera.k)/2;draw();}
function resize(){const d=devicePixelRatio||1;cv.width=Math.round(vp.clientWidth*d);cv.height=Math.round(vp.clientHeight*d);draw();}
new ResizeObserver(resize).observe(vp);
function lineOn(context,points,color,k=1,labels=false,id=''){
  context.strokeStyle=color;context.lineWidth=2/k;context.beginPath();points.forEach((p,i)=>i?context.lineTo(...p):context.moveTo(...p));context.stroke();
  for(const p of points){context.beginPath();context.arc(...p,3.3/k,0,Math.PI*2);context.fillStyle=color;context.fill();}
  if(labels){context.font=`${11/k}px Segoe UI`;context.fillStyle='#123d39';context.strokeStyle='#fff';context.lineWidth=3/k;context.strokeText(id,points[0][0]+7/k,points[0][1]-7/k);context.fillText(id,points[0][0]+7/k,points[0][1]-7/k);}
}
function draw(){
  const d=devicePixelRatio||1;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,vp.clientWidth,vp.clientHeight);const im=images[viewName];if(!im)return;
  ctx.translate(camera.x,camera.y);ctx.scale(camera.k,camera.k);ctx.drawImage(im.drawable,0,0);const r=roi();
  if($('show-all').checked)for(const a of view().rois){if(a.id===selected||a.status==='excluded')continue;ctx.globalAlpha=.7;lineOn(ctx,a.points,a.status==='reviewed'?'#24f2c3':'#ffc969',camera.k);}
  ctx.globalAlpha=1;if(view().calibration){ctx.setLineDash([6/camera.k,4/camera.k]);lineOn(ctx,view().calibration.points,'#ee83ed',camera.k,true,tr('Escala'));ctx.setLineDash([]);}
  if(r){lineOn(ctx,r.points,r.status==='excluded'?'#b7b7b7':'#00fff0',camera.k,true,r.id);r.points.forEach((p,i)=>{ctx.beginPath();ctx.arc(...p,(vertex===i?7:5)/camera.k,0,Math.PI*2);ctx.fillStyle=vertex===i?'#fff':'#00fff0';ctx.fill();ctx.lineWidth=1/camera.k;ctx.strokeStyle='#123c40';ctx.stroke();});}
  if(draft.length){lineOn(ctx,lastPoint?[...draft,lastPoint]:draft,'#fff',camera.k);}
  $('zoom-label').textContent=Math.round(camera.k*100)+'%';
}
function screen(e){const b=vp.getBoundingClientRect();return[e.clientX-b.left,e.clientY-b.top];}
function toImage(p){return[(p[0]-camera.x)/camera.k,(p[1]-camera.y)/camera.k];}
function inside(p){return p[0]>=0&&p[1]>=0&&p[0]<view().width&&p[1]<view().height;}
function zoom(f,p=[vp.clientWidth/2,vp.clientHeight/2]){const q=toImage(p),k=Math.max(.01,Math.min(15,camera.k*f));camera={k,x:p[0]-q[0]*k,y:p[1]-q[1]*k};draw();}
function cancel(){mode=null;draft=[];lastPoint=null;}
function start(m){if(!images[viewName])return;cancel();mode=m;vertex=null;render();vp.focus();}
function commitDraft(){try{bounds(draft);if((mode==='line'||mode==='cal')&&draft.length!==2)throw Error('Marca exactamente dos puntos.');checkpoint();const r={id:mode==='cal'?null:selected,name:mode==='cal'?'Calibracion':selected+'_'+catalog.find(c=>c.id===selected).measurement.replace(/[^\w -]/g,'').replaceAll(' ','_'),points:draft.map(p=>[...p]),status:'proposed',note:roi()?.note||''};
    if(mode==='cal'){view().calibration=r;notify('Referencia dibujada. Introduce la distancia real en cm.');}else{view().rois=view().rois.filter(r=>r.id!==selected);view().rois.push(r);notify('Línea guardada como propuesta. Revisa sus puntos.');}cancel();render();}catch(e){notify(e.message,true);}}
function insertPoint(p){const r=roi();let best={distance:Infinity};for(let i=0;i<r.points.length-1;i++){const a=r.points[i],b=r.points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),q=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(p[0]-q[0],p[1]-q[1]);if(distance<best.distance)best={distance,i,q};}if(best.distance*camera.k>30){notify('Haz clic más cerca de la línea para insertar un vértice.',true);return;}checkpoint();r.points.splice(best.i+1,0,best.q);r.status='proposed';vertex=best.i+1;cancel();render();}
vp.addEventListener('pointerdown',e=>{if(e.target.closest('button')||!images[viewName])return;const s=screen(e),p=toImage(s);vp.focus();
  if(mode){if(!inside(p))return;if(mode==='add')insertPoint(p);else{draft.push(p);if(mode!=='path'&&draft.length===2)commitDraft();else render();}return;}
  const r=roi();vertex=r?.points.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])*camera.k<12);if(vertex===-1||vertex==null)vertex=null;
  if(vertex!=null){checkpoint();drag={type:'vertex',i:vertex,before:r.points.map(p=>[...p])};}else drag={type:'pan',s,c:{...camera}};
  vp.setPointerCapture(e.pointerId);draw();
});
vp.addEventListener('pointermove',e=>{if(!images[viewName])return;const s=screen(e),p=toImage(s);$('coordinates').textContent=`${p[0].toFixed(1)}, ${p[1].toFixed(1)} px`;lastPoint=p;
  if(drag?.type==='vertex'){if(inside(p))roi().points[drag.i]=p;draw();}else if(drag?.type==='pan'){camera.x=drag.c.x+s[0]-drag.s[0];camera.y=drag.c.y+s[1]-drag.s[1];draw();}else if(mode)draw();
});
function endDrag(){if(drag?.type==='vertex'){try{bounds(roi().points);roi().status='proposed';}catch(e){roi().points=drag.before;notify(e.message,true);}}drag=null;render();}
vp.addEventListener('pointerup',endDrag);vp.addEventListener('pointercancel',endDrag);
vp.addEventListener('wheel',e=>{if(!images[viewName])return;e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),screen(e));},{passive:false});
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='Escape'){cancel();render();}if(e.key==='Enter'&&mode==='path'){e.preventDefault();commitDraft();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history(false);}});
function validateExport(requireScale){
  if(!project.specimen.trim())throw Error('Indica el nombre del ejemplar.');
  for(const name of VIEWS){const v=project.views[name];if(v.rois.length&&!images[name])throw Error('Falta la fotografía '+name);for(const r of v.rois){geometry(r.points,v.width,v.height);if(requireScale&&HEIGHTS.includes(r.id)&&r.status!=='excluded')throw Error(r.id+' es una altura: no se puede calcular desde una vista dorsal o ventral. Descarta esa línea.');}if(v.calibration)geometry(v.calibration.points,v.width,v.height);if(requireScale&&v.rois.some(r=>r.status!=='excluded')&&!scale(v))throw Error('Falta calibrar la vista '+name);}
  const calc=calculate(project,catalog);if(requireScale&&calc.conflicts.length)throw Error('Selecciona la vista del combinado para: '+calc.conflicts.join(', '));
  if(requireScale&&!calc.rows.some(r=>r.cm!=null))throw Error('Carga al menos una medida y su escala.');return calc;
}
function preview(name){const im=images[name],v=project.views[name],c=document.createElement('canvas'),panel=Math.round(im.width*.55);c.width=im.width+panel;c.height=im.height;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im.drawable,0,0);const fs=Math.max(14,im.width/100);x.font=`${fs}px Segoe UI`;x.fillStyle='#163e4a';x.fillText(`${project.specimen} · ${name}`,im.width+25,im.height*.04);
  const all=v.rois.filter(r=>r.status!=='excluded');all.forEach((r,i)=>{const color=r.status==='reviewed'?'#00ddbf':'#ffbd54';lineOn(x,r.points,color,1,true,r.id);const p=r.points[Math.floor(r.points.length/2)],y=im.height*(.09+.79*i/Math.max(1,all.length-1));x.beginPath();x.moveTo(...p);x.lineTo(im.width+20,y);x.strokeStyle='#95a8a0';x.lineWidth=.7;x.stroke();x.font=`${fs*.7}px Segoe UI`;x.fillStyle='#163e4a';const label=r.id+' '+catalog.find(c=>c.id===r.id).measurement+(r.points.length>2?' (trayecto)':'');const words=label.split(' ');let text='',line=0;for(const word of words){if(x.measureText(text+word).width>panel-45){x.fillText(text,im.width+25,y+line*fs*.85);text='';line++;}text+=word+' ';}x.fillText(text,im.width+25,y+line*fs*.85);});
  if(v.calibration)lineOn(x,v.calibration.points,'#df58e6',1,true,'Escala');x.fillStyle='#526c61';x.font=`${fs*.7}px Segoe UI`;x.fillText(scale(v)?`${scale(v).toFixed(6)} px/cm · ${v.knownCm} cm`:'Sin calibrar',im.width+25,im.height*.95);
  return new Promise((res,rej)=>c.toBlob(async b=>b?res(new Uint8Array(await b.arrayBuffer())):rej(Error('No se pudo generar el preview.')),'image/png'));
}
async function packageFiles(results){
  const calc=validateExport(results),files={},meta=structuredClone(project);meta.savedAt=new Date().toISOString();
  for(const name of VIEWS){const v=project.views[name],im=images[name];if(im){const path=name+'/'+safeName(im.name);files[path]=im.bytes;meta.views[name].imagePath=path;}
    if(v.rois.length)files[name+'/ROIs_'+name+'.zip']=fflate.zipSync(Object.fromEntries(v.rois.map(r=>[r.id+'_'+safeName(r.name.replace(/^R\d{2}[_ .-]*/,''))+'.roi',writeROI(r)])),{level:6});
    if(v.calibration)files[name+'/Calibracion.roi']=writeROI(v.calibration);
    if(results){if(im)files[name+'/'+name+'_preview.png']=await preview(name);files[name+'/'+safeName(project.specimen)+'_'+name+'.xlsx']=fflate.zipSync(workbookFiles(excelSheets(project,catalog,name)),{level:6});}}
  files['project.json']=enc.encode(JSON.stringify(meta,null,2));
  if(results){files[safeName(project.specimen)+'_combinado.xlsx']=fflate.zipSync(workbookFiles(excelSheets(project,catalog)),{level:6});files['medidas_auditables.csv']=enc.encode(csv([['id','measurement','view','length_cm','percent_TL','length_px','status','note','method'],...calc.rows.map(r=>[r.id,r.measurement,r.view,r.cm,r.percent,r.px,r.status,r.note,r.method])]));files['pegar_dataset.tsv']=enc.encode(calc.rows.map(r=>[r.cm,r.percent].map(n=>n==null?'':n.toFixed(2)).join('\t')).join('\r\n'));files['LEEME.txt']=enc.encode('Abrir este ZIP con Abrir proyecto para continuar. Cada vista contiene su foto exacta, todos sus ROI (incluidos descartados), calibración, preview y Excel. Los estados y observaciones se guardan en project.json y CSV; ImageJ no interpreta el estado descartado. Solo las medidas no descartadas pasan al Excel.\nCopiar_dataset!B3:C51: cm y %TL. Se conservan 49 filas. Las propuestas no son medidas validadas.\nTL de referencia: '+project.tlView+'/R03. Sin TL válida los %TL quedan vacíos.\nLas coordenadas pertenecen a la imagen orientada; para JPEG usa la misma orientación EXIF en Fiji.\nLos originales se incluyen sin modificación de sus bytes.');}
  return files;
}
async function save(results){notify(results?'Preparando Excel, ROI y previews…':'Preparando proyecto…');const files=await packageFiles(results);download(fflate.zipSync(files,{level:1}),safeName(project.specimen)+(results?'_resultados':'_proyecto')+'.zip');dirty=false;notify(results?'Resultados descargados: tres Excel, ROI, previews y proyecto editable.':'Proyecto descargado con las imágenes y medidas para continuar.');}
async function loadProject(file){
  if(!file)return;const files=unpack(new Uint8Array(await file.arrayBuffer()));const key=Object.keys(files).find(n=>n==='project.json'||n.endsWith('/project.json'));if(!key)throw Error('No es un proyecto de esta web. Para ZIP de ImageJ usa Cargar ZIP de ROI.');const prefix=key.slice(0,-'project.json'.length),p=JSON.parse(dec.decode(files[key]));
  if(p.format!=='radula-project'||p.version!==1||!VIEWS.includes(p.tlView)||!['male','female','unknown'].includes(p.sex)||typeof p.specimen!=='string'||!p.preferences||typeof p.preferences!=='object')throw Error('Proyecto no compatible.');
  const ims={};for(const name of VIEWS){const v=p.views?.[name];if(!v||!Array.isArray(v.rois)||v.rois.length>49||typeof v.scaleNote!=='string'||(v.knownCm!=null&&(!Number.isFinite(v.knownCm)||v.knownCm<=0)))throw Error('Vista no válida.');const ids=new Set();for(const r of v.rois){if(!catalog.some(c=>c.id===r.id)||ids.has(r.id)||!['proposed','reviewed','excluded'].includes(r.status)||typeof r.note!=='string'||typeof r.name!=='string')throw Error('Medida no válida en proyecto.');ids.add(r.id);geometry(r.points,v.width,v.height);}if(v.calibration){geometry(v.calibration.points,v.width,v.height);if(v.calibration.points.length!==2)throw Error('La calibración debe ser recta.');}
    if(v.imagePath){const data=files[prefix+v.imagePath];if(!data)throw Error('Falta la foto de '+name);const im=await decodeImage(new File([data],v.imageName));if(im.width!==v.width||im.height!==v.height)throw Error('Dimensiones de imagen incoherentes.');ims[name]=im;}else if(v.rois.length)throw Error('El proyecto no incluye la foto de '+name);}
  if(dirty&&!confirm(tr('Hay cambios sin descargar. ¿Abrir este proyecto y sustituirlos?')))return;
  for(const im of Object.values(images))im.drawable.close?.();images=ims;project=p;undo=[];redo=[];dirty=false;cancel();viewName=images.Ventral?'Ventral':'Dorsal';selected='R03';fit();notify('Proyecto restaurado con sus imágenes, estados y calibraciones.');
}
function demo(){if(dirty&&!confirm(tr('¿Abrir el ejemplo esquemático y sustituir el proyecto actual? Guarda antes tus cambios.')))return;const c=document.createElement('canvas');c.width=1000;c.height=1250;const x=c.getContext('2d');x.fillStyle='#e2e9e3';x.fillRect(0,0,1000,1250);x.fillStyle='#c5d7c9';x.strokeStyle='#637f70';x.lineWidth=2;x.beginPath();x.moveTo(500,160);x.bezierCurveTo(450,300,170,350,160,600);x.bezierCurveTo(190,850,380,900,500,850);x.bezierCurveTo(620,900,810,850,840,600);x.bezierCurveTo(830,350,550,300,500,160);x.fill();x.stroke();x.beginPath();x.moveTo(500,820);x.bezierCurveTo(500,1150,720,1150,730,1010);x.strokeStyle='#637f70';x.lineWidth=20;x.stroke();x.fillStyle='#466a59';x.font='22px Segoe UI';x.fillText(getLanguage()==='en'?'SCHEMATIC EXAMPLE · NO BIOLOGICAL VALUE':'EJEMPLO ESQUEMÁTICO · SIN VALOR BIOLÓGICO',180,70);x.lineWidth=3;x.beginPath();x.moveTo(80,1050);x.lineTo(280,1050);x.stroke();x.font='18px Segoe UI';x.fillText('10 cm',145,1085);
  const bytes=Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));images={Ventral:{drawable:c,width:1000,height:1250,name:'ejemplo.png',bytes}};project={format:'radula-project',version:1,specimen:'Ejemplo_esquematico',sex:'unknown',tlView:'Ventral',preferences:{},views:{Dorsal:emptyView(),Ventral:{imageName:'ejemplo.png',width:1000,height:1250,knownCm:10,scaleNote:'Ejemplo esquemático. Sin valor biológico.',calibration:{name:'Calibracion',points:[[80,1050],[280,1050]]},rois:[{id:'R03',name:'R03_Total_length',points:[[500,160],[500,850],[510,960],[560,1060],[640,1100],[700,1080],[730,1010]],status:'proposed',note:'Ejemplo de trayecto curvado.'},{id:'R04',name:'R04_Disc_width',points:[[160,600],[840,600]],status:'proposed',note:'Ejemplo de anchura.'}]}}};viewName='Ventral';selected='R03';undo=[];redo=[];dirty=false;fit();render();notify('Ejemplo esquemático: prueba a mover los puntos y descargar los resultados.');}
for(const name of VIEWS)$('tab-'+name.toLowerCase()).onclick=()=>{cancel();viewName=name;vertex=null;fit();render();};
for(const [id,fn] of [['image-file',loadImage],['rois-file',loadROIs],['cal-file',loadCalibration],['notes-file',loadNotes],['project-file',loadProject]])$(id).onchange=e=>{const file=e.target.files[0];e.target.value='';action(()=>fn(file));};
$('specimen').oninput=e=>{checkpoint();project.specimen=e.target.value;render();};$('sex').onchange=e=>{checkpoint();project.sex=e.target.value;render();if(project.sex==='female')notify('Hembra: R33 queda excluida del Excel. Su línea se conserva en el proyecto.');};$('tl-view').onchange=e=>{checkpoint();project.tlView=e.target.value;render();};
$('known-cm').oninput=e=>{const n=e.target.value===''?null:Number(e.target.value);checkpoint();if(n!=null&&(!Number.isFinite(n)||n<=0)){view().knownCm=null;render();notify('La referencia debe ser positiva, en cm.',true);return;}view().knownCm=n;render();};
$('scale-note').oninput=e=>{checkpoint();view().scaleNote=e.target.value;render();};$('roi-note').oninput=e=>{if(!roi())return;checkpoint();roi().note=e.target.value;render();};$('roi-status').onchange=e=>{if(!roi())return;checkpoint();roi().status=e.target.value;render();};$('preference').onchange=e=>{checkpoint();project.preferences[selected]=e.target.value;render();};
$('search').oninput=()=>{buildList(calculate(project,catalog));localize();};$('filter').onchange=()=>{buildList(calculate(project,catalog));localize();};$('show-all').onchange=draw;
$('fit').onclick=fit;$('zoom-in').onclick=()=>zoom(1.4);$('zoom-out').onclick=()=>zoom(1/1.4);$('undo').onclick=()=>history(true);$('redo').onclick=()=>history(false);
$('draw-line').onclick=()=>start('line');$('draw-path').onclick=()=>start('path');$('draw-cal').onclick=()=>start('cal');$('add-point').onclick=()=>start('add');$('finish').onclick=commitDraft;$('cancel').onclick=()=>{cancel();render();};$('delete-point').onclick=()=>{if(vertex==null||!roi()||roi().points.length<=2)return;checkpoint();roi().points.splice(vertex,1);roi().status='proposed';vertex=null;render();};
$('save-project').onclick=()=>action(()=>save(false));$('export').onclick=()=>action(()=>save(true));$('demo').onclick=demo;$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
const langLabel=document.createElement('label');langLabel.className='language';langLabel.innerHTML='<span>Idioma</span><select id="language" aria-label="Idioma"><option value="es">Español</option><option value="en">English</option></select>';$('help').before(langLabel);$('language').value=getLanguage();$('language').onchange=e=>{setLanguage(e.target.value);render();};
render();
