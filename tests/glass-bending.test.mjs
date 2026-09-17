/**
 * Scientific validation — XI-CHE-A02, bending a glass tube.
 * Declared by the experiment's own `scientificValidation.testFile`.
 *
 *   node tests/glass-bending.test.mjs        (exit 0 = all pass)
 *
 * Checks the model against published soda-lime data and against the closed
 * form of its own relations, not against a previous run of itself.
 */
const m = await import('../src/simulation/models/glass-bending.js');
const F=[];const chk=(n,c,d='')=>{console.log((c?'PASS':'FAIL')+' · '+n+(d?'  '+d:''));if(!c)F.push(n)};
const near=(a,b,tol)=>Math.abs(a-b)<=tol;

console.log('── viscosity curve vs published soda-lime fixed points');
chk('annealing point ≈ 550 °C', near(m.ANNEALING_C,550,6), `got ${m.ANNEALING_C.toFixed(1)}`);
chk('softening point ≈ 720 °C', near(m.SOFTENING_C,720,6), `got ${m.SOFTENING_C.toFixed(1)}`);
chk('working point ≈ 1000 °C', near(m.WORKING_C,1010,25), `got ${m.WORKING_C.toFixed(1)}`);
chk('viscosity falls monotonically with temperature',
  [400,600,720,850,1000].every((t,i,a)=>i===0||m.viscosity(t)<m.viscosity(a[i-1])));

console.log('\n── bend geometry: R = L/θ exactly');
const inp={...m.defaults};
for (const deg of [30,60,90,135]) {
  const R=m.bendRadiusMm(deg,inp), L=m.heatedLengthM(inp)*1000;
  chk(`R = L/θ at ${deg}°`, near(R, L/(deg*Math.PI/180), 1e-9), `R=${R.toFixed(2)}mm`);
}
chk('a wider band gives a larger radius', m.bendRadiusMm(90,{...inp,bandLengthMm:60})>m.bendRadiusMm(90,{...inp,bandLengthMm:20}));

console.log('\n── wall thinning: t/t0 = 1/(1 + r0/R)');
const R90=m.bendRadiusMm(90,inp), ro=m.radii(inp).ro*1000;
chk('wall ratio matches 1/(1+r0/R)', near(m.wallRatio(90,0,inp), 1/(1+ro/R90), 1e-9),
  `got ${m.wallRatio(90,0,inp).toFixed(4)}`);
chk('a tighter bend thins the wall more', m.wallRatio(90,0,{...inp,bandLengthMm:20})<m.wallRatio(90,0,{...inp,bandLengthMm:60}));
chk('uneven heating thins it further', m.wallRatio(90,200,inp)<m.wallRatio(90,0,inp));

console.log('\n── bend rate follows viscosity, not a script');
const rates=[650,720,800,900,1000].map(t=>m.bendRate(t,inp));
chk('bend rate rises with temperature', rates.every((r,i)=>i===0||r>rates[i-1]));
chk('will not bend below softening', m.bendRate(650,inp)*180/Math.PI < 0.5,
  `${(m.bendRate(650,inp)*180/Math.PI).toExponential(2)} °/s`);
chk('workable a little above softening', (()=>{const d=m.bendRate(760,inp)*180/Math.PI;return d>1&&d<200;})(),
  `${(m.bendRate(760,inp)*180/Math.PI).toFixed(1)} °/s`);
chk('uncontrollable at the working point', m.bendRate(m.WORKING_C,inp)>3,
  `${(m.bendRate(m.WORKING_C,inp)*180/Math.PI).toFixed(0)} °/s`);

console.log('\n── full runs through step()');
/* The real bench procedure: heat until the glass is soft, TAKE IT OUT of
   the flame, then let it bend under its own weight as it cools. */
/* The real bench procedure: heat until soft, take it OUT of the flame, let
   it bend under its own weight, and put it back when it stiffens — as many
   reheats as the angle needs. */
const run=(over={},secs=240,pullAtC=790)=>{const i={...m.defaults,...over};let s={...m.init(i),heating:true};  // startProcess() lights the burner
  for(let k=0;k<secs*120;k++){
    if(i.inFlame && s.meanC>=pullAtC) i.inFlame=false;
    else if(!i.inFlame && s.meanC<m.ANNEALING_C && s.angleDeg<i.targetAngleDeg && !s.collapsed) i.inFlame=true;
    s=m.step(s,i,1/120);
    if(s.finishedAt)break;
  } return {s,i};};
const good=run({});
chk('wing top + rotation reaches the target angle', near(good.s.angleDeg, m.defaults.targetAngleDeg, 2),
  `angle=${good.s.angleDeg.toFixed(1)}° T=${good.s.meanC.toFixed(0)}°C`);
chk('and gives a sound bend', m.verdictOf(good.s,good.i)==='good', `verdict=${m.verdictOf(good.s,good.i)} wall=${good.s.wallRatio.toFixed(3)} reheats=${good.s.reheats}`);
const cool=run({flame:'luminous'});
chk('luminous flame never softens the glass', m.verdictOf(cool.s,cool.i)==='notSoftened', `T plateaued at ${cool.s.meanC.toFixed(0)}°C, eq=${m.equilibriumTempC({...m.defaults,flame:'luminous'}).toFixed(0)}°C`);
const still=run({rotationRpm:0});
chk('no rotation leaves a large temperature difference across the wall', still.s.circDeltaC>100,
  `ΔT=${still.s.circDeltaC.toFixed(0)}°C`);
chk('rotation closes that gap', good.s.circDeltaC < still.s.circDeltaC,
  `${good.s.circDeltaC.toFixed(0)}°C vs ${still.s.circDeltaC.toFixed(0)}°C`);
const narrow=run({flame:'open',bandLengthMm:60});
chk('a spot flame gives a thin-walled, tight bend', m.verdictOf(narrow.s,narrow.i)!=='good' && narrow.s.wallRatio<0.8,
  `verdict=${m.verdictOf(narrow.s,narrow.i)} band=${(m.heatedLengthM(narrow.i)*1000)}mm wall=${narrow.s.wallRatio.toFixed(3)}`);

console.log('\n── derive() recovers the bend angle from the slope');
const rows=[];
for (const band of [20,30,40,50,60]) {
  const {s,i}=run({bandLengthMm:band});
  const r=m.measure(s,{...m.defaults,bandLengthMm:band},7,rows.length+1);
  if(r) rows.push(r);
}
const d=m.derive(rows,m.defaults);
chk('derive succeeds with 3+ bends', d.ok, d.ok?'':d.reason);
if(d.ok){
  chk('R against L is a straight line through the origin', d.r2>0.99, `r²=${d.r2}`);
  chk('slope recovers the set angle within 5%', near(d.angleFromSlope, 90, 4.5),
    `θ from slope = ${d.angleFromSlope.toFixed(2)}° (set 90°)`);
  console.log('   rows:', rows.map(r=>`${r.bandMm}mm→R${r.radiusMm}mm w${r.wallRatio}`).join('  '));
}

console.log('\n── edge cases');
chk('zero angle gives an infinite radius, not NaN', !Number.isFinite(m.bendRadiusMm(0,inp)));
chk('and a wall ratio of 1', m.wallRatio(0,0,inp)===1);
chk('viscosity below T0 does not divide by zero', Number.isFinite(m.viscosity(100))&&m.viscosity(100)>1e15);
chk('luminous flame is rejected by validate()', !m.validate({...inp,flame:'luminous'}).ok);
chk('over-wide band warns about the flame', m.validate({...inp,flame:'open',bandLengthMm:60}).warnings.some(w=>w.code==='FLAME_TOO_NARROW'));
chk('no rotation warns', m.validate({...inp,rotationRpm:0}).warnings.some(w=>w.code==='NOT_ROTATING'));
chk('measure() returns null before anything happens', m.measure(m.init(),inp,1,1)===null);
chk('no NaN anywhere in a finished state', !JSON.stringify(good.s).includes('null')||Object.values(good.s).every(v=>typeof v!=='number'||Number.isFinite(v)));

console.log(F.length?`\n${F.length} FAILED: `+F.join(' | '):'\nALL PASS');
process.exit(F.length?1:0);
