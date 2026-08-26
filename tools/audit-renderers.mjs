import { readFile } from 'node:fs/promises';
const root = process.env.VLAB_ROOT || process.cwd();
function mockCtx() {
  const b = {};
  for (const k of ['save','restore','beginPath','closePath','fill','stroke','moveTo','lineTo','arc','ellipse','rect','roundRect','quadraticCurveTo','bezierCurveTo','fillRect','strokeRect','clearRect','fillText','setLineDash','translate','rotate','scale','setTransform','clip']) b[k]=()=>{};
  b.measureText=()=>({width:12}); b.createLinearGradient=()=>({addColorStop(){}}); b.createRadialGradient=()=>({addColorStop(){}});
  return new Proxy(b,{get:(t,p)=>(p in t?t[p]:()=>{}),set:()=>true});
}
const canvas={width:900,height:560,style:{},clientWidth:900,parentElement:{clientWidth:900},dataset:{},getContext:mockCtx,addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:560})};
globalThis.window={devicePixelRatio:1};
const A = await import(`${root}/src/simulation/renderers/apparatus.js`);
const { RENDERERS } = await import(`${root}/src/simulation/renderers/index.js`);
const { resetFluids } = await import(`${root}/src/simulation/fluids.js`);
const idx = JSON.parse(await readFile(`${root}/data/experiments/index.json`,'utf8'));
let ok=0; const fails=[];
for (const meta of idx.experiments.filter(e=>e.contentStatus==='published')) {
  const exp = JSON.parse(await readFile(`${root}/${meta.file}`,'utf8'));
  const fn = RENDERERS[exp.simulation.renderer];
  if (!fn) { fails.push([meta.id,'no renderer']); continue; }
  try {
    const model = await import(`${root}/src/simulation/models/${exp.simulation.model}.js`);
    const inputs={...model.defaults};
    for (const v of exp.variables||[]) { if(v.default==null||v.type==='dependent')continue; inputs[v.id]=v.default; }
    let state={...model.init(inputs), running:true, flowing:true, flowRate:1, heating:true, released:true, rolling:true, started:true};
    for (const th of ['classroom','dark']) {
      A.setCanvasTheme(th);
      for (let f=0;f<10;f++){ state=model.step(state,inputs,1/60); A.resetScene(); A.renderScene(canvas,16/10,exp.simulation.renderer,fn,state,inputs); }
    }
    resetFluids(); ok++;
  } catch(e){ fails.push([meta.id, `${exp.simulation.renderer}: ${e.message}`]); }
}
console.log(`rendered cleanly: ${ok}/100   failures: ${fails.length}`);
fails.slice(0,12).forEach(([i,m])=>console.log('  FAIL',i,m));
process.exit(fails.length?1:0);
