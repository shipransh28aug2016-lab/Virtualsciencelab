// Chemistry numeric generators: mole concept, solutions, electrochemistry, kinetics, equilibrium, thermochemistry...
import { fmt } from '../util.js';
import { E } from './common.js';

const NA = 6.022e23, R = 8.314, F = 96500, PLANCK = 6.626e-34, CL = 3e8;
const p = (id, cls, ch, bloom, diff, fn) => E(`chemistry.${cls}.${ch}.${id}`, ch, bloom, diff, fn, { subject: 'chemistry', cls });
const S = (en, hi = en) => [en, hi];
const SOLUTES = [['NaOH', 40, 'सोडियम हाइड्रॉक्साइड'], ['H₂SO₄', 98, 'सल्फ्यूरिक अम्ल'], ['CaCO₃', 100, 'कैल्सियम कार्बोनेट'], ['NaCl', 58.5, 'सोडियम क्लोराइड'], ['glucose (C₆H₁₂O₆)', 180, 'ग्लूकोस (C₆H₁₂O₆)'], ['KOH', 56, 'पोटैशियम हाइड्रॉक्साइड']];

export const CHEMISTRY_XI = [
  p('molecules', 'XI', 'ch1', 'apply', 'easy', (r) => {
    const [s, M, h] = r.pick(SOLUTES), m = r.pick([2, 4, 5, 10, 20]);
    const n = m / M, N = n * NA;
    return { en: `Calculate the number of molecules present in ${m} g of ${s} (molar mass = ${M} g mol⁻¹). (N_A = 6.022 × 10²³ mol⁻¹)`,
      hi: `${m} g ${h === s ? s : h} (मोलर द्रव्यमान = ${M} g mol⁻¹) में उपस्थित अणुओं की संख्या परिकलित कीजिए। (N_A = 6.022 × 10²³ mol⁻¹)`,
      steps: [S('Moles n = mass / molar mass', 'मोल संख्या n = द्रव्यमान / मोलर द्रव्यमान'), S(`n = ${m}/${M} = ${fmt(n)} mol`, `n = ${m}/${M} = ${fmt(n)} mol`), S('Number of molecules = n × N_A', 'अणुओं की संख्या = n × N_A'), S(`N = ${fmt(N)}`, `N = ${fmt(N)}`)],
      value: N, unit: '', wrong: [n, N * 1e3, m * NA] };
  }),
  p('molarity', 'XI', 'ch1', 'apply', 'easy', (r) => {
    const [s, M, h] = r.pick(SOLUTES), m = r.pick([2, 4, 5, 8, 10]), V = r.pick([100, 250, 500]);
    const c = (m / M) / (V / 1000);
    return { en: `${m} g of ${s} (molar mass ${M} g mol⁻¹) is dissolved in water to make ${V} mL of solution. Find its molarity.`,
      hi: `${m} g ${h} (मोलर द्रव्यमान ${M} g mol⁻¹) को जल में घोलकर ${V} mL विलयन बनाया गया। इसकी मोलरता ज्ञात कीजिए।`,
      steps: [S('Molarity = moles of solute / volume of solution (L)', 'मोलरता = विलेय के मोल / विलयन का आयतन (L)'), S(`Moles = ${m}/${M} = ${fmt(m / M)}`, `मोल = ${m}/${M} = ${fmt(m / M)}`), S(`M = ${fmt(m / M)} / ${V / 1000} L = ${fmt(c)} mol L⁻¹`, `M = ${fmt(m / M)} / ${V / 1000} L = ${fmt(c)} mol L⁻¹`)],
      value: c, unit: 'mol L⁻¹', wrong: [(m / M) / V, c / 1000, (m / M) * V / 1000] };
  }),
  p('limiting', 'XI', 'ch1', 'analyse', 'hard', (r) => {
    const a = r.pick([14, 28, 56, 84]), b = r.pick([3, 6, 9, 12]);
    const nN = a / 28, nH = b / 2, nNH3 = Math.min(2 * nN, 2 * nH / 3), m = nNH3 * 17;
    const lim = 2 * nN < 2 * nH / 3 ? 'N₂' : 'H₂';
    return { en: `In the reaction N₂ + 3H₂ → 2NH₃, ${a} g of N₂ reacts with ${b} g of H₂. Identify the limiting reagent and calculate the mass of NH₃ formed. (N = 14, H = 1)`,
      hi: `अभिक्रिया N₂ + 3H₂ → 2NH₃ में ${a} g N₂ की अभिक्रिया ${b} g H₂ से कराई गई। सीमांत अभिकर्मक पहचानिए तथा बने NH₃ का द्रव्यमान परिकलित कीजिए। (N = 14, H = 1)`,
      steps: [S(`n(N₂) = ${a}/28 = ${fmt(nN)} mol; n(H₂) = ${b}/2 = ${fmt(nH)} mol`, `n(N₂) = ${a}/28 = ${fmt(nN)} mol; n(H₂) = ${b}/2 = ${fmt(nH)} mol`), S(`NH₃ possible from N₂ = ${fmt(2 * nN)} mol; from H₂ = ${fmt(2 * nH / 3)} mol`, `N₂ से संभावित NH₃ = ${fmt(2 * nN)} mol; H₂ से = ${fmt(2 * nH / 3)} mol`), S(`Limiting reagent: ${lim}`, `सीमांत अभिकर्मक: ${lim}`), S(`Mass of NH₃ = ${fmt(nNH3)} × 17 = ${fmt(m)} g`, `NH₃ का द्रव्यमान = ${fmt(nNH3)} × 17 = ${fmt(m)} g`)],
      value: m, unit: 'g', wrong: [Math.max(2 * nN, 2 * nH / 3) * 17, nNH3 * 34, (a + b)] };
  }),
  p('photon', 'XI', 'ch2', 'apply', 'medium', (r) => {
    const lam = r.pick([300, 400, 500, 600, 700]);
    const Ev = PLANCK * CL / (lam * 1e-9);
    return { en: `Calculate the energy of one photon of light of wavelength ${lam} nm. (h = 6.626 × 10⁻³⁴ J s, c = 3 × 10⁸ m s⁻¹)`,
      hi: `${lam} nm तरंगदैर्ध्य के प्रकाश के एक फोटॉन की ऊर्जा परिकलित कीजिए। (h = 6.626 × 10⁻³⁴ J s, c = 3 × 10⁸ m s⁻¹)`,
      steps: [S('E = hc/λ', 'E = hc/λ'), S(`λ = ${lam}×10⁻⁹ m`, `λ = ${lam}×10⁻⁹ m`), S(`E = ${fmt(Ev)} J`, `E = ${fmt(Ev)} J`)],
      value: Ev, unit: 'J', wrong: [Ev * 1e9, PLANCK / (lam * 1e-9), Ev / 1e3] };
  }),
  p('bondorder', 'XI', 'ch4', 'apply', 'medium', (r) => {
    const sp = r.pick([['O₂', 10, 6], ['O₂⁺', 10, 5], ['O₂⁻', 10, 7], ['N₂', 10, 4], ['N₂⁺', 9, 4], ['O₂²⁻', 10, 8], ['B₂', 4, 2]]);
    const bo = (sp[1] - sp[2]) / 2;
    return { en: `Using molecular orbital theory, the species ${sp[0]} has ${sp[1]} electrons in bonding and ${sp[2]} electrons in antibonding molecular orbitals. Calculate its bond order.`,
      hi: `आण्विक कक्षक सिद्धांत के अनुसार, स्पीशीज़ ${sp[0]} में आबंधन आण्विक कक्षकों में ${sp[1]} तथा प्रतिआबंधन आण्विक कक्षकों में ${sp[2]} इलेक्ट्रॉन हैं। इसकी आबंध कोटि परिकलित कीजिए।`,
      steps: [S('Bond order = ½ (N_b − N_a)', 'आबंध कोटि = ½ (N_b − N_a)'), S(`= ½ (${sp[1]} − ${sp[2]})`, `= ½ (${sp[1]} − ${sp[2]})`), S(`Bond order = ${fmt(bo)}`, `आबंध कोटि = ${fmt(bo)}`)],
      value: bo, unit: '', wrong: [sp[1] - sp[2], (sp[1] + sp[2]) / 2, bo + 0.5] };
  }),
  p('combustion', 'XI', 'ch5', 'apply', 'medium', (r) => {
    const m = r.pick([4, 8, 16, 32]);
    const dH = -393.5 + 2 * -285.8 - -74.8, q = m / 16 * -dH;
    return { en: `For CH₄(g) + 2O₂(g) → CO₂(g) + 2H₂O(l), use ΔfH° (kJ mol⁻¹): CH₄ = −74.8, CO₂ = −393.5, H₂O(l) = −285.8 to find the heat released on burning ${m} g of methane. (C = 12, H = 1)`,
      hi: `CH₄(g) + 2O₂(g) → CO₂(g) + 2H₂O(l) के लिए ΔfH° (kJ mol⁻¹): CH₄ = −74.8, CO₂ = −393.5, H₂O(l) = −285.8 के आधार पर ${m} g मेथेन के दहन पर मुक्त ऊष्मा ज्ञात कीजिए। (C = 12, H = 1)`,
      steps: [S('ΔrH° = ΣΔfH°(products) − ΣΔfH°(reactants)', 'ΔrH° = ΣΔfH°(उत्पाद) − ΣΔfH°(अभिकारक)'), S(`ΔrH° = [−393.5 + 2(−285.8)] − [−74.8] = ${fmt(dH, 4)} kJ mol⁻¹`, `ΔrH° = [−393.5 + 2(−285.8)] − [−74.8] = ${fmt(dH, 4)} kJ mol⁻¹`), S(`Moles of CH₄ = ${m}/16 = ${m / 16}`, `CH₄ के मोल = ${m}/16 = ${m / 16}`), S(`Heat released = ${fmt(q)} kJ`, `मुक्त ऊष्मा = ${fmt(q)} kJ`)],
      value: q, unit: 'kJ', wrong: [-dH, q / 2, m * -dH] };
  }),
  p('gibbs', 'XI', 'ch5', 'apply', 'medium', (r) => {
    const dH = r.pick([-40, -20, 30, 50, 100]), dS = r.pick([-50, 60, 120, 200]), T = r.pick([300, 400, 500]);
    const dG = dH - T * dS / 1000, sp = dG < 0 ? ['spontaneous', 'स्वतः प्रवर्तित'] : ['non-spontaneous', 'अस्वतः प्रवर्तित'];
    return { en: `For a reaction ΔH = ${dH} kJ mol⁻¹ and ΔS = ${dS} J K⁻¹ mol⁻¹. Calculate ΔG at ${T} K and state whether the reaction is spontaneous.`,
      hi: `किसी अभिक्रिया के लिए ΔH = ${dH} kJ mol⁻¹ तथा ΔS = ${dS} J K⁻¹ mol⁻¹ है। ${T} K पर ΔG परिकलित कीजिए तथा बताइए कि अभिक्रिया स्वतः प्रवर्तित है या नहीं।`,
      steps: [S('ΔG = ΔH − TΔS', 'ΔG = ΔH − TΔS'), S(`TΔS = ${T}×${dS}/1000 = ${fmt(T * dS / 1000)} kJ`, `TΔS = ${T}×${dS}/1000 = ${fmt(T * dS / 1000)} kJ`), S(`ΔG = ${fmt(dG)} kJ mol⁻¹`, `ΔG = ${fmt(dG)} kJ mol⁻¹`), S(`ΔG ${dG < 0 ? '< 0' : '> 0'}: ${sp[0]}`, `ΔG ${dG < 0 ? '< 0' : '> 0'}: ${sp[1]}`)],
      value: dG, unit: 'kJ mol⁻¹', wrong: [dH - T * dS, dH + T * dS / 1000, -dG], ansText: { en: `ΔG = ${fmt(dG)} kJ mol⁻¹ (${sp[0]})`, hi: `ΔG = ${fmt(dG)} kJ mol⁻¹ (${sp[1]})` },
      wrongText: [{ en: `ΔG = ${fmt(-dG)} kJ mol⁻¹ (${dG < 0 ? 'non-spontaneous' : 'spontaneous'})`, hi: `ΔG = ${fmt(-dG)} kJ mol⁻¹` }, { en: `ΔG = ${fmt(dH - T * dS)} kJ mol⁻¹ (${dH - T * dS < 0 ? 'spontaneous' : 'non-spontaneous'})`, hi: `ΔG = ${fmt(dH - T * dS)} kJ mol⁻¹` }, { en: `ΔG = ${fmt(dH + T * dS / 1000)} kJ mol⁻¹`, hi: `ΔG = ${fmt(dH + T * dS / 1000)} kJ mol⁻¹` }] };
  }),
  p('phstrong', 'XI', 'ch6', 'apply', 'easy', (r) => {
    const c = r.pick([0.1, 0.01, 0.001, 0.05, 0.002]), strong = r.pick([['HCl', 'हाइड्रोक्लोरिक अम्ल']]);
    const pH = -Math.log10(c);
    return { en: `Calculate the pH of a ${c} M solution of ${strong[0]} (assume complete ionisation).`,
      hi: `${c} M ${strong[1]} (${strong[0]}) विलयन का pH परिकलित कीजिए (पूर्ण आयनन मानिए)।`,
      steps: [S(`[H⁺] = ${c} M`, `[H⁺] = ${c} M`), S('pH = −log[H⁺]', 'pH = −log[H⁺]'), S(`pH = ${fmt(pH)}`, `pH = ${fmt(pH)}`)],
      value: pH, unit: '', wrong: [14 - pH, c, pH + 1] };
  }),
  p('phweak', 'XI', 'ch6', 'apply', 'hard', (r) => {
    const c = r.pick([0.1, 0.01, 0.05]), Ka = 1.8e-5;
    const h = Math.sqrt(Ka * c), pH = -Math.log10(h);
    return { en: `Calculate the pH of a ${c} M acetic acid solution. (Ka = 1.8 × 10⁻⁵, log values to be calculated)`,
      hi: `${c} M ऐसीटिक अम्ल विलयन का pH परिकलित कीजिए। (Ka = 1.8 × 10⁻⁵)`,
      steps: [S('For a weak acid [H⁺] = √(Ka·C)', 'दुर्बल अम्ल के लिए [H⁺] = √(Ka·C)'), S(`[H⁺] = √(1.8×10⁻⁵ × ${c}) = ${fmt(h)} M`, `[H⁺] = √(1.8×10⁻⁵ × ${c}) = ${fmt(h)} M`), S(`pH = −log[H⁺] = ${fmt(pH)}`, `pH = −log[H⁺] = ${fmt(pH)}`)],
      value: pH, unit: '', wrong: [-Math.log10(c), 14 - pH, -Math.log10(Ka * c)] };
  }),
  p('kc', 'XI', 'ch6', 'apply', 'medium', (r) => {
    const n2 = r.pick([0.5, 1, 2]), h2 = r.pick([1, 2, 3]), nh3 = r.pick([0.5, 1, 2, 4]);
    const Kc = nh3 ** 2 / (n2 * h2 ** 3);
    return { en: `For N₂(g) + 3H₂(g) ⇌ 2NH₃(g), the equilibrium concentrations are [N₂] = ${n2} M, [H₂] = ${h2} M and [NH₃] = ${nh3} M. Calculate Kc.`,
      hi: `N₂(g) + 3H₂(g) ⇌ 2NH₃(g) के लिए साम्य सांद्रताएँ [N₂] = ${n2} M, [H₂] = ${h2} M तथा [NH₃] = ${nh3} M हैं। Kc परिकलित कीजिए।`,
      steps: [S('Kc = [NH₃]² / ([N₂][H₂]³)', 'Kc = [NH₃]² / ([N₂][H₂]³)'), S(`Kc = ${nh3}² / (${n2} × ${h2}³)`, `Kc = ${nh3}² / (${n2} × ${h2}³)`), S(`Kc = ${fmt(Kc)}`, `Kc = ${fmt(Kc)}`)],
      value: Kc, unit: '', wrong: [nh3 / (n2 * h2), nh3 ** 2 / (n2 * h2), 1 / Kc] };
  }),
  p('oxno', 'XI', 'ch7', 'apply', 'easy', (r) => {
    const sp = r.pick([['Mn', 'KMnO₄', 1, 1, 0], ['Cr', 'K₂Cr₂O₇', 2, 2, 0], ['S', 'H₂SO₄', 1, 1, 0], ['N', 'HNO₃', 1, 1, 0], ['Cl', 'KClO₃', 1, 1, 0], ['P', 'H₃PO₄', 1, 1, 0]]);
    const known = { KMnO4: 1 - 8, K2Cr2O7: 2 - 14, H2SO4: 2 - 8, HNO3: 1 - 6, KClO3: 1 - 6, H3PO4: 3 - 8 };
    const key = sp[1].replace(/[₀-₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)));
    const cnt = sp[0] === 'Cr' ? 2 : 1;
    const x = (0 - known[key]) / cnt;
    return { en: `Calculate the oxidation number of ${sp[0]} in ${sp[1]}.`, hi: `${sp[1]} में ${sp[0]} की ऑक्सीकरण संख्या परिकलित कीजिए।`,
      steps: [S('Sum of oxidation numbers of all atoms in a neutral compound = 0 (H = +1, K = +1, O = −2)', 'उदासीन यौगिक में सभी परमाणुओं की ऑक्सीकरण संख्याओं का योग = 0 (H = +1, K = +1, O = −2)'), S(`${cnt > 1 ? cnt + 'x' : 'x'} + (${known[key]}) = 0`, `${cnt > 1 ? cnt + 'x' : 'x'} + (${known[key]}) = 0`), S(`Oxidation number of ${sp[0]} = +${x}`, `${sp[0]} की ऑक्सीकरण संख्या = +${x}`)],
      value: x, unit: '', wrong: [x - 2, x + 1, x + 2] };
  }),
].filter(Boolean);

const CELLS = [['Zn', -0.76, 'Cu', 0.34], ['Zn', -0.76, 'Ag', 0.80], ['Mg', -2.37, 'Cu', 0.34], ['Fe', -0.44, 'Ag', 0.80], ['Zn', -0.76, 'Fe', -0.44], ['Cu', 0.34, 'Ag', 0.80]];
const IONS = [['Ti³⁺', 'd¹', 1], ['V³⁺', 'd²', 2], ['Cr³⁺', 'd³', 3], ['Mn²⁺', 'd⁵', 5], ['Fe²⁺', 'd⁶', 4], ['Co²⁺', 'd⁷', 3], ['Ni²⁺', 'd⁸', 2], ['Cu²⁺', 'd⁹', 1]];
export const CHEMISTRY_XII = [
  p('molality', 'XII', 'ch1', 'apply', 'easy', (r) => {
    const [s, M, h] = r.pick(SOLUTES), m = r.pick([5, 10, 20, 36]), w = r.pick([100, 200, 250, 500]);
    const mol = (m / M) / (w / 1000);
    return { en: `${m} g of ${s} (molar mass ${M} g mol⁻¹) is dissolved in ${w} g of water. Calculate the molality of the solution.`,
      hi: `${m} g ${h} (मोलर द्रव्यमान ${M} g mol⁻¹) को ${w} g जल में घोला गया। विलयन की मोललता परिकलित कीजिए।`,
      steps: [S('Molality = moles of solute / mass of solvent (kg)', 'मोललता = विलेय के मोल / विलायक का द्रव्यमान (kg)'), S(`Moles = ${m}/${M} = ${fmt(m / M)}`, `मोल = ${m}/${M} = ${fmt(m / M)}`), S(`m = ${fmt(m / M)} / ${w / 1000} = ${fmt(mol)} mol kg⁻¹`, `m = ${fmt(m / M)} / ${w / 1000} = ${fmt(mol)} mol kg⁻¹`)],
      value: mol, unit: 'mol kg⁻¹', wrong: [(m / M) / w, mol / 1000, (m / M) / (w / 1000 + m / 1000)] };
  }),
  p('elevation', 'XII', 'ch1', 'apply', 'medium', (r) => {
    const m = r.pick([0.2, 0.5, 1, 2]), Kb = r.pick([0.52, 0.51, 2.53]);
    const dT = Kb * m;
    return { en: `A non-volatile, non-electrolyte solute forms a ${m} molal solution in a solvent with K_b = ${Kb} K kg mol⁻¹. Calculate the elevation in boiling point.`,
      hi: `किसी अवाष्पशील अनविद्युतअपघट्य विलेय का ${m} मोलल विलयन बनाया गया है, जिसके विलायक का K_b = ${Kb} K kg mol⁻¹ है। क्वथनांक में उन्नयन परिकलित कीजिए।`,
      steps: [S('ΔT_b = K_b × m', 'ΔT_b = K_b × m'), S(`ΔT_b = ${Kb} × ${m}`, `ΔT_b = ${Kb} × ${m}`), S(`ΔT_b = ${fmt(dT)} K`, `ΔT_b = ${fmt(dT)} K`)],
      value: dT, unit: 'K', wrong: [Kb / m, Kb + m, dT * 2] };
  }),
  p('osmotic', 'XII', 'ch1', 'apply', 'medium', (r) => {
    const c = r.pick([0.01, 0.05, 0.1, 0.2]), T = r.pick([273, 298, 300]);
    const pi = c * 0.0821 * T;
    return { en: `Calculate the osmotic pressure in atm of a ${c} M solution of a non-electrolyte at ${T} K. (R = 0.0821 L atm K⁻¹ mol⁻¹)`,
      hi: `${T} K पर किसी अविद्युतअपघट्य के ${c} M विलयन का परासरण दाब atm में परिकलित कीजिए। (R = 0.0821 L atm K⁻¹ mol⁻¹)`,
      steps: [S('π = CRT', 'π = CRT'), S(`π = ${c} × 0.0821 × ${T}`, `π = ${c} × 0.0821 × ${T}`), S(`π = ${fmt(pi)} atm`, `π = ${fmt(pi)} atm`)],
      value: pi, unit: 'atm', wrong: [pi / T, c * T, pi * 10] };
  }),
  p('ecell', 'XII', 'ch2', 'apply', 'easy', (r) => {
    const [a, ea, c, ec] = r.pick(CELLS);
    const E0 = ec - ea;
    if (E0 <= 0) return null;
    const ia = a === 'Ag' ? '⁺' : '²⁺', ic = c === 'Ag' ? '⁺' : '²⁺';
    return { en: `Calculate the standard EMF of the cell ${a}|${a}${ia} || ${c}${ic}|${c}, given E°(${a}${ia}/${a}) = ${ea} V and E°(${c}${ic}/${c}) = ${ec} V.`,
      hi: `सेल ${a}|${a}${ia} || ${c}${ic}|${c} का मानक विद्युत वाहक बल परिकलित कीजिए, जब E°(${a}${ia}/${a}) = ${ea} V तथा E°(${c}${ic}/${c}) = ${ec} V है।`,
      steps: [S('E°cell = E°cathode − E°anode', 'E°सेल = E°कैथोड − E°ऐनोड'), S(`E°cell = ${ec} − (${ea})`, `E°सेल = ${ec} − (${ea})`), S(`E°cell = ${fmt(E0)} V`, `E°सेल = ${fmt(E0)} V`)],
      value: E0, unit: 'V', wrong: [ec + ea, ea - ec, Math.abs(ec) + Math.abs(ea) + 0.1] };
  }),
  p('nernst', 'XII', 'ch2', 'apply', 'hard', (r) => {
    const c = r.pick([0.1, 0.01, 0.001]);
    const Ecell = 1.10 - (0.059 / 2) * Math.log10(c / 1);
    return { en: `For the Daniell cell Zn | Zn²⁺(${c} M) || Cu²⁺(1 M) | Cu, E°cell = 1.10 V. Use the Nernst equation to find the cell potential at 298 K.`,
      hi: `डेनियल सेल Zn | Zn²⁺(${c} M) || Cu²⁺(1 M) | Cu के लिए E°सेल = 1.10 V है। नर्स्ट समीकरण से 298 K पर सेल विभव ज्ञात कीजिए।`,
      steps: [S('Nernst: E = E° − (0.059/n) log Q, n = 2', 'नर्स्ट समीकरण: E = E° − (0.059/n) log Q, n = 2'), S(`Q = [Zn²⁺]/[Cu²⁺] = ${c}`, `Q = [Zn²⁺]/[Cu²⁺] = ${c}`), S(`E = 1.10 − 0.0295 × log ${c} = ${fmt(Ecell)} V`, `E = 1.10 − 0.0295 × log ${c} = ${fmt(Ecell)} V`)],
      value: Ecell, unit: 'V', wrong: [1.10 + (0.059 / 2) * Math.log10(c), 1.10 - 0.059 * Math.log10(c), 1.10] };
  }),
  p('faraday', 'XII', 'ch2', 'apply', 'medium', (r) => {
    const I = r.pick([1, 2, 5]), t = r.pick([10, 30, 60]) * 60, [met, M, z] = r.pick([['Cu', 63.5, 2], ['Ag', 108, 1], ['Zn', 65, 2]]);
    const m = M * I * t / (z * F);
    return { en: `A current of ${I} A is passed for ${t / 60} minutes through a solution of ${met}${z === 1 ? '⁺' : '²⁺'}. Calculate the mass of ${met} deposited. (Molar mass of ${met} = ${M} g mol⁻¹, F = 96500 C mol⁻¹)`,
      hi: `${met}${z === 1 ? '⁺' : '²⁺'} के विलयन में ${I} A धारा ${t / 60} मिनट तक प्रवाहित की गई। निक्षेपित ${met} का द्रव्यमान परिकलित कीजिए। (${met} का मोलर द्रव्यमान = ${M} g mol⁻¹, F = 96500 C mol⁻¹)`,
      steps: [S(`Charge Q = It = ${I}×${t} = ${I * t} C`, `आवेश Q = It = ${I}×${t} = ${I * t} C`), S(`${met}${z === 1 ? '⁺' : '²⁺'} + ${z}e⁻ → ${met}; z = ${z}`, `${met}${z === 1 ? '⁺' : '²⁺'} + ${z}e⁻ → ${met}; z = ${z}`), S('m = M·Q / (z·F)', 'm = M·Q / (z·F)'), S(`m = ${fmt(m)} g`, `m = ${fmt(m)} g`)],
      value: m, unit: 'g', wrong: [m * z, m / z * 0.5, M * I * t / F * 2 * z] };
  }),
  p('firstorder', 'XII', 'ch3', 'apply', 'medium', (r) => {
    const a = 100, x = r.pick([50, 75, 87.5, 90]), t = r.pick([10, 20, 30, 40]);
    const k = 2.303 / t * Math.log10(a / (a - x));
    return { en: `A first-order reaction is ${x}% complete in ${t} minutes. Calculate the rate constant. (log values to be calculated; use 2.303)`,
      hi: `एक प्रथम कोटि की अभिक्रिया ${t} मिनट में ${x}% पूर्ण हो जाती है। वेग स्थिरांक परिकलित कीजिए। (2.303 का प्रयोग कीजिए)`,
      steps: [S('k = (2.303/t) log [A]₀/[A]', 'k = (2.303/t) log [A]₀/[A]'), S(`[A]₀ = 100, [A] = ${100 - x}`, `[A]₀ = 100, [A] = ${100 - x}`), S(`k = (2.303/${t}) × log ${fmt(100 / (100 - x), 4)} = ${fmt(k)} min⁻¹`, `k = (2.303/${t}) × log ${fmt(100 / (100 - x), 4)} = ${fmt(k)} min⁻¹`)],
      value: k, unit: 'min⁻¹', wrong: [k * 2.303, 2.303 / t * Math.log10(x / (100 - x)) || k / 2, 1 / t] };
  }),
  p('halflifek', 'XII', 'ch3', 'apply', 'easy', (r) => {
    const k = r.pick([2, 3.5, 5, 6.93]) * 1e-3;
    const t = 0.693 / k;
    return { en: `The rate constant of a first-order reaction is ${fmt(k)} s⁻¹. Calculate its half-life.`,
      hi: `किसी प्रथम कोटि की अभिक्रिया का वेग स्थिरांक ${fmt(k)} s⁻¹ है। इसकी अर्ध-आयु परिकलित कीजिए।`,
      steps: [S('t½ = 0.693 / k (first order)', 't½ = 0.693 / k (प्रथम कोटि)'), S(`t½ = 0.693 / ${fmt(k)}`, `t½ = 0.693 / ${fmt(k)}`), S(`t½ = ${fmt(t)} s`, `t½ = ${fmt(t)} s`)],
      value: t, unit: 's', wrong: [t / 2, 1 / k, k / 0.693] };
  }),
  p('arrhenius', 'XII', 'ch3', 'apply', 'hard', (r) => {
    const Ea = r.pick([50, 60, 80]), T1 = 300, T2 = r.pick([310, 320]);
    const ratio = Math.pow(10, Ea * 1000 / (2.303 * R) * (1 / T1 - 1 / T2));
    return { en: `A reaction has activation energy ${Ea} kJ mol⁻¹. By what factor does the rate constant increase when temperature is raised from ${T1} K to ${T2} K? (R = 8.314 J mol⁻¹ K⁻¹)`,
      hi: `किसी अभिक्रिया की सक्रियण ऊर्जा ${Ea} kJ mol⁻¹ है। ताप ${T1} K से ${T2} K करने पर वेग स्थिरांक कितने गुना बढ़ जाता है? (R = 8.314 J mol⁻¹ K⁻¹)`,
      steps: [S('log(k₂/k₁) = (Ea/2.303R)(1/T₁ − 1/T₂)', 'log(k₂/k₁) = (Ea/2.303R)(1/T₁ − 1/T₂)'), S(`= (${Ea * 1000}/(2.303×8.314)) × (1/${T1} − 1/${T2}) = ${fmt(Math.log10(ratio), 4)}`, `= (${Ea * 1000}/(2.303×8.314)) × (1/${T1} − 1/${T2}) = ${fmt(Math.log10(ratio), 4)}`), S(`k₂/k₁ = ${fmt(ratio)}`, `k₂/k₁ = ${fmt(ratio)}`)],
      value: ratio, unit: '', wrong: [Math.log10(ratio), ratio * 2, ratio / 2] };
  }),
  p('magmoment', 'XII', 'ch4', 'apply', 'easy', (r) => {
    const [ion, d, n] = r.pick(IONS), mu = Math.sqrt(n * (n + 2));
    return { en: `Calculate the spin-only magnetic moment of ${ion} (configuration ${d}).`, hi: `${ion} (विन्यास ${d}) का केवल-प्रचक्रण चुंबकीय आघूर्ण परिकलित कीजिए।`,
      steps: [S(`Number of unpaired electrons n = ${n}`, `अयुग्मित इलेक्ट्रॉनों की संख्या n = ${n}`), S('μ = √[n(n + 2)] BM', 'μ = √[n(n + 2)] BM'), S(`μ = √(${n}×${n + 2}) = ${fmt(mu)} BM`, `μ = √(${n}×${n + 2}) = ${fmt(mu)} BM`)],
      value: mu, unit: 'BM', wrong: [Math.sqrt(n * (n + 1)), n, Math.sqrt((n + 1) * (n + 3))] };
  }),
  p('cfse', 'XII', 'ch5', 'apply', 'hard', (r) => {
    const d = r.pick([4, 5, 6, 7]), strong = r.chance(0.5);
    let t, e;
    if (strong) { t = Math.min(d, 6); e = d - t; } else { t = Math.min(d, 3) + Math.max(0, d - 5); e = d - t; }
    const cf = -0.4 * t + 0.6 * e;
    return { en: `Calculate the crystal field stabilisation energy (in units of Δ₀, ignoring pairing energy) for an octahedral d${d} complex in a ${strong ? 'strong' : 'weak'}-field ligand environment.`,
      hi: `${strong ? 'प्रबल' : 'दुर्बल'}-क्षेत्र लिगैंड वातावरण में अष्टफलकीय d${d} संकुल की क्रिस्टल क्षेत्र स्थायीकरण ऊर्जा (Δ₀ के मात्रक में, युग्मन ऊर्जा की उपेक्षा करते हुए) परिकलित कीजिए।`,
      steps: [S(`Configuration: t₂g${t} e_g${e}`, `विन्यास: t₂g${t} e_g${e}`), S('CFSE = −0.4 n(t₂g) + 0.6 n(e_g) in Δ₀', 'CFSE = −0.4 n(t₂g) + 0.6 n(e_g) (Δ₀ में)'), S(`CFSE = −0.4×${t} + 0.6×${e} = ${fmt(cf)} Δ₀`, `CFSE = −0.4×${t} + 0.6×${e} = ${fmt(cf)} Δ₀`)],
      value: cf, unit: 'Δ₀', wrong: [-cf, 0.4 * t - 0.6 * e + 0.2, -0.4 * e + 0.6 * t] };
  }),
  p('ean', 'XII', 'ch5', 'apply', 'medium', (r) => {
    const sp = r.pick([['[Fe(CN)₆]⁴⁻', 'Fe', 26, 2, 6], ['[Co(NH₃)₆]³⁺', 'Co', 27, 3, 6], ['[Ni(CO)₄]', 'Ni', 28, 0, 4], ['[Cu(NH₃)₄]²⁺', 'Cu', 29, 2, 4], ['[Cr(H₂O)₆]³⁺', 'Cr', 24, 3, 6]]);
    const ean = sp[2] - sp[3] + 2 * sp[4];
    return { en: `Calculate the effective atomic number (EAN) of ${sp[1]} in ${sp[0]}. (Atomic number of ${sp[1]} = ${sp[2]})`, hi: `${sp[0]} में ${sp[1]} की प्रभावी परमाणु क्रमांक (EAN) परिकलित कीजिए। (${sp[1]} का परमाणु क्रमांक = ${sp[2]})`,
      steps: [S(`Oxidation state of ${sp[1]} = +${sp[3]}, coordination number = ${sp[4]}`, `${sp[1]} की ऑक्सीकरण अवस्था = +${sp[3]}, उपसहसंयोजन संख्या = ${sp[4]}`), S('EAN = Z − (oxidation state) + 2 × (coordination number)', 'EAN = Z − (ऑक्सीकरण अवस्था) + 2 × (उपसहसंयोजन संख्या)'), S(`EAN = ${sp[2]} − ${sp[3]} + ${2 * sp[4]} = ${ean}`, `EAN = ${sp[2]} − ${sp[3]} + ${2 * sp[4]} = ${ean}`)],
      value: ean, unit: '', wrong: [sp[2] - sp[3], sp[2] + sp[3] + 2 * sp[4], sp[2] - sp[3] + sp[4]] };
  }),
].filter(Boolean);
