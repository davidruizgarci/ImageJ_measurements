import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {length,geometry,readROI,writeROI,calculate,workbookFiles,excelSheets,parseCSV} from '../docs/editor/core.mjs';
import catalog from '../docs/editor/catalog.mjs';
const require=createRequire(import.meta.url),{zipSync,unzipSync}=require('../docs/editor/vendor/fflate.js');
const line=(id,points,status='proposed')=>({id,name:id+'_test',points,status,note:'Estimated <landmark> & review'});
const pts=[[10.5,20.25],[40.5,20.25],[40.5,60.25]];
assert.equal(length(pts),70);assert.notEqual(length(pts),Math.hypot(30,40));
for(const p of [pts,pts.slice(0,2)]){const r=line('R03',p);r.name='R03_órbita';const result=readROI(writeROI(r));assert.deepEqual(result.points,p);assert.equal(result.name,r.name);assert.equal(result.id,'R03');}
const spline=writeROI(line('R03',pts));new DataView(spline.buffer).setUint16(50,129);assert.throws(()=>readROI(spline),/Spline/);
assert.throws(()=>geometry([[1,1],[150,20],[5,5]],100,100),/fuera/);
assert.throws(()=>geometry([[1,1],[1,1]],100,100),/cero/);
assert.throws(()=>readROI(new Uint8Array(4)),/truncado/);
const mk=rois=>({width:100,height:100,rois,calibration:{points:[[0,0],[50,0]]},knownCm:5,scaleNote:'Ruler in plane'});
const p={specimen:'Synthetic',sex:'male',tlView:'Dorsal',preferences:{},views:{Dorsal:mk([line('R03',[[0,0],[99,0]])]),Ventral:mk([line('R20',pts),line('R33',[[0,0],[20,0]])])}};
let calc=calculate(p,catalog);assert.equal(calc.tl,9.9);assert.equal(calc.rows.length,49);assert.equal(calc.rows[17].id,'R20');assert.equal(calc.rows[17].cm,7);assert.equal(calc.rows[17].percent,7/9.9*100);
p.views.Dorsal.rois.push(line('R20',[[0,0],[80,0]]));assert.deepEqual(calculate(p,catalog).conflicts,['R20']);assert.throws(()=>excelSheets(p,catalog),/vista/);p.preferences.R20='Ventral';assert.equal(calculate(p,catalog).rows[17].cm,7);
p.sex='female';assert.equal(calculate(p,catalog).rows[30].cm,null);assert.equal(calculate(p,catalog).rows[30].status,'not-applicable');p.sex='male';
p.views.Ventral.rois[0].status='excluded';p.views.Dorsal.rois.find(r=>r.id==='R20').status='excluded';calc=calculate(p,catalog);assert.equal(calc.rows[17].cm,null);assert.equal(calc.rows[17].status,'excluded');assert.match(calc.rows[17].note,/landmark/);
const sheets=excelSheets(p,catalog);assert.equal(sheets[1].rows.length,51);assert.equal(sheets[1].rows[2][3],'R03');assert.equal(sheets[1].rows[50][3],'R51');assert.equal(sheets[1].rows[37][1],null);
const files=workbookFiles(sheets);const xml=new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);assert.match(xml,/&lt;landmark&gt; &amp; review/);assert.ok(!xml.includes('<f>'));assert.equal(Object.keys(unzipSync(zipSync(files))).length,Object.keys(files).length);
const out=mkdtempSync(join(tmpdir(),'radula-web-test-'));writeFileSync(join(out,'Synthetic.xlsx'),zipSync(files));
assert.deepEqual(parseCSV('id,note\r\nR03,"a,b\nsecond line"\r\n'),[{id:'R03',note:'a,b\nsecond line'}]);
// Optional real ROI ZIPs supplied on the command line: check binary roundtrip.
let real=0;for(const path of process.argv.slice(2)){const files=unzipSync(readFileSync(path));for(const [n,b] of Object.entries(files)){if(!/\.roi$/i.test(n))continue;const r=readROI(b,n),back=readROI(writeROI(r));assert.ok(Math.abs(length(r.points)-length(back.points))<.001);real++;}}
console.log(`Web core checks passed. Real ROI roundtrips: ${real}. Workbook: ${out}/Synthetic.xlsx`);
