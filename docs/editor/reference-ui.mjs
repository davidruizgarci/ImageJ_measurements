import {references,referenceLocation,SOURCES} from './references.mjs';
const $=id=>document.getElementById(id);
const phrases={es:{summary:'Definición y referencia',start:'Inicio',end:'Final',method:'Método',view:'Vista / examen',open:'Ver ilustración',none:'Sin ilustración específica en la fuente.',protocol:'Definición del protocolo, resumida y traducida.',adaptation:'Adaptación del dataset · requiere confirmación del criterio.',separation:'Estas definiciones describen el protocolo. Las observaciones del ejemplar se guardan por separado en «Observaciones».',female:'No aplicable · hembra.',credit:'Ilustración original de Last et al. (2008), CSIRO. Se conserva la numeración del paper; no son los ID R del dataset.',source:'Abrir publicación original',context:'La ilustración se refiere al carácter {n} del paper. Buscar ese número en el panel {p}.',caption:'Panel {p} de la figura {f}; carácter original {n}.',noFigure:'La fuente no ofrece un dibujo individual para esta medida; no se ha inventado una ilustración.'},en:{summary:'Definition and reference',start:'Start',end:'End',method:'Method',view:'View / examination',open:'View illustration',none:'No specific illustration in the source.',protocol:'Protocol definition, paraphrased and translated.',adaptation:'Dataset adaptation · measurement criterion requires confirmation.',separation:'These definitions describe the protocol. Specimen observations are stored separately in Notes.',female:'Not applicable · female.',credit:'Original illustration from Last et al. (2008), CSIRO. Paper numbering is preserved; these are not dataset R IDs.',source:'Open original publication',context:'The illustration refers to source character {n}. Find that number in panel {p}.',caption:'Panel {p} of Figure {f}; original character {n}.',noFigure:'The source provides no individual drawing for this measurement; no illustration has been invented.'}};
const fill=(s,r)=>s.replaceAll('{n}',r.sourceNumber).replaceAll('{p}',r.panel?.[1]||'').replaceAll('{f}',r.panel?.[0]||'');
export function renderReference(id,lang='es',sex='unknown'){
 const r=references[id],t=phrases[lang],d=r[lang];
 $('reference-summary').textContent=t.summary+' · '+id;
 $('reference-definition').textContent=d.definition;
 const fields=$('reference-fields');fields.replaceChildren();
 for(const key of ['start','end','method','view']){const term=document.createElement('dt'),value=document.createElement('dd');term.textContent=t[key];value.textContent=d[key];fields.append(term,value);}
 $('reference-caveat').textContent=(id==='R33'&&sex==='female'?t.female+' ':'')+d.caveat;
 $('reference-status').textContent=r.kind==='protocol'?t.protocol:t.adaptation;
 $('reference-location').textContent=referenceLocation(r,lang);
 $('reference-citation').textContent=SOURCES.method.citation+(id==='R47'?' '+SOURCES.parva.citation+' Table 1.':'');
 $('reference-separation').textContent=t.separation;
 $('reference-figure').hidden=!r.panel;
 const external=r.panel?.startsWith('1');
 $('open-reference').hidden=!!external;
 $('reference-external').hidden=!external;
 if(external){$('reference-external').href='https://www.researchgate.net/figure/Dagrammatc-representaton-of-the-morphometrc-characters-used-for-skates-Rajode-A_fig1_235659713';$('reference-external').textContent=lang==='en'?'View Figure 1 at source ↗':'Consultar figura 1 en la fuente ↗';}

 $('reference-open-label').textContent=t.open;
 $('reference-caption').textContent=r.panel?fill(t.caption,r)+' '+t.credit:t.none;
 if(external){$('reference-caption').textContent=fill(t.caption,r)+' '+(lang==='en'?'The general plate is linked to the author’s publication; a local copy could not be recovered.':'La lámina general se consulta en la publicación del autor; no se ha podido recuperar una copia local.');return;}
 if(!r.panel){$('reference-status').textContent+=' '+t.none+' '+t.noFigure;return;}
 const src=`references/panel-${r.panel}.png`;
 if($('reference-thumbnail').getAttribute('src')!==src)$('reference-thumbnail').src=src;
 $('reference-thumbnail').alt=fill(t.caption,r);
}
export function openReference(id,lang='es'){
 const r=references[id];if(!r.panel)return;const t=phrases[lang];
 $('reference-dialog-title').textContent=id+' · '+fill(t.caption,r);
 $('reference-dialog-context').textContent=fill(t.context,r);
 $('reference-full').src=`references/figure-${r.panel[0]}.png`;
 $('reference-full').alt=fill(t.caption,r);
 $('reference-credit').textContent=t.credit+' '+SOURCES.method.citation;
 $('reference-source').href=SOURCES.method.url;$('reference-source').textContent=t.source;
 $('close-reference').setAttribute('aria-label',lang==='en'?'Close illustration':'Cerrar ilustración');
 $('reference-dialog').showModal();$('reference-image-frame').scrollTop=0;$('reference-image-frame').scrollLeft=0;
}
