// Mathematics generators (Class X, XI, XII). Integer-friendly so answers are exact.
import { fmt, fracStr, gcd } from '../util.js';
import { E } from './common.js';

const S = (en, hi = en) => [en, hi];
const A = (en, hi) => ({ en, hi });
const mk = (cls) => (id, ch, bloom, diff, fn) => E(`maths.${cls}.${ch}.${id}`, ch, bloom, diff, fn, { subject: 'maths', cls });
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const nCr = (n, r) => fact(n) / (fact(r) * fact(n - r));
const nPr = (n, r) => fact(n) / fact(n - r);
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const mat = (m) => '[' + m.map((r) => r.join(' ')).join(' ; ') + ']';

const x = mk('X'), xi = mk('XI'), xii = mk('XII');

export const MATHS_X = [
  x('hcf-lcm', 'ch1', 'apply', 'easy', (r) => {
    const g = r.int(2, 9), a = r.pick([2, 3, 4, 5, 6]), b = r.pick([7, 8, 9, 10, 11]);
    const n1 = g * a, n2 = g * b, G = gcd(n1, n2), L = n1 * n2 / G;
    return { en: `Find the HCF and LCM of ${n1} and ${n2}, and verify that HCF × LCM = product of the numbers.`, hi: `${n1} तथा ${n2} का म.स. (HCF) और ल.स. (LCM) ज्ञात कीजिए तथा सत्यापित कीजिए कि HCF × LCM = दोनों संख्याओं का गुणनफल।`,
      steps: [S(`HCF(${n1}, ${n2}) = ${G}`, `HCF(${n1}, ${n2}) = ${G}`), S(`LCM = (${n1} × ${n2})/${G} = ${L}`, `LCM = (${n1} × ${n2})/${G} = ${L}`), S(`HCF × LCM = ${G * L} = ${n1} × ${n2}`, `HCF × LCM = ${G * L} = ${n1} × ${n2}`)],
      value: L, unit: '', ansText: A(`HCF = ${G}, LCM = ${L}`, `म.स. = ${G}, ल.स. = ${L}`), wrongText: [A(`HCF = ${L}, LCM = ${G}`, `म.स. = ${L}, ल.स. = ${G}`), A(`HCF = ${G}, LCM = ${n1 * n2}`, `म.स. = ${G}, ल.स. = ${n1 * n2}`), A(`HCF = 1, LCM = ${n1 * n2}`, `म.स. = 1, ल.स. = ${n1 * n2}`)] };
  }),
  x('quadratic', 'ch4', 'apply', 'medium', (r) => {
    const p = r.int(-6, 6) || 2, q = r.int(1, 7), b = -(p + q), c = p * q;
    const sgn = (v) => (v < 0 ? `− ${-v}` : `+ ${v}`);
    const disc = b * b - 4 * c;
    const lo = Math.min(p, q), hi = Math.max(p, q);
    return { en: `Solve x² ${sgn(b)}x ${sgn(c)} = 0 and write its roots in ascending order.`, hi: `x² ${sgn(b)}x ${sgn(c)} = 0 को हल कीजिए तथा मूलों को आरोही क्रम में लिखिए।`,
      steps: [S(`Discriminant D = b² − 4ac = ${b}² − 4(${c}) = ${disc}`, `विविक्तकर D = b² − 4ac = ${b}² − 4(${c}) = ${disc}`), S(`x = (−b ± √D)/2a = (${-b} ± ${Math.sqrt(disc)})/2`, `x = (−b ± √D)/2a = (${-b} ± ${Math.sqrt(disc)})/2`), S(`Roots: ${lo}, ${hi}`, `मूल: ${lo}, ${hi}`)],
      value: lo, unit: '', ansText: A(`${lo}, ${hi}`, `${lo}, ${hi}`), wrongText: [A(`${-lo}, ${-hi}`, `${-lo}, ${-hi}`), A(`${lo + 1}, ${hi - 1}`, `${lo + 1}, ${hi - 1}`), A(`${lo}, ${-hi}`, `${lo}, ${-hi}`)] };
  }),
  x('ap-sum', 'ch5', 'apply', 'easy', (r) => {
    const a = r.int(2, 9), d = r.int(2, 6), n = r.int(10, 25);
    const s = n * (2 * a + (n - 1) * d) / 2;
    return { en: `Find the sum of the first ${n} terms of the AP ${a}, ${a + d}, ${a + 2 * d}, ...`, hi: `समांतर श्रेढ़ी ${a}, ${a + d}, ${a + 2 * d}, ... के प्रथम ${n} पदों का योग ज्ञात कीजिए।`,
      steps: [S(`a = ${a}, d = ${d}, n = ${n}`, `a = ${a}, d = ${d}, n = ${n}`), S('S_n = (n/2)[2a + (n − 1)d]', 'S_n = (n/2)[2a + (n − 1)d]'), S(`S_${n} = ${s}`, `S_${n} = ${s}`)],
      value: s, unit: '', wrong: [n * (a + (n - 1) * d), n * (2 * a + n * d) / 2, s + n] };
  }),
  x('distance', 'ch7', 'apply', 'easy', (r) => {
    const t = r.pick([[3, 4], [5, 12], [6, 8], [8, 15]]), x1 = r.int(-3, 3), y1 = r.int(-3, 3);
    const d = Math.hypot(t[0], t[1]);
    return { en: `Find the distance between the points A(${x1}, ${y1}) and B(${x1 + t[0]}, ${y1 + t[1]}).`, hi: `बिंदुओं A(${x1}, ${y1}) तथा B(${x1 + t[0]}, ${y1 + t[1]}) के बीच की दूरी ज्ञात कीजिए।`,
      steps: [S('Distance formula d = √[(x₂ − x₁)² + (y₂ − y₁)²]', 'दूरी सूत्र d = √[(x₂ − x₁)² + (y₂ − y₁)²]'), S(`d = √(${t[0]}² + ${t[1]}²) = √${t[0] ** 2 + t[1] ** 2}`, `d = √(${t[0]}² + ${t[1]}²) = √${t[0] ** 2 + t[1] ** 2}`), S(`d = ${d} units`, `d = ${d} मात्रक`)],
      value: d, unit: 'units', wrong: [t[0] + t[1], t[0] ** 2 + t[1] ** 2, d + 1] };
  }),
  x('heights', 'ch9', 'apply', 'medium', (r) => {
    const dist = r.pick([10, 20, 30, 50]);
    const h = dist * Math.sqrt(3);
    return { en: `The angle of elevation of the top of a tower from a point ${dist} m from its foot is 60°. Find the height of the tower. (√3 = 1.732)`, hi: `मीनार के आधार से ${dist} m दूर स्थित बिंदु से मीनार के शीर्ष का उन्नयन कोण 60° है। मीनार की ऊँचाई ज्ञात कीजिए। (√3 = 1.732)`,
      steps: [S('tan 60° = h/d', 'tan 60° = h/d'), S(`h = ${dist} × √3`, `h = ${dist} × √3`), S(`h = ${fmt(h, 4)} m`, `h = ${fmt(h, 4)} m`)],
      value: h, unit: 'm', sig: 4, wrong: [dist / Math.sqrt(3), dist, dist * 2] };
  }),
  x('cylinder', 'ch12', 'apply', 'easy', (r) => {
    const rr = r.pick([7, 14, 21]), hh = r.int(5, 20);
    const v = 22 / 7 * rr * rr * hh;
    return { en: `Find the volume of a cylinder of radius ${rr} cm and height ${hh} cm. (Use π = 22/7)`, hi: `${rr} cm त्रिज्या तथा ${hh} cm ऊँचाई वाले बेलन का आयतन ज्ञात कीजिए। (π = 22/7 लीजिए)`,
      steps: [S('V = πr²h', 'V = πr²h'), S(`V = (22/7) × ${rr}² × ${hh}`, `V = (22/7) × ${rr}² × ${hh}`), S(`V = ${fmt(v, 6)} cm³`, `V = ${fmt(v, 6)} cm³`)],
      value: v, unit: 'cm³', sig: 6, wrong: [2 * 22 / 7 * rr * hh, 22 / 7 * rr * hh, v / 3] };
  }),
  x('mean', 'ch13', 'apply', 'easy', (r) => {
    const xs = [10, 20, 30, 40, 50], fs = xs.map(() => r.int(2, 9)), sf = fs.reduce((a, b) => a + b, 0), sfx = fs.reduce((a, f, i) => a + f * xs[i], 0);
    const m = sfx / sf;
    return { en: `Find the mean of the following frequency distribution. x: ${xs.join(', ')}; f: ${fs.join(', ')}.`, hi: `निम्न बारंबारता बंटन का माध्य ज्ञात कीजिए। x: ${xs.join(', ')}; f: ${fs.join(', ')}।`,
      steps: [S(`Σf = ${sf}`, `Σf = ${sf}`), S(`Σfx = ${sfx}`, `Σfx = ${sfx}`), S(`Mean = Σfx/Σf = ${fmt(m)}`, `माध्य = Σfx/Σf = ${fmt(m)}`)],
      value: m, unit: '', wrong: [sfx / xs.length, sf, xs.reduce((a, b) => a + b, 0) / xs.length] };
  }),
  x('probability', 'ch14', 'apply', 'easy', (r) => {
    const red = r.int(3, 8), blue = r.int(2, 7), green = r.int(2, 6), tot = red + blue + green;
    return { en: `A bag contains ${red} red, ${blue} blue and ${green} green balls. One ball is drawn at random. Find the probability that it is not blue.`, hi: `एक थैले में ${red} लाल, ${blue} नीली तथा ${green} हरी गेंदें हैं। एक गेंद यादृच्छया निकाली जाती है। उसके नीली न होने की प्रायिकता ज्ञात कीजिए।`,
      steps: [S(`Total outcomes = ${tot}`, `कुल परिणाम = ${tot}`), S(`Not blue = ${red} + ${green} = ${red + green}`, `नीली नहीं = ${red} + ${green} = ${red + green}`), S(`P = ${fracStr(red + green, tot)}`, `P = ${fracStr(red + green, tot)}`)],
      value: (red + green) / tot, unit: '', ansText: A(fracStr(red + green, tot), fracStr(red + green, tot)), wrongText: [A(fracStr(blue, tot), fracStr(blue, tot)), A(fracStr(red, tot), fracStr(red, tot)), A(fracStr(red + green, blue + green) , fracStr(red + green, blue + green))] };
  }),
];

export const MATHS_XI = [
  xi('perm', 'ch6', 'apply', 'easy', (r) => {
    const n = r.int(5, 9), k = r.int(2, 4);
    return { en: `Find the value of ⁿP_r + ⁿC_r for n = ${n}, r = ${k}.`, hi: `n = ${n}, r = ${k} के लिए ⁿP_r + ⁿC_r का मान ज्ञात कीजिए।`,
      steps: [S(`ⁿP_r = n!/(n − r)! = ${nPr(n, k)}`, `ⁿP_r = n!/(n − r)! = ${nPr(n, k)}`), S(`ⁿC_r = n!/[r!(n − r)!] = ${nCr(n, k)}`, `ⁿC_r = n!/[r!(n − r)!] = ${nCr(n, k)}`), S(`Sum = ${nPr(n, k) + nCr(n, k)}`, `योग = ${nPr(n, k) + nCr(n, k)}`)],
      value: nPr(n, k) + nCr(n, k), unit: '', wrong: [nPr(n, k), nCr(n, k), nPr(n, k) - nCr(n, k)] };
  }),
  xi('committee', 'ch6', 'apply', 'medium', (r) => {
    const m = r.int(4, 7), w = r.int(3, 5), a = r.int(2, 3), b = r.int(1, 2);
    const v = nCr(m, a) * nCr(w, b);
    return { en: `In how many ways can a committee of ${a + b} be formed from ${m} men and ${w} women so that it has exactly ${a} men and ${b} women?`, hi: `${m} पुरुषों और ${w} महिलाओं में से ${a + b} सदस्यों की एक समिति कितने प्रकार से बनाई जा सकती है जिसमें ठीक ${a} पुरुष तथा ${b} महिलाएँ हों?`,
      steps: [S(`Choose men: ${m}C${a} = ${nCr(m, a)}`, `पुरुष चुनना: ${m}C${a} = ${nCr(m, a)}`), S(`Choose women: ${w}C${b} = ${nCr(w, b)}`, `महिलाएँ चुनना: ${w}C${b} = ${nCr(w, b)}`), S(`Total = ${nCr(m, a)} × ${nCr(w, b)} = ${v}`, `कुल = ${nCr(m, a)} × ${nCr(w, b)} = ${v}`)],
      value: v, unit: '', wrong: [nCr(m, a) + nCr(w, b), nCr(m + w, a + b), nPr(m, a) * nPr(w, b)] };
  }),
  xi('gp', 'ch8', 'apply', 'medium', (r) => {
    const a = r.int(1, 5), q = r.pick([2, 3]), n = r.int(5, 8);
    const s = a * (q ** n - 1) / (q - 1);
    return { en: `Find the sum of the first ${n} terms of the GP ${a}, ${a * q}, ${a * q * q}, ...`, hi: `गुणोत्तर श्रेणी ${a}, ${a * q}, ${a * q * q}, ... के प्रथम ${n} पदों का योग ज्ञात कीजिए।`,
      steps: [S(`a = ${a}, r = ${q}`, `a = ${a}, r = ${q}`), S('S_n = a(rⁿ − 1)/(r − 1)', 'S_n = a(rⁿ − 1)/(r − 1)'), S(`S_${n} = ${s}`, `S_${n} = ${s}`)],
      value: s, unit: '', wrong: [a * (q ** n) / (q - 1), a * (q ** (n - 1) - 1) / (q - 1), s + a] };
  }),
  xi('line-distance', 'ch9', 'apply', 'medium', (r) => {
    const t = r.pick([[3, 4], [5, 12]]), c = r.int(1, 10), x1 = r.int(1, 5), y1 = r.int(1, 5);
    const num = Math.abs(t[0] * x1 + t[1] * y1 + c), den = Math.hypot(t[0], t[1]), d = num / den;
    return { en: `Find the perpendicular distance of the point (${x1}, ${y1}) from the line ${t[0]}x + ${t[1]}y + ${c} = 0.`, hi: `बिंदु (${x1}, ${y1}) की रेखा ${t[0]}x + ${t[1]}y + ${c} = 0 से लंबवत दूरी ज्ञात कीजिए।`,
      steps: [S('d = |Ax₁ + By₁ + C| / √(A² + B²)', 'd = |Ax₁ + By₁ + C| / √(A² + B²)'), S(`d = |${t[0]}×${x1} + ${t[1]}×${y1} + ${c}| / ${den}`, `d = |${t[0]}×${x1} + ${t[1]}×${y1} + ${c}| / ${den}`), S(`d = ${fmt(d)} units`, `d = ${fmt(d)} मात्रक`)],
      value: d, unit: 'units', wrong: [num, num / (t[0] + t[1]), num / (den * den)] };
  }),
  xi('limit', 'ch12', 'apply', 'easy', (r) => {
    const a = r.int(2, 9), n = r.pick([2, 3]);
    const v = n * a ** (n - 1);
    return { en: `Evaluate lim (x → ${a}) (x${n === 2 ? '²' : '³'} − ${a ** n}) / (x − ${a}).`, hi: `मान ज्ञात कीजिए: lim (x → ${a}) (x${n === 2 ? '²' : '³'} − ${a ** n}) / (x − ${a})।`,
      steps: [S(`Use lim (xⁿ − aⁿ)/(x − a) = n·aⁿ⁻¹ with n = ${n}`, `सूत्र lim (xⁿ − aⁿ)/(x − a) = n·aⁿ⁻¹, n = ${n}`), S(`= ${n} × ${a}^${n - 1}`, `= ${n} × ${a}^${n - 1}`), S(`= ${v}`, `= ${v}`)],
      value: v, unit: '', wrong: [a ** n, n * a, a ** (n - 1)] };
  }),
  xi('sd', 'ch13', 'apply', 'medium', (r) => {
    const base = r.int(2, 6), xs = [base, base + 2, base + 4, base + 6, base + 8];
    const mean = base + 4, v = xs.reduce((s, z) => s + (z - mean) ** 2, 0) / 5, sd = Math.sqrt(v);
    return { en: `Find the variance and standard deviation of the data ${xs.join(', ')}.`, hi: `आँकड़ों ${xs.join(', ')} का प्रसरण तथा मानक विचलन ज्ञात कीजिए।`,
      steps: [S(`Mean = ${mean}`, `माध्य = ${mean}`), S(`Σ(x − mean)² = ${v * 5}`, `Σ(x − माध्य)² = ${v * 5}`), S(`Variance = ${v}; SD = √${v} = ${fmt(sd)}`, `प्रसरण = ${v}; मानक विचलन = √${v} = ${fmt(sd)}`)],
      value: v, unit: '', ansText: A(`Variance = ${v}, SD = ${fmt(sd)}`, `प्रसरण = ${v}, मानक विचलन = ${fmt(sd)}`), wrongText: [A(`Variance = ${sd * sd + 2}, SD = ${fmt(Math.sqrt(sd * sd + 2))}`, `प्रसरण = ${sd * sd + 2}`), A(`Variance = ${fmt(sd)}, SD = ${v}`, `प्रसरण = ${fmt(sd)}, मानक विचलन = ${v}`), A(`Variance = ${v * 5}, SD = ${fmt(Math.sqrt(v * 5))}`, `प्रसरण = ${v * 5}`)] };
  }),
];

export const MATHS_XII = [
  xii('det3', 'ch4', 'apply', 'medium', (r) => {
    const m = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => r.int(-3, 5)));
    const d = det3(m);
    return { en: `Evaluate the determinant of the matrix A = ${mat(m)} (rows separated by semicolons).`, hi: `आव्यूह A = ${mat(m)} (पंक्तियाँ अर्धविराम से पृथक) का सारणिक ज्ञात कीजिए।`,
      steps: [S('Expand along the first row: |A| = a₁₁(a₂₂a₃₃ − a₂₃a₃₂) − a₁₂(a₂₁a₃₃ − a₂₃a₃₁) + a₁₃(a₂₁a₃₂ − a₂₂a₃₁)', 'प्रथम पंक्ति से प्रसार: |A| = a₁₁(a₂₂a₃₃ − a₂₃a₃₂) − a₁₂(a₂₁a₃₃ − a₂₃a₃₁) + a₁₃(a₂₁a₃₂ − a₂₂a₃₁)'), S('Substitute the entries and simplify', 'मान रखकर सरल कीजिए'), S(`|A| = ${d}`, `|A| = ${d}`)],
      value: d, unit: '', wrong: [-d, d + 1, m[0][0] * m[1][1] * m[2][2]] };
  }),
  xii('matmul', 'ch3', 'apply', 'easy', (r) => {
    const A1 = [[r.int(1, 4), r.int(0, 3)], [r.int(0, 3), r.int(1, 4)]], B1 = [[r.int(1, 3), r.int(0, 3)], [r.int(0, 3), r.int(1, 3)]];
    const P = [[A1[0][0] * B1[0][0] + A1[0][1] * B1[1][0], A1[0][0] * B1[0][1] + A1[0][1] * B1[1][1]], [A1[1][0] * B1[0][0] + A1[1][1] * B1[1][0], A1[1][0] * B1[0][1] + A1[1][1] * B1[1][1]]];
    return { en: `If A = ${mat(A1)} and B = ${mat(B1)}, find AB. Then write the element in the second row, first column of AB.`, hi: `यदि A = ${mat(A1)} तथा B = ${mat(B1)} हो, तो AB ज्ञात कीजिए। फिर AB के द्वितीय पंक्ति, प्रथम स्तंभ का अवयव लिखिए।`,
      steps: [S('(AB)ᵢⱼ = Σ aᵢₖ bₖⱼ', '(AB)ᵢⱼ = Σ aᵢₖ bₖⱼ'), S(`AB = ${mat(P)}`, `AB = ${mat(P)}`), S(`Required element = ${P[1][0]}`, `अभीष्ट अवयव = ${P[1][0]}`)],
      value: P[1][0], unit: '', ansText: A(`AB = ${mat(P)}; element = ${P[1][0]}`, `AB = ${mat(P)}; अवयव = ${P[1][0]}`), wrongText: [A(`element = ${P[0][1]}`, `अवयव = ${P[0][1]}`), A(`element = ${A1[1][0] * B1[0][0]}`, `अवयव = ${A1[1][0] * B1[0][0]}`), A(`element = ${P[1][0] + 1}`, `अवयव = ${P[1][0] + 1}`)] };
  }),
  xii('derivative', 'ch5', 'apply', 'easy', (r) => {
    const a = r.int(2, 6), b = r.int(1, 5), c = r.int(1, 9), x0 = r.int(1, 4);
    const v = 3 * a * x0 * x0 + 2 * b * x0;
    return { en: `If y = ${a}x³ + ${b}x² + ${c}, find dy/dx at x = ${x0}.`, hi: `यदि y = ${a}x³ + ${b}x² + ${c} हो, तो x = ${x0} पर dy/dx ज्ञात कीजिए।`,
      steps: [S(`dy/dx = ${3 * a}x² + ${2 * b}x`, `dy/dx = ${3 * a}x² + ${2 * b}x`), S(`At x = ${x0}: ${3 * a}×${x0 * x0} + ${2 * b}×${x0}`, `x = ${x0} पर: ${3 * a}×${x0 * x0} + ${2 * b}×${x0}`), S(`dy/dx = ${v}`, `dy/dx = ${v}`)],
      value: v, unit: '', wrong: [a * x0 ** 3 + b * x0 * x0 + c, 3 * a * x0 + 2 * b, v + c] };
  }),
  xii('maxima', 'ch6', 'apply', 'medium', (r) => {
    const h = r.int(2, 6), k = r.int(1, 9);
    return { en: `Find the maximum value of f(x) = −x² + ${2 * h}x + ${k - h * h}.`, hi: `f(x) = −x² + ${2 * h}x + ${k - h * h} का उच्चतम मान ज्ञात कीजिए।`,
      steps: [S(`f′(x) = −2x + ${2 * h} = 0 ⇒ x = ${h}`, `f′(x) = −2x + ${2 * h} = 0 ⇒ x = ${h}`), S('f″(x) = −2 < 0, so x is a point of local maximum', 'f″(x) = −2 < 0, अतः x उच्चिष्ठ बिंदु है'), S(`f(${h}) = ${k}`, `f(${h}) = ${k}`)],
      value: k, unit: '', wrong: [h, k - h * h, k + h] };
  }),
  xii('definite', 'ch7', 'apply', 'medium', (r) => {
    const a = r.int(1, 3), b = a + r.int(1, 3), c = r.pick([1, 2, 3]) * 3;
    const v = c * (b ** 3 - a ** 3) / 3;
    return { en: `Evaluate ∫ from ${a} to ${b} of ${c}x² dx.`, hi: `मान ज्ञात कीजिए: ${a} से ${b} तक ${c}x² dx का समाकल।`,
      steps: [S(`∫${c}x² dx = ${c / 3}x³`, `∫${c}x² dx = ${c / 3}x³`), S(`= ${c / 3}(${b}³ − ${a}³)`, `= ${c / 3}(${b}³ − ${a}³)`), S(`= ${v}`, `= ${v}`)],
      value: v, unit: '', wrong: [c * (b * b - a * a), c / 3 * b ** 3, v + c] };
  }),
  xii('area', 'ch8', 'apply', 'medium', (r) => {
    const a = r.pick([3, 6, 9]), k = r.pick([1, 2]);
    const v = k * a ** 3 / 3;
    return { en: `Find the area bounded by the curve y = ${k === 1 ? '' : k}x², the x-axis and the ordinates x = 0 and x = ${a}.`, hi: `वक्र y = ${k === 1 ? '' : k}x², x-अक्ष तथा कोटियों x = 0 और x = ${a} से घिरे क्षेत्र का क्षेत्रफल ज्ञात कीजिए।`,
      steps: [S(`Area = ∫₀^${a} ${k === 1 ? '' : k}x² dx`, `क्षेत्रफल = ∫₀^${a} ${k === 1 ? '' : k}x² dx`), S(`= [${k}x³/3] from 0 to ${a}`, `= [${k}x³/3] (0 से ${a} तक)`), S(`= ${v} sq. units`, `= ${v} वर्ग इकाई`)],
      value: v, unit: 'sq. units', wrong: [k * a * a, k * a ** 3, v + a] };
  }),
  xii('dotproduct', 'ch10', 'apply', 'easy', (r) => {
    const a = [r.int(1, 4), r.int(-3, 3), r.int(1, 4)], b = [r.int(1, 4), r.int(-3, 3), r.int(1, 4)];
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vs = (v) => `${v[0]}î ${v[1] < 0 ? '−' : '+'} ${Math.abs(v[1])}ĵ + ${v[2]}k̂`;
    return { en: `Find the scalar (dot) product of the vectors a = ${vs(a)} and b = ${vs(b)}.`, hi: `सदिशों a = ${vs(a)} तथा b = ${vs(b)} का अदिश (बिंदु) गुणनफल ज्ञात कीजिए।`,
      steps: [S('a·b = a₁b₁ + a₂b₂ + a₃b₃', 'a·b = a₁b₁ + a₂b₂ + a₃b₃'), S(`= ${a[0]}×${b[0]} + (${a[1]})(${b[1]}) + ${a[2]}×${b[2]}`, `= ${a[0]}×${b[0]} + (${a[1]})(${b[1]}) + ${a[2]}×${b[2]}`), S(`= ${dot}`, `= ${dot}`)],
      value: dot, unit: '', wrong: [-dot, a[0] * b[0] + a[1] * b[1], dot + 2] };
  }),
  xii('dist3d', 'ch11', 'apply', 'easy', (r) => {
    const t = r.pick([[2, 3, 6, 7], [1, 2, 2, 3], [4, 4, 7, 9]]);
    const d = Math.sqrt(t[0] ** 2 + t[1] ** 2 + t[2] ** 2);
    return { en: `Find the distance between the points P(0, 0, 0) and Q(${t[0]}, ${t[1]}, ${t[2]}).`, hi: `बिंदुओं P(0, 0, 0) और Q(${t[0]}, ${t[1]}, ${t[2]}) के बीच की दूरी ज्ञात कीजिए।`,
      steps: [S('d = √(x² + y² + z²)', 'd = √(x² + y² + z²)'), S(`d = √(${t[0] ** 2} + ${t[1] ** 2} + ${t[2] ** 2}) = √${t[0] ** 2 + t[1] ** 2 + t[2] ** 2}`, `d = √(${t[0] ** 2} + ${t[1] ** 2} + ${t[2] ** 2}) = √${t[0] ** 2 + t[1] ** 2 + t[2] ** 2}`), S(`d = ${fmt(d)} units`, `d = ${fmt(d)} मात्रक`)],
      value: d, unit: 'units', wrong: [t[0] + t[1] + t[2], t[0] ** 2 + t[1] ** 2 + t[2] ** 2, d + 1] };
  }),
  xii('lpp', 'ch12', 'apply', 'medium', (r) => {
    const pts = [[0, 0], [r.int(2, 4), 0], [r.int(2, 4), r.int(2, 4)], [0, r.int(2, 5)]];
    const a = r.int(2, 6), b = r.int(2, 6);
    const zs = pts.map((p) => a * p[0] + b * p[1]), mx = Math.max(...zs), idx = zs.indexOf(mx);
    return { en: `The feasible region of an LPP has corner points ${pts.map((p) => `(${p[0]}, ${p[1]})`).join(', ')}. Find the maximum value of Z = ${a}x + ${b}y and the point at which it occurs.`, hi: `एक रैखिक प्रोग्रामन समस्या के सुसंगत क्षेत्र के कोणीय बिंदु ${pts.map((p) => `(${p[0]}, ${p[1]})`).join(', ')} हैं। Z = ${a}x + ${b}y का अधिकतम मान तथा वह बिंदु ज्ञात कीजिए जहाँ यह प्राप्त होता है।`,
      steps: [S(`Z at corner points: ${zs.join(', ')}`, `कोणीय बिंदुओं पर Z: ${zs.join(', ')}`), S(`Maximum Z = ${mx}`, `अधिकतम Z = ${mx}`), S(`At (${pts[idx][0]}, ${pts[idx][1]})`, `बिंदु (${pts[idx][0]}, ${pts[idx][1]}) पर`)],
      value: mx, unit: '', ansText: A(`Z_max = ${mx} at (${pts[idx][0]}, ${pts[idx][1]})`, `Z_अधिकतम = ${mx}, बिंदु (${pts[idx][0]}, ${pts[idx][1]}) पर`), wrongText: [A(`Z_max = ${Math.min(...zs)} at (${pts[zs.indexOf(Math.min(...zs))][0]}, ${pts[zs.indexOf(Math.min(...zs))][1]})`, `Z = ${Math.min(...zs)}`), A(`Z_max = ${mx + a} at (${pts[idx][0]}, ${pts[idx][1]})`, `Z = ${mx + a}`), A(`Z_max = ${mx} at (${pts[(idx + 1) % 4][0]}, ${pts[(idx + 1) % 4][1]})`, `Z = ${mx}, भिन्न बिंदु`)].filter((w) => w.en !== `Z_max = ${mx} at (${pts[idx][0]}, ${pts[idx][1]})`) };
  }),
  xii('bayes', 'ch13', 'apply', 'hard', (r) => {
    const p1 = r.pick([0.4, 0.5, 0.6]), q1 = r.pick([0.02, 0.03, 0.05]), q2 = r.pick([0.04, 0.06, 0.1]);
    const pr = p1 * q1 / (p1 * q1 + (1 - p1) * q2);
    return { en: `Machine A produces ${p1 * 100}% of the items and machine B the rest. ${q1 * 100}% of A's items and ${q2 * 100}% of B's items are defective. An item picked at random is defective; find the probability that it was produced by machine A.`, hi: `मशीन A कुल वस्तुओं का ${p1 * 100}% तथा मशीन B शेष उत्पादन करती है। A की ${q1 * 100}% तथा B की ${q2 * 100}% वस्तुएँ दोषपूर्ण हैं। यादृच्छया चुनी गई वस्तु दोषपूर्ण है; उसके मशीन A द्वारा बनाई गई होने की प्रायिकता ज्ञात कीजिए।`,
      steps: [S('Bayes\' theorem: P(A|D) = P(A)P(D|A) / [P(A)P(D|A) + P(B)P(D|B)]', 'बेज़ प्रमेय: P(A|D) = P(A)P(D|A) / [P(A)P(D|A) + P(B)P(D|B)]'), S(`= (${p1}×${q1}) / (${p1}×${q1} + ${fmt(1 - p1)}×${q2})`, `= (${p1}×${q1}) / (${p1}×${q1} + ${fmt(1 - p1)}×${q2})`), S(`= ${fmt(pr)}`, `= ${fmt(pr)}`)],
      value: pr, unit: '', wrong: [p1, q1 / (q1 + q2), p1 * q1] };
  }),
];
