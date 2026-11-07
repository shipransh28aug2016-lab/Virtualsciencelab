// Physics numeric generators (all values computed from randomised parameters).
import { fmt, sup } from '../util.js';
import { E, rnd } from './common.js';

const K = 9e9, EC = 1.6e-19, EPS0 = 8.85e-12, C = 3e8, H = 6.63e-34, MP = 1.67e-27, ME = 9.1e-31;
const p = (id, cls, ch, bloom, diff, fn) => E(`physics.${cls}.${ch}.${id}`, ch, bloom, diff, fn, { subject: 'physics', cls });

export const PHYSICS_XII = [
  p('coulomb', 'XII', 'ch1', 'apply', 'easy', (r) => {
    const q1 = r.int(2, 9), q2 = r.int(2, 9), d = r.int(2, 9) * 5;
    const F = K * q1 * 1e-6 * q2 * 1e-6 / ((d / 100) ** 2);
    return { en: `Two point charges of ${q1} μC and ${q2} μC are placed ${d} cm apart in vacuum. Calculate the electrostatic force between them. (k = 9 × 10⁹ N m² C⁻²)`,
      hi: `निर्वात में ${q1} μC तथा ${q2} μC के दो बिंदु आवेश ${d} cm की दूरी पर रखे हैं। उनके बीच स्थिरवैद्युत बल परिकलित कीजिए। (k = 9 × 10⁹ N m² C⁻²)`,
      steps: [['Use Coulomb\'s law: F = kq₁q₂/r²', 'कूलॉम का नियम: F = kq₁q₂/r²'], [`Convert units: q₁ = ${q1}×10⁻⁶ C, q₂ = ${q2}×10⁻⁶ C, r = ${d / 100} m`, `मात्रक बदलें: q₁ = ${q1}×10⁻⁶ C, q₂ = ${q2}×10⁻⁶ C, r = ${d / 100} m`], [`Substitute: F = ${fmt(F)} N`, `मान रखने पर: F = ${fmt(F)} N`]],
      value: F, unit: 'N', wrong: [F * 1e4, F / 1e4, F * 100] };
  }),
  p('field', 'XII', 'ch1', 'apply', 'easy', (r) => {
    const q = r.int(2, 20), d = r.int(2, 9) * 10;
    const Ev = K * q * 1e-9 / ((d / 100) ** 2);
    return { en: `Find the magnitude of the electric field at a distance of ${d} cm from a point charge of ${q} nC in air. (k = 9 × 10⁹ N m² C⁻²)`,
      hi: `वायु में ${q} nC के बिंदु आवेश से ${d} cm की दूरी पर विद्युत क्षेत्र का परिमाण ज्ञात कीजिए। (k = 9 × 10⁹ N m² C⁻²)`,
      steps: [['E = kq/r²', 'E = kq/r²'], [`q = ${q}×10⁻⁹ C, r = ${d / 100} m`, `q = ${q}×10⁻⁹ C, r = ${d / 100} m`], [`E = ${fmt(Ev)} N C⁻¹`, `E = ${fmt(Ev)} N C⁻¹`]],
      value: Ev, unit: 'N C⁻¹', wrong: [Ev * 1e4, Ev / 1e4, Ev * 100] };
  }),
  p('gauss', 'XII', 'ch1', 'apply', 'medium', (r) => {
    const q = r.int(2, 18);
    const f = q * 1e-6 / EPS0;
    return { en: `A closed surface encloses a net charge of ${q} μC. Using Gauss's law, find the net electric flux through the surface. (ε₀ = 8.85 × 10⁻¹² C² N⁻¹ m⁻²)`,
      hi: `एक बंद पृष्ठ द्वारा परिबद्ध कुल आवेश ${q} μC है। गाउस के नियम से पृष्ठ से गुज़रने वाला कुल विद्युत फ्लक्स ज्ञात कीजिए। (ε₀ = 8.85 × 10⁻¹² C² N⁻¹ m⁻²)`,
      steps: [['Gauss\'s law: Φ = q/ε₀', 'गाउस का नियम: Φ = q/ε₀'], [`Φ = ${q}×10⁻⁶ / 8.85×10⁻¹²`, `Φ = ${q}×10⁻⁶ / 8.85×10⁻¹²`], [`Φ = ${fmt(f)} N m² C⁻¹`, `Φ = ${fmt(f)} N m² C⁻¹`]],
      value: f, unit: 'N m² C⁻¹', wrong: [f * 1e-6, f * 4 * Math.PI, f / (4 * Math.PI)] };
  }),
  p('capseries', 'XII', 'ch2', 'apply', 'medium', (r) => {
    const c1 = r.int(2, 9), c2 = r.int(2, 9) + 10, V = r.pick([6, 12, 24, 120, 220]);
    const Cs = c1 * c2 / (c1 + c2), U = 0.5 * Cs * 1e-6 * V * V;
    return { en: `Two capacitors of ${c1} μF and ${c2} μF are connected in series across a ${V} V source. Find the energy stored in the combination.`,
      hi: `${c1} μF तथा ${c2} μF के दो संधारित्र श्रेणी क्रम में ${V} V के स्रोत से जोड़े गए हैं। संयोजन में संचित ऊर्जा ज्ञात कीजिए।`,
      steps: [['Equivalent capacitance in series: C = C₁C₂/(C₁+C₂)', 'श्रेणी में तुल्य धारिता: C = C₁C₂/(C₁+C₂)'], [`C = ${fmt(Cs)} μF`, `C = ${fmt(Cs)} μF`], ['Energy U = ½CV²', 'ऊर्जा U = ½CV²'], [`U = ${fmt(U)} J`, `U = ${fmt(U)} J`]],
      value: U, unit: 'J', wrong: [0.5 * (c1 + c2) * 1e-6 * V * V, Cs * 1e-6 * V * V, U * 1e3] };
  }),
  p('parallelplate', 'XII', 'ch2', 'apply', 'medium', (r) => {
    const A = r.int(2, 9) * 100, d = r.int(1, 5);
    const Cv = EPS0 * (A * 1e-4) / (d * 1e-3);
    return { en: `A parallel plate capacitor has plates of area ${A} cm² separated by ${d} mm of air. Calculate its capacitance. (ε₀ = 8.85 × 10⁻¹² F m⁻¹)`,
      hi: `एक समांतर पट्टिका संधारित्र की प्लेटों का क्षेत्रफल ${A} cm² है तथा उनके बीच वायु में ${d} mm की दूरी है। इसकी धारिता परिकलित कीजिए। (ε₀ = 8.85 × 10⁻¹² F m⁻¹)`,
      steps: [['C = ε₀A/d', 'C = ε₀A/d'], [`A = ${A}×10⁻⁴ m², d = ${d}×10⁻³ m`, `A = ${A}×10⁻⁴ m², d = ${d}×10⁻³ m`], [`C = ${fmt(Cv)} F`, `C = ${fmt(Cv)} F`]],
      value: Cv, unit: 'F', wrong: [Cv * 1e4, Cv * 1e-4, Cv * 100] };
  }),
  p('internalres', 'XII', 'ch3', 'apply', 'easy', (r) => {
    const Em = r.pick([6, 9, 12]), rr = r.pick([0.5, 1, 2]), R = r.pick([4, 5, 8, 10, 14]);
    const I = Em / (R + rr), V = I * R;
    return { en: `A cell of emf ${Em} V and internal resistance ${rr} Ω is connected to an external resistor of ${R} Ω. Find the terminal voltage of the cell.`,
      hi: `${Em} V विद्युत वाहक बल तथा ${rr} Ω आंतरिक प्रतिरोध के एक सेल को ${R} Ω के बाह्य प्रतिरोधक से जोड़ा गया है। सेल की टर्मिनल वोल्टता ज्ञात कीजिए।`,
      steps: [['Current I = E/(R + r)', 'धारा I = E/(R + r)'], [`I = ${Em}/(${R}+${rr}) = ${fmt(I)} A`, `I = ${Em}/(${R}+${rr}) = ${fmt(I)} A`], ['Terminal voltage V = IR', 'टर्मिनल वोल्टता V = IR'], [`V = ${fmt(V)} V`, `V = ${fmt(V)} V`]],
      value: V, unit: 'V', wrong: [Em, Em - I, I * rr] };
  }),
  p('network', 'XII', 'ch3', 'analyse', 'medium', (r) => {
    const a = r.pick([6, 12, 20]), b = r.pick([3, 4, 5, 30]), c = r.pick([2, 4, 6]), V = r.pick([12, 24, 30]);
    const par = a * b / (a + b), Rt = par + c, I = V / Rt;
    return { en: `Resistors of ${a} Ω and ${b} Ω in parallel are connected in series with a ${c} Ω resistor across a ${V} V battery of negligible internal resistance. Find the total current drawn from the battery.`,
      hi: `${a} Ω तथा ${b} Ω के प्रतिरोधक समांतर क्रम में हैं और यह संयोजन ${c} Ω के प्रतिरोधक के साथ श्रेणी में ${V} V की (नगण्य आंतरिक प्रतिरोध वाली) बैटरी से जुड़ा है। बैटरी से ली गई कुल धारा ज्ञात कीजिए।`,
      steps: [['Parallel part: R′ = ab/(a+b)', 'समांतर भाग: R′ = ab/(a+b)'], [`R′ = ${fmt(par)} Ω`, `R′ = ${fmt(par)} Ω`], [`Total R = R′ + ${c} = ${fmt(Rt)} Ω`, `कुल R = R′ + ${c} = ${fmt(Rt)} Ω`], [`I = V/R = ${fmt(I)} A`, `I = V/R = ${fmt(I)} A`]],
      value: I, unit: 'A', wrong: [V / (a + b + c), V / (par), V / (a + b) ] };
  }),
  p('cyclotron', 'XII', 'ch4', 'apply', 'medium', (r) => {
    const B = r.pick([0.5, 1, 1.5, 2]) , v = r.int(2, 9) * 1e6;
    const rad = MP * v / (EC * B);
    return { en: `A proton moves at ${fmt(v)} m s⁻¹ perpendicular to a uniform magnetic field of ${B} T. Find the radius of its circular path. (m = 1.67 × 10⁻²⁷ kg, e = 1.6 × 10⁻¹⁹ C)`,
      hi: `एक प्रोटॉन ${fmt(v)} m s⁻¹ के वेग से ${B} T के एकसमान चुंबकीय क्षेत्र के लंबवत गतिमान है। इसके वृत्तीय पथ की त्रिज्या ज्ञात कीजिए। (m = 1.67 × 10⁻²⁷ kg, e = 1.6 × 10⁻¹⁹ C)`,
      steps: [['qvB = mv²/r ⇒ r = mv/(qB)', 'qvB = mv²/r ⇒ r = mv/(qB)'], ['Substitute m, v, q, B', 'm, v, q, B के मान रखने पर'], [`r = ${fmt(rad)} m`, `r = ${fmt(rad)} m`]],
      value: rad, unit: 'm', wrong: [rad * 1836, rad / 2, rad * 2] };
  }),
  p('wireforce', 'XII', 'ch4', 'apply', 'easy', (r) => {
    const B = r.pick([0.2, 0.4, 0.5, 0.8]), I = r.int(2, 10), L = r.pick([0.1, 0.2, 0.25, 0.5]), th = r.pick([30, 90, 90, 60]);
    const F = B * I * L * Math.sin(th * Math.PI / 180);
    return { en: `A straight wire of length ${L} m carrying ${I} A is placed in a magnetic field of ${B} T making an angle of ${th}° with the field. Find the force on the wire.`,
      hi: `${L} m लंबाई के सीधे तार में ${I} A धारा प्रवाहित हो रही है और यह ${B} T के चुंबकीय क्षेत्र से ${th}° का कोण बनाते हुए रखा है। तार पर बल ज्ञात कीजिए।`,
      steps: [['F = BIL sinθ', 'F = BIL sinθ'], [`F = ${B}×${I}×${L}×sin ${th}°`, `F = ${B}×${I}×${L}×sin ${th}°`], [`F = ${fmt(F)} N`, `F = ${fmt(F)} N`]],
      value: F, unit: 'N', wrong: [B * I * L, B * I * L * Math.cos(th * Math.PI / 180) || B * I * L / 2, F * 2] };
  }),
  p('magnettorque', 'XII', 'ch5', 'apply', 'easy', (r) => {
    const m = r.pick([0.5, 1, 2, 2.5]), B = r.pick([0.2, 0.4, 0.5]), th = r.pick([30, 45, 60, 90]);
    const t = m * B * Math.sin(th * Math.PI / 180);
    return { en: `A bar magnet of magnetic moment ${m} A m² is placed in a uniform field of ${B} T at ${th}° to the field. Find the torque acting on it.`,
      hi: `${m} A m² चुंबकीय आघूर्ण का एक छड़ चुंबक ${B} T के एकसमान क्षेत्र में क्षेत्र से ${th}° पर रखा है। उस पर कार्यरत बल-आघूर्ण ज्ञात कीजिए।`,
      steps: [['τ = mB sinθ', 'τ = mB sinθ'], [`τ = ${m}×${B}×sin ${th}°`, `τ = ${m}×${B}×sin ${th}°`], [`τ = ${fmt(t)} N m`, `τ = ${fmt(t)} N m`]],
      value: t, unit: 'N m', wrong: [m * B, m * B * Math.cos(th * Math.PI / 180) || m * B / 2, t * 2] };
  }),
  p('motionalemf', 'XII', 'ch6', 'apply', 'easy', (r) => {
    const B = r.pick([0.2, 0.5, 0.8]), l = r.pick([0.2, 0.5, 1]), v = r.int(2, 10);
    const e = B * l * v;
    return { en: `A conducting rod of length ${l} m moves at ${v} m s⁻¹ perpendicular to a uniform magnetic field of ${B} T. Find the emf induced across its ends.`,
      hi: `${l} m लंबी चालक छड़ ${B} T के एकसमान चुंबकीय क्षेत्र के लंबवत ${v} m s⁻¹ की चाल से गति करती है। इसके सिरों के बीच प्रेरित विद्युत वाहक बल ज्ञात कीजिए।`,
      steps: [['Motional emf ε = Blv', 'गतिज विद्युत वाहक बल ε = Blv'], [`ε = ${B}×${l}×${v}`, `ε = ${B}×${l}×${v}`], [`ε = ${fmt(e)} V`, `ε = ${fmt(e)} V`]],
      value: e, unit: 'V', wrong: [B * v, l * v, e * 10] };
  }),
  p('inductorenergy', 'XII', 'ch6', 'apply', 'easy', (r) => {
    const L = r.pick([0.2, 0.5, 2, 4]), I = r.int(2, 8);
    const U = 0.5 * L * I * I;
    return { en: `An inductor of ${L} H carries a steady current of ${I} A. Find the energy stored in its magnetic field.`,
      hi: `${L} H के प्रेरकत्व वाले प्रेरक में ${I} A की स्थिर धारा प्रवाहित हो रही है। इसके चुंबकीय क्षेत्र में संचित ऊर्जा ज्ञात कीजिए।`,
      steps: [['U = ½LI²', 'U = ½LI²'], [`U = ½ × ${L} × ${I}²`, `U = ½ × ${L} × ${I}²`], [`U = ${fmt(U)} J`, `U = ${fmt(U)} J`]],
      value: U, unit: 'J', wrong: [L * I * I, 0.5 * L * I, L * I] };
  }),
  p('lcr', 'XII', 'ch7', 'apply', 'hard', (r) => {
    const R = r.pick([30, 60, 80]), XL = r.pick([40, 80, 100]), XC = r.pick([0, 20, 60]), V = r.pick([100, 120, 200, 220]);
    const Z = Math.hypot(R, XL - XC), I = V / Z;
    return { en: `In a series LCR circuit, R = ${R} Ω, X_L = ${XL} Ω and X_C = ${XC} Ω. The rms supply voltage is ${V} V. Find the impedance and hence the rms current.`,
      hi: `श्रेणी LCR परिपथ में R = ${R} Ω, X_L = ${XL} Ω तथा X_C = ${XC} Ω है। आपूर्ति की वर्ग-माध्य-मूल (rms) वोल्टता ${V} V है। प्रतिबाधा तथा इस प्रकार rms धारा ज्ञात कीजिए।`,
      steps: [['Z = √[R² + (X_L − X_C)²]', 'Z = √[R² + (X_L − X_C)²]'], [`Z = √[${R}² + ${XL - XC}²] = ${fmt(Z)} Ω`, `Z = √[${R}² + ${XL - XC}²] = ${fmt(Z)} Ω`], ['I_rms = V_rms / Z', 'I_rms = V_rms / Z'], [`I_rms = ${fmt(I)} A`, `I_rms = ${fmt(I)} A`]],
      value: I, unit: 'A', wrong: [V / (R + XL + XC), V / R, V / (R + XL - XC)] };
  }),
  p('resonance', 'XII', 'ch7', 'apply', 'medium', (r) => {
    const L = r.pick([1, 2, 5, 10]), Cm = r.pick([2, 5, 8, 20]);
    const f = 1 / (2 * Math.PI * Math.sqrt(L * 1e-3 * Cm * 1e-6));
    return { en: `Find the resonant frequency of a series LCR circuit with L = ${L} mH and C = ${Cm} μF.`,
      hi: `L = ${L} mH तथा C = ${Cm} μF वाले श्रेणी LCR परिपथ की अनुनादी आवृत्ति ज्ञात कीजिए।`,
      steps: [['f₀ = 1/(2π√LC)', 'f₀ = 1/(2π√LC)'], [`LC = ${L}×10⁻³ × ${Cm}×10⁻⁶`, `LC = ${L}×10⁻³ × ${Cm}×10⁻⁶`], [`f₀ = ${fmt(f)} Hz`, `f₀ = ${fmt(f)} Hz`]],
      value: f, unit: 'Hz', wrong: [1 / Math.sqrt(L * 1e-3 * Cm * 1e-6), f * 2 * Math.PI, f / (2 * Math.PI)] };
  }),
  p('emwave', 'XII', 'ch8', 'apply', 'easy', (r) => {
    const f = r.pick([3, 6, 10, 30, 60]) * 1e6;
    const lam = C / f;
    return { en: `An electromagnetic wave in vacuum has frequency ${fmt(f)} Hz. Find its wavelength. (c = 3 × 10⁸ m s⁻¹)`,
      hi: `निर्वात में एक वैद्युतचुंबकीय तरंग की आवृत्ति ${fmt(f)} Hz है। इसकी तरंगदैर्ध्य ज्ञात कीजिए। (c = 3 × 10⁸ m s⁻¹)`,
      steps: [['c = fλ ⇒ λ = c/f', 'c = fλ ⇒ λ = c/f'], [`λ = 3×10⁸ / ${fmt(f)}`, `λ = 3×10⁸ / ${fmt(f)}`], [`λ = ${fmt(lam)} m`, `λ = ${fmt(lam)} m`]],
      value: lam, unit: 'm', wrong: [lam * 10, lam / 10, C * f] };
  }),
  p('lens', 'XII', 'ch9', 'apply', 'medium', (r) => {
    const f = r.pick([10, 15, 20]), u = r.pick([30, 40, 45, 60]);
    if (u === f) return null;
    const v = (f * u) / (u - f);
    return { en: `An object is placed ${u} cm in front of a convex lens of focal length ${f} cm. Find the position of the image.`,
      hi: `${f} cm फोकस दूरी के उत्तल लेंस के सामने ${u} cm पर एक वस्तु रखी है। प्रतिबिंब की स्थिति ज्ञात कीजिए।`,
      steps: [['Lens formula: 1/v − 1/u = 1/f with u = −' + u + ' cm', 'लेंस सूत्र: 1/v − 1/u = 1/f, जहाँ u = −' + u + ' cm'], [`1/v = 1/${f} − 1/${u}`, `1/v = 1/${f} − 1/${u}`], [`v = +${fmt(v)} cm (real image on the other side)`, `v = +${fmt(v)} cm (दूसरी ओर वास्तविक प्रतिबिंब)`]],
      value: v, unit: 'cm', wrong: [(f * u) / (u + f), f + u, u - f] };
  }),
  p('criticalangle', 'XII', 'ch9', 'apply', 'medium', (r) => {
    const n = r.pick([1.33, 1.41, 1.5, 1.6, 2]);
    const c = Math.asin(1 / n) * 180 / Math.PI;
    return { en: `The refractive index of a medium with respect to air is ${n}. Find the critical angle for light going from this medium to air.`,
      hi: `किसी माध्यम का वायु के सापेक्ष अपवर्तनांक ${n} है। इस माध्यम से वायु में जाने वाले प्रकाश के लिए क्रांतिक कोण ज्ञात कीजिए।`,
      steps: [['sin C = 1/n', 'sin C = 1/n'], [`sin C = 1/${n} = ${fmt(1 / n, 3)}`, `sin C = 1/${n} = ${fmt(1 / n, 3)}`], [`C = ${fmt(c, 3)}°`, `C = ${fmt(c, 3)}°`]],
      value: c, unit: '°', wrong: [Math.asin(Math.min(1, n - 1)) * 180 / Math.PI, 90 - c, Math.acos(1 / n) * 180 / Math.PI + 5] };
  }),
  p('fringe', 'XII', 'ch10', 'apply', 'medium', (r) => {
    const lam = r.pick([500, 550, 600, 650]), d = r.pick([0.2, 0.5, 1]), D = r.pick([1, 1.5, 2]);
    const beta = lam * 1e-9 * D / (d * 1e-3);
    return { en: `In Young's double slit experiment, slits are ${d} mm apart and the screen is ${D} m away. Light of wavelength ${lam} nm is used. Find the fringe width.`,
      hi: `यंग के द्विझिरी प्रयोग में झिरियों के बीच की दूरी ${d} mm तथा परदा ${D} m दूर है। ${lam} nm तरंगदैर्ध्य का प्रकाश प्रयुक्त है। फ्रिंज की चौड़ाई ज्ञात कीजिए।`,
      steps: [['β = λD/d', 'β = λD/d'], [`β = (${lam}×10⁻⁹ × ${D}) / (${d}×10⁻³)`, `β = (${lam}×10⁻⁹ × ${D}) / (${d}×10⁻³)`], [`β = ${fmt(beta * 1e3)} mm`, `β = ${fmt(beta * 1e3)} mm`]],
      value: beta * 1e3, unit: 'mm', wrong: [beta * 1e6, beta * 1e3 * 2, beta] };
  }),
  p('photoelectric', 'XII', 'ch11', 'apply', 'medium', (r) => {
    const lam = r.pick([200, 250, 300, 400]), phi = r.pick([2.0, 2.3, 3.0, 4.2]);
    const E1 = 1240 / lam, K1 = E1 - phi;
    if (K1 <= 0.05) return null;
    return { en: `Light of wavelength ${lam} nm falls on a metal of work function ${phi} eV. Find the maximum kinetic energy of the emitted photoelectrons in eV. (hc = 1240 eV nm)`,
      hi: `${lam} nm तरंगदैर्ध्य का प्रकाश ${phi} eV कार्य-फलन वाली धातु पर आपतित है। उत्सर्जित प्रकाश-इलेक्ट्रॉनों की अधिकतम गतिज ऊर्जा eV में ज्ञात कीजिए। (hc = 1240 eV nm)`,
      steps: [['Photon energy E = hc/λ', 'फोटॉन ऊर्जा E = hc/λ'], [`E = 1240/${lam} = ${fmt(E1)} eV`, `E = 1240/${lam} = ${fmt(E1)} eV`], ['K_max = E − φ (Einstein\'s equation)', 'K_max = E − φ (आइंस्टाइन समीकरण)'], [`K_max = ${fmt(K1)} eV`, `K_max = ${fmt(K1)} eV`]],
      value: K1, unit: 'eV', wrong: [E1, E1 + phi, phi] };
  }),
  p('debroglie', 'XII', 'ch11', 'apply', 'medium', (r) => {
    const V = r.pick([25, 50, 100, 150, 200, 400]);
    const lam = H / Math.sqrt(2 * ME * EC * V) * 1e10;
    return { en: `Find the de Broglie wavelength (in Å) of an electron accelerated from rest through a potential difference of ${V} V. (h = 6.63×10⁻³⁴ J s, m = 9.1×10⁻³¹ kg, e = 1.6×10⁻¹⁹ C)`,
      hi: `विरामावस्था से ${V} V विभवांतर द्वारा त्वरित इलेक्ट्रॉन की दे-ब्रॉग्ली तरंगदैर्ध्य (Å में) ज्ञात कीजिए। (h = 6.63×10⁻³⁴ J s, m = 9.1×10⁻³¹ kg, e = 1.6×10⁻¹⁹ C)`,
      steps: [['Momentum p = √(2meV)', 'संवेग p = √(2meV)'], ['λ = h/p = h/√(2meV)', 'λ = h/p = h/√(2meV)'], [`λ = ${fmt(lam)} Å`, `λ = ${fmt(lam)} Å`]],
      value: lam, unit: 'Å', wrong: [lam * 10, lam / 2, lam * Math.SQRT2], sig: 3 };
  }),
  p('bohr', 'XII', 'ch12', 'apply', 'medium', (r) => {
    const n1 = r.pick([1, 2]), n2 = n1 + r.int(1, 3);
    const Ev = 13.6 * (1 / n1 ** 2 - 1 / n2 ** 2);
    return { en: `Calculate the energy of the photon emitted when an electron in a hydrogen atom jumps from the n = ${n2} level to the n = ${n1} level. (E_n = −13.6/n² eV)`,
      hi: `हाइड्रोजन परमाणु में इलेक्ट्रॉन के n = ${n2} से n = ${n1} स्तर में संक्रमण पर उत्सर्जित फोटॉन की ऊर्जा परिकलित कीजिए। (E_n = −13.6/n² eV)`,
      steps: [[`E_${n2} = −13.6/${n2}² = ${fmt(-13.6 / n2 ** 2)} eV`, `E_${n2} = −13.6/${n2}² = ${fmt(-13.6 / n2 ** 2)} eV`], [`E_${n1} = −13.6/${n1}² = ${fmt(-13.6 / n1 ** 2)} eV`, `E_${n1} = −13.6/${n1}² = ${fmt(-13.6 / n1 ** 2)} eV`], [`E = E_${n2} − E_${n1}; |E| = ${fmt(Ev)} eV`, `E = E_${n2} − E_${n1}; |E| = ${fmt(Ev)} eV`]],
      value: Ev, unit: 'eV', wrong: [13.6 / n1 ** 2, 13.6 / n2 ** 2, 13.6 * (1 / n1 - 1 / n2)] };
  }),
  p('halflife', 'XII', 'ch13', 'apply', 'medium', (r) => {
    const T = r.pick([2, 5, 10, 20]), n = r.int(2, 5), N0 = r.pick([800, 1600, 640]), t = T * n;
    const N = N0 / 2 ** n;
    return { en: `A radioactive sample has ${N0} g of a nuclide with half-life ${T} years. How much remains undecayed after ${t} years?`,
      hi: `किसी रेडियोऐक्टिव नाभिक के ${N0} g नमूने की अर्ध-आयु ${T} वर्ष है। ${t} वर्ष बाद कितना नमूना अविघटित बचेगा?`,
      steps: [[`Number of half-lives n = ${t}/${T} = ${n}`, `अर्ध-आयु की संख्या n = ${t}/${T} = ${n}`], ['N = N₀ (½)ⁿ', 'N = N₀ (½)ⁿ'], [`N = ${N0}/${2 ** n} = ${fmt(N)} g`, `N = ${N0}/${2 ** n} = ${fmt(N)} g`]],
      value: N, unit: 'g', wrong: [N0 / n, N0 - N, N0 / (2 * n)] };
  }),
  p('massdefect', 'XII', 'ch13', 'apply', 'medium', (r) => {
    const dm = r.pick([0.0305, 0.0304, 0.0292, 0.0475, 0.1]);
    const Ev = dm * 931.5;
    return { en: `The mass defect of a nucleus is ${dm} u. Calculate its binding energy in MeV. (1 u = 931.5 MeV/c²)`,
      hi: `किसी नाभिक का द्रव्यमान क्षति ${dm} u है। इसकी बंधन ऊर्जा MeV में परिकलित कीजिए। (1 u = 931.5 MeV/c²)`,
      steps: [['Binding energy = Δm × 931.5 MeV', 'बंधन ऊर्जा = Δm × 931.5 MeV'], [`= ${dm} × 931.5`, `= ${dm} × 931.5`], [`= ${fmt(Ev)} MeV`, `= ${fmt(Ev)} MeV`]],
      value: Ev, unit: 'MeV', wrong: [dm * 931.5 * 1e3, dm * 9e16, dm / 931.5] };
  }),
  p('transistor', 'XII', 'ch14', 'apply', 'easy', (r) => {
    const Ib = r.pick([20, 40, 50, 60]), Ic = r.pick([2, 3, 4, 5]);
    const beta = Ic * 1000 / Ib;
    return { en: `In a common-emitter transistor circuit, the base current is ${Ib} μA and the collector current is ${Ic} mA. Find the current gain β.`,
      hi: `उभयनिष्ठ-उत्सर्जक ट्रांजिस्टर परिपथ में आधार धारा ${Ib} μA तथा संग्राहक धारा ${Ic} mA है। धारा लब्धि β ज्ञात कीजिए।`,
      steps: [['β = I_C / I_B', 'β = I_C / I_B'], [`β = (${Ic}×10⁻³)/(${Ib}×10⁻⁶)`, `β = (${Ic}×10⁻³)/(${Ib}×10⁻⁶)`], [`β = ${fmt(beta)}`, `β = ${fmt(beta)}`]],
      value: beta, unit: '', wrong: [Ic / Ib, beta * 1000, beta + 1] };
  }),
].filter(Boolean);

const g10 = 'Take g = 10 m s⁻².';
export const PHYSICS_XI = [
  p('perror', 'XI', 'ch1', 'apply', 'medium', (r) => {
    const a = r.int(1, 4), b = r.int(1, 4), c = r.int(1, 3);
    const e = 2 * a + b + c;
    return { en: `A physical quantity is given by X = A²B/C. The percentage errors in A, B and C are ${a}%, ${b}% and ${c}% respectively. Find the maximum percentage error in X.`,
      hi: `किसी भौतिक राशि का मान X = A²B/C से दिया जाता है। A, B तथा C में प्रतिशत त्रुटियाँ क्रमशः ${a}%, ${b}% और ${c}% हैं। X में अधिकतम प्रतिशत त्रुटि ज्ञात कीजिए।`,
      steps: [['ΔX/X = 2(ΔA/A) + ΔB/B + ΔC/C', 'ΔX/X = 2(ΔA/A) + ΔB/B + ΔC/C'], [`= 2×${a} + ${b} + ${c}`, `= 2×${a} + ${b} + ${c}`], [`Maximum error = ${e}%`, `अधिकतम त्रुटि = ${e}%`]],
      value: e, unit: '%', wrong: [a + b + c, 2 * a + b - c, a + 2 * b + c] };
  }),
  p('kinematics', 'XI', 'ch2', 'apply', 'easy', (r) => {
    const u = r.int(0, 10), a = r.int(2, 6), t = r.int(3, 10);
    const s = u * t + 0.5 * a * t * t;
    return { en: `A car starting with a speed of ${u} m s⁻¹ accelerates uniformly at ${a} m s⁻² for ${t} s. Find the distance travelled in this time.`,
      hi: `${u} m s⁻¹ की प्रारंभिक चाल से चलती कार ${t} s तक ${a} m s⁻² के एकसमान त्वरण से चलती है। इस अवधि में तय की गई दूरी ज्ञात कीजिए।`,
      steps: [['s = ut + ½at²', 's = ut + ½at²'], [`s = ${u}×${t} + ½×${a}×${t}²`, `s = ${u}×${t} + ½×${a}×${t}²`], [`s = ${fmt(s)} m`, `s = ${fmt(s)} m`]],
      value: s, unit: 'm', wrong: [u * t + a * t * t, 0.5 * a * t * t, (u + a * t) * t] };
  }),
  p('freefall', 'XI', 'ch2', 'apply', 'easy', (r) => {
    const h = r.pick([20, 45, 80, 125, 180]);
    const t = Math.sqrt(2 * h / 10);
    return { en: `A stone is dropped from a tower ${h} m high. Find the time taken to reach the ground. ${g10}`,
      hi: `${h} m ऊँची मीनार से एक पत्थर गिराया जाता है। भूमि तक पहुँचने में लगा समय ज्ञात कीजिए। g = 10 m s⁻² लीजिए।`,
      steps: [['h = ½gt² (u = 0)', 'h = ½gt² (u = 0)'], [`t = √(2h/g) = √(2×${h}/10)`, `t = √(2h/g) = √(2×${h}/10)`], [`t = ${fmt(t)} s`, `t = ${fmt(t)} s`]],
      value: t, unit: 's', wrong: [Math.sqrt(h / 10), 2 * h / 10, Math.sqrt(2 * h)] };
  }),
  p('projectile', 'XI', 'ch3', 'apply', 'medium', (r) => {
    const u = r.pick([20, 30, 40, 50]), th = r.pick([30, 45, 60]);
    const R = u * u * Math.sin(2 * th * Math.PI / 180) / 10;
    return { en: `A projectile is fired with a speed of ${u} m s⁻¹ at ${th}° to the horizontal. Find its horizontal range. ${g10}`,
      hi: `एक प्रक्षेप्य को क्षैतिज से ${th}° कोण पर ${u} m s⁻¹ की चाल से फेंका जाता है। इसका क्षैतिज परास ज्ञात कीजिए। g = 10 m s⁻² लीजिए।`,
      steps: [['R = u² sin2θ / g', 'R = u² sin2θ / g'], [`R = ${u}² × sin ${2 * th}° / 10`, `R = ${u}² × sin ${2 * th}° / 10`], [`R = ${fmt(R)} m`, `R = ${fmt(R)} m`]],
      value: R, unit: 'm', wrong: [u * u * Math.sin(th * Math.PI / 180) / 10, u * u / 10, R * 2] };
  }),
  p('newton', 'XI', 'ch4', 'apply', 'easy', (r) => {
    const m = r.int(2, 10), F = r.int(2, 8) * 10, f = r.int(1, 3) * 5;
    const a = (F - f) / m;
    return { en: `A block of mass ${m} kg is pulled on a rough horizontal surface by a force of ${F} N. The friction force is ${f} N. Find the acceleration of the block.`,
      hi: `${m} kg द्रव्यमान के गुटके को खुरदरी क्षैतिज सतह पर ${F} N बल से खींचा जाता है। घर्षण बल ${f} N है। गुटके का त्वरण ज्ञात कीजिए।`,
      steps: [['Net force = F − f', 'परिणामी बल = F − f'], [`Net force = ${F} − ${f} = ${F - f} N`, `परिणामी बल = ${F} − ${f} = ${F - f} N`], [`a = (F − f)/m = ${fmt(a)} m s⁻²`, `a = (F − f)/m = ${fmt(a)} m s⁻²`]],
      value: a, unit: 'm s⁻²', wrong: [F / m, (F + f) / m, f / m] };
  }),
  p('incline', 'XI', 'ch4', 'apply', 'hard', (r) => {
    const mu = r.pick([0.1, 0.2, 0.25]), th = 30;
    const a = 10 * (Math.sin(th * Math.PI / 180) - mu * Math.cos(th * Math.PI / 180));
    return { en: `A block slides down a rough inclined plane of inclination ${th}° with coefficient of kinetic friction ${mu}. Find its acceleration. ${g10}`,
      hi: `एक गुटका ${th}° झुकाव के खुरदरे आनत तल पर नीचे फिसलता है; गतिज घर्षण गुणांक ${mu} है। उसका त्वरण ज्ञात कीजिए। g = 10 m s⁻² लीजिए।`,
      steps: [['Along the plane: mg sinθ − μ mg cosθ = ma', 'तल के अनुदिश: mg sinθ − μ mg cosθ = ma'], [`a = g(sin ${th}° − ${mu} cos ${th}°)`, `a = g(sin ${th}° − ${mu} cos ${th}°)`], [`a = ${fmt(a)} m s⁻²`, `a = ${fmt(a)} m s⁻²`]],
      value: a, unit: 'm s⁻²', wrong: [10 * Math.sin(th * Math.PI / 180), 10 * (Math.sin(th * Math.PI / 180) + mu * Math.cos(th * Math.PI / 180)), 10 * (Math.cos(th * Math.PI / 180) - mu * Math.sin(th * Math.PI / 180))] };
  }),
  p('work', 'XI', 'ch5', 'apply', 'easy', (r) => {
    const F = r.int(2, 10) * 10, d = r.int(2, 10), th = r.pick([30, 60]);
    const W = F * d * Math.cos(th * Math.PI / 180);
    return { en: `A force of ${F} N acts on a body at ${th}° to the direction of displacement and displaces it by ${d} m. Find the work done.`,
      hi: `${F} N का बल किसी पिंड पर विस्थापन की दिशा से ${th}° कोण पर लगकर उसे ${d} m विस्थापित करता है। किया गया कार्य ज्ञात कीजिए।`,
      steps: [['W = F d cosθ', 'W = F d cosθ'], [`W = ${F}×${d}×cos ${th}°`, `W = ${F}×${d}×cos ${th}°`], [`W = ${fmt(W)} J`, `W = ${fmt(W)} J`]],
      value: W, unit: 'J', wrong: [F * d, F * d * Math.sin(th * Math.PI / 180), F * d * 2] };
  }),
  p('power', 'XI', 'ch5', 'apply', 'easy', (r) => {
    const m = r.pick([50, 60, 80, 100]), h = r.pick([5, 10, 12, 20]), t = r.pick([10, 20, 25, 40]);
    const P = m * 10 * h / t;
    return { en: `A pump lifts ${m} kg of water through a height of ${h} m in ${t} s. Calculate the power delivered. ${g10}`,
      hi: `एक पंप ${m} kg जल को ${h} m ऊँचाई तक ${t} s में उठाता है। दी गई शक्ति परिकलित कीजिए। g = 10 m s⁻² लीजिए।`,
      steps: [['Work done W = mgh', 'किया गया कार्य W = mgh'], [`W = ${m}×10×${h} = ${m * 10 * h} J`, `W = ${m}×10×${h} = ${m * 10 * h} J`], [`P = W/t = ${fmt(P)} W`, `P = W/t = ${fmt(P)} W`]],
      value: P, unit: 'W', wrong: [m * 10 * h, m * h / t, P * 10] };
  }),
  p('angmom', 'XI', 'ch6', 'apply', 'medium', (r) => {
    const w1 = r.pick([20, 30, 40]), f = r.pick([2, 4]);
    const w2 = w1 / f;
    return { en: `A skater spinning at ${w1} rad s⁻¹ extends her arms so that her moment of inertia becomes ${f} times the initial value. Find her new angular speed.`,
      hi: `${w1} rad s⁻¹ से घूमती एक स्केटर अपनी भुजाएँ फैलाती है जिससे उसका जड़त्व-आघूर्ण प्रारंभिक मान का ${f} गुना हो जाता है। उसकी नई कोणीय चाल ज्ञात कीजिए।`,
      steps: [['Angular momentum is conserved: I₁ω₁ = I₂ω₂', 'कोणीय संवेग संरक्षित है: I₁ω₁ = I₂ω₂'], [`ω₂ = ω₁ I₁/I₂ = ${w1}/${f}`, `ω₂ = ω₁ I₁/I₂ = ${w1}/${f}`], [`ω₂ = ${fmt(w2)} rad s⁻¹`, `ω₂ = ${fmt(w2)} rad s⁻¹`]],
      value: w2, unit: 'rad s⁻¹', wrong: [w1 * f, w1, w1 / (f * f)] };
  }),
  p('gheight', 'XI', 'ch7', 'apply', 'medium', (r) => {
    const [lab, labh, ratio] = r.pick([['R', 'R', 1], ['2R', '2R', 2], ['R/2', 'R/2', 0.5]]);
    const gv = 10 * (1 / (1 + ratio)) ** 2;
    return { en: `Find the acceleration due to gravity at a height ${lab} above the Earth's surface, where R is the radius of the Earth. (g at the surface = 10 m s⁻²)`,
      hi: `पृथ्वी की सतह से ${labh} ऊँचाई पर गुरुत्वीय त्वरण ज्ञात कीजिए, जहाँ R पृथ्वी की त्रिज्या है। (सतह पर g = 10 m s⁻²)`,
      steps: [["g′ = g R²/(R + h)²", "g′ = g R²/(R + h)²"], [`g′ = 10 /(1 + ${ratio})²`, `g′ = 10 /(1 + ${ratio})²`], [`g′ = ${fmt(gv)} m s⁻²`, `g′ = ${fmt(gv)} m s⁻²`]],
      value: gv, unit: 'm s⁻²', wrong: [10 / (1 + ratio), 10 * (1 - 2 * ratio), 10 / (ratio * ratio + 1)] };
  }),
  p('young', 'XI', 'ch8', 'apply', 'medium', (r) => {
    const F = r.pick([100, 200, 500]), L = r.pick([1, 2]), A = r.pick([1, 2, 4]), dl = r.pick([0.5, 1, 2]);
    const Y = F * L / (A * 1e-6 * dl * 1e-3);
    return { en: `A wire of length ${L} m and cross-sectional area ${A} mm² is stretched by ${dl} mm under a load of ${F} N. Find Young's modulus of the material.`,
      hi: `${L} m लंबे तथा ${A} mm² अनुप्रस्थ काट वाले तार पर ${F} N भार लगाने से उसकी लंबाई ${dl} mm बढ़ जाती है। पदार्थ का यंग प्रत्यास्थता गुणांक ज्ञात कीजिए।`,
      steps: [['Y = (F/A)/(ΔL/L) = FL/(AΔL)', 'Y = (F/A)/(ΔL/L) = FL/(AΔL)'], [`A = ${A}×10⁻⁶ m², ΔL = ${dl}×10⁻³ m`, `A = ${A}×10⁻⁶ m², ΔL = ${dl}×10⁻³ m`], [`Y = ${fmt(Y)} N m⁻²`, `Y = ${fmt(Y)} N m⁻²`]],
      value: Y, unit: 'N m⁻²', wrong: [Y * 1e3, Y / 1e3, Y * 1e-6] };
  }),
  p('continuity', 'XI', 'ch9', 'apply', 'medium', (r) => {
    const A1 = r.pick([20, 40, 60]), f = r.pick([2, 4, 5]), v1 = r.pick([1, 2, 3]);
    const v2 = v1 * f;
    return { en: `Water flows at ${v1} m s⁻¹ through a pipe of cross-section ${A1} cm². The pipe narrows to ${A1 / f} cm². Find the speed of water in the narrow part.`,
      hi: `${A1} cm² अनुप्रस्थ काट की नली में जल ${v1} m s⁻¹ की चाल से बह रहा है। नली संकरी होकर ${A1 / f} cm² हो जाती है। संकरे भाग में जल की चाल ज्ञात कीजिए।`,
      steps: [['Equation of continuity: A₁v₁ = A₂v₂', 'सांतत्य समीकरण: A₁v₁ = A₂v₂'], [`v₂ = ${A1}×${v1}/${A1 / f}`, `v₂ = ${A1}×${v1}/${A1 / f}`], [`v₂ = ${fmt(v2)} m s⁻¹`, `v₂ = ${fmt(v2)} m s⁻¹`]],
      value: v2, unit: 'm s⁻¹', wrong: [v1 / f, v1 + f, v1 * f * f] };
  }),
  p('hydrostatic', 'XI', 'ch9', 'apply', 'easy', (r) => {
    const h = r.pick([2, 5, 10, 20]), rho = r.pick([1000, 1000, 800, 1360]);
    const P = rho * 10 * h;
    return { en: `Find the gauge pressure at a depth of ${h} m in a liquid of density ${rho} kg m⁻³. ${g10}`,
      hi: `${rho} kg m⁻³ घनत्व के द्रव में ${h} m की गहराई पर गेज दाब ज्ञात कीजिए। g = 10 m s⁻² लीजिए।`,
      steps: [['P = ρgh', 'P = ρgh'], [`P = ${rho}×10×${h}`, `P = ${rho}×10×${h}`], [`P = ${fmt(P)} Pa`, `P = ${fmt(P)} Pa`]],
      value: P, unit: 'Pa', wrong: [P + 1.01e5, P / 10, rho * h] };
  }),
  p('calorimetry', 'XI', 'ch10', 'apply', 'medium', (r) => {
    const m1 = r.pick([100, 200, 300]), T1 = r.pick([60, 80, 90]), m2 = r.pick([100, 200, 400]), T2 = r.pick([10, 20, 30]);
    const Tf = (m1 * T1 + m2 * T2) / (m1 + m2);
    return { en: `${m1} g of water at ${T1} °C is mixed with ${m2} g of water at ${T2} °C. Find the final temperature of the mixture (no heat loss).`,
      hi: `${T1} °C पर ${m1} g जल को ${T2} °C पर ${m2} g जल में मिलाया जाता है। मिश्रण का अंतिम ताप ज्ञात कीजिए (ऊष्मा हानि नगण्य)।`,
      steps: [['Heat lost = heat gained', 'त्यागी गई ऊष्मा = ली गई ऊष्मा'], [`m₁(T₁ − T) = m₂(T − T₂)`, `m₁(T₁ − T) = m₂(T − T₂)`], [`T = (${m1}×${T1} + ${m2}×${T2})/${m1 + m2} = ${fmt(Tf)} °C`, `T = (${m1}×${T1} + ${m2}×${T2})/${m1 + m2} = ${fmt(Tf)} °C`]],
      value: Tf, unit: '°C', wrong: [(T1 + T2) / 2, T1 - T2, (m1 * T2 + m2 * T1) / (m1 + m2)] };
  }),
  p('carnot', 'XI', 'ch11', 'apply', 'medium', (r) => {
    const T1 = r.pick([400, 500, 600, 800]), T2 = r.pick([200, 250, 300]);
    const eta = (1 - T2 / T1) * 100;
    return { en: `A Carnot engine works between a source at ${T1} K and a sink at ${T2} K. Find its efficiency in percent.`,
      hi: `एक कार्नो इंजन ${T1} K ताप के स्रोत तथा ${T2} K ताप के सिंक के बीच कार्य करता है। इसकी दक्षता प्रतिशत में ज्ञात कीजिए।`,
      steps: [['η = 1 − T₂/T₁ (temperatures in kelvin)', 'η = 1 − T₂/T₁ (ताप केल्विन में)'], [`η = 1 − ${T2}/${T1}`, `η = 1 − ${T2}/${T1}`], [`η = ${fmt(eta)}%`, `η = ${fmt(eta)}%`]],
      value: eta, unit: '%', wrong: [T2 / T1 * 100, (1 - T1 / T2) * -100 / 2, (T1 - T2) / T2 * 10] };
  }),
  p('rms', 'XI', 'ch12', 'apply', 'medium', (r) => {
    const T = r.pick([300, 400, 500, 600]);
    const v = Math.sqrt(3 * 8.314 * T / 0.032);
    return { en: `Calculate the rms speed of oxygen molecules (M = 32 g mol⁻¹) at ${T} K. (R = 8.314 J mol⁻¹ K⁻¹)`,
      hi: `${T} K पर ऑक्सीजन अणुओं (M = 32 g mol⁻¹) की वर्ग-माध्य-मूल चाल परिकलित कीजिए। (R = 8.314 J mol⁻¹ K⁻¹)`,
      steps: [['v_rms = √(3RT/M)', 'v_rms = √(3RT/M)'], ['M = 0.032 kg mol⁻¹', 'M = 0.032 kg mol⁻¹'], [`v_rms = ${fmt(v)} m s⁻¹`, `v_rms = ${fmt(v)} m s⁻¹`]],
      value: v, unit: 'm s⁻¹', wrong: [Math.sqrt(3 * 8.314 * T / 32), v / Math.SQRT2, v * Math.sqrt(3)] };
  }),
  p('shm', 'XI', 'ch13', 'apply', 'medium', (r) => {
    const m = r.pick([0.1, 0.2, 0.5, 1]), k = r.pick([10, 20, 50, 100]);
    const T = 2 * Math.PI * Math.sqrt(m / k);
    return { en: `A mass of ${m} kg attached to a spring of force constant ${k} N m⁻¹ executes simple harmonic motion. Find its time period.`,
      hi: `${k} N m⁻¹ बल-नियतांक की स्प्रिंग से जुड़ा ${m} kg का द्रव्यमान सरल आवर्त गति करता है। इसका आवर्त काल ज्ञात कीजिए।`,
      steps: [['T = 2π√(m/k)', 'T = 2π√(m/k)'], [`T = 2π√(${m}/${k})`, `T = 2π√(${m}/${k})`], [`T = ${fmt(T)} s`, `T = ${fmt(T)} s`]],
      value: T, unit: 's', wrong: [2 * Math.PI * Math.sqrt(k / m), Math.sqrt(m / k), 2 * Math.PI * m / k] };
  }),
  p('pipe', 'XI', 'ch14', 'apply', 'medium', (r) => {
    const L = r.pick([0.25, 0.5, 0.85]), v = r.pick([330, 340, 340]);
    const f = v / (4 * L);
    return { en: `Find the fundamental frequency of a closed organ pipe of length ${L} m. Speed of sound = ${v} m s⁻¹.`,
      hi: `${L} m लंबाई की बंद ऑर्गन नली की मूल आवृत्ति ज्ञात कीजिए। ध्वनि की चाल = ${v} m s⁻¹।`,
      steps: [['For a closed pipe λ = 4L', 'बंद नली के लिए λ = 4L'], ['f = v/(4L)', 'f = v/(4L)'], [`f = ${v}/(4×${L}) = ${fmt(f)} Hz`, `f = ${v}/(4×${L}) = ${fmt(f)} Hz`]],
      value: f, unit: 'Hz', wrong: [v / (2 * L), v / L, v / (8 * L)] };
  }),
].filter(Boolean);

// Case-based (computed): series circuit scenario and projectile scenario.
export const PHYSICS_CASES = [
  E('physics.XII.ch3.case-circuit', 'ch3', 'apply', 'medium', (r) => {
    const Em = r.pick([6, 12]), rr = r.pick([1, 2]), R = r.pick([4, 10, 22].filter((x) => x > rr));
    const I = Em / (R + rr), V = I * R, lost = I * rr, P = I * I * R;
    return { case: true,
      passage: { en: `A cell of emf ${Em} V and internal resistance ${rr} Ω is connected across an external resistor R = ${R} Ω. A student measures the current and the potential difference across the cell to study how the terminal voltage differs from the emf.`,
        hi: `${Em} V विद्युत वाहक बल तथा ${rr} Ω आंतरिक प्रतिरोध का एक सेल ${R} Ω के बाह्य प्रतिरोधक R से जुड़ा है। एक विद्यार्थी धारा तथा सेल के सिरों के विभवांतर को मापकर यह देखता है कि टर्मिनल वोल्टता विद्युत वाहक बल से कैसे भिन्न है।` },
      subs: [
        { marks: 1, mode: 'mcq', en: 'The current in the circuit is:', hi: 'परिपथ में धारा है:', steps: [['I = E/(R + r)', 'I = E/(R + r)']], value: I, unit: 'A', wrong: [Em / R, Em / rr, Em * (R + rr)] },
        { marks: 1, mode: 'mcq', en: 'The terminal voltage of the cell is:', hi: 'सेल की टर्मिनल वोल्टता है:', steps: [['V = IR', 'V = IR']], value: V, unit: 'V', wrong: [Em, lost, Em + lost] },
        { marks: 2, mode: 'num', en: 'Calculate the voltage lost inside the cell and the power dissipated in R.', hi: 'सेल के भीतर वोल्टता ह्रास तथा R में क्षयित शक्ति परिकलित कीजिए।',
          steps: [[`Lost voltage = Ir = ${fmt(lost)} V`, `वोल्टता ह्रास = Ir = ${fmt(lost)} V`], [`P = I²R = ${fmt(P)} W`, `P = I²R = ${fmt(P)} W`]],
          ansText: { en: `${fmt(lost)} V; ${fmt(P)} W`, hi: `${fmt(lost)} V; ${fmt(P)} W` }, value: P, unit: 'W' }] };
  }, { kind: 'case', subject: 'physics', cls: 'XII' }),
  E('physics.XI.ch3.case-projectile', 'ch3', 'apply', 'medium', (r) => {
    const u = r.pick([20, 30, 40]), th = 30;
    const T = 2 * u * Math.sin(th * Math.PI / 180) / 10, H = (u * Math.sin(th * Math.PI / 180)) ** 2 / 20, R = u * u * Math.sin(2 * th * Math.PI / 180) / 10;
    return { case: true,
      passage: { en: `In a sports trial, a ball is kicked with a speed of ${u} m s⁻¹ at ${th}° above the horizontal on level ground. Neglect air resistance and take g = 10 m s⁻².`,
        hi: `एक खेल-परीक्षण में समतल भूमि पर एक गेंद को क्षैतिज से ${th}° ऊपर ${u} m s⁻¹ की चाल से मारा जाता है। वायु प्रतिरोध नगण्य मानिए तथा g = 10 m s⁻² लीजिए।` },
      subs: [
        { marks: 1, mode: 'mcq', en: 'The time of flight of the ball is:', hi: 'गेंद का उड़ान-काल है:', steps: [['T = 2u sinθ/g', 'T = 2u sinθ/g']], value: T, unit: 's', wrong: [T / 2, T * 2, u / 10] },
        { marks: 1, mode: 'mcq', en: 'The maximum height reached is:', hi: 'गेंद द्वारा प्राप्त अधिकतम ऊँचाई है:', steps: [['H = u² sin²θ / 2g', 'H = u² sin²θ / 2g']], value: H, unit: 'm', wrong: [H * 2, H * 4, u * u / 20] },
        { marks: 2, mode: 'num', en: 'Find the horizontal range and state the angle that gives the same range with this speed.', hi: 'क्षैतिज परास ज्ञात कीजिए तथा इसी चाल पर समान परास देने वाला कोण बताइए।',
          steps: [[`R = u² sin2θ/g = ${fmt(R)} m`, `R = u² sin2θ/g = ${fmt(R)} m`], ['Same range for the complementary angle: 90° − 30° = 60°', 'पूरक कोण पर समान परास: 90° − 30° = 60°']],
          ansText: { en: `${fmt(R)} m; 60°`, hi: `${fmt(R)} m; 60°` }, value: R, unit: 'm' }] };
  }, { kind: 'case', subject: 'physics', cls: 'XI' }),
];
