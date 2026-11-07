// Economics numerical generators (Macro, Micro, Statistics). All outputs computed.
import { fmt, rs } from '../util.js';
import { E } from './common.js';

const p = (id, cls, ch, bloom, diff, fn) => E(`economics.${cls}.${ch}.${id}`, ch, bloom, diff, fn, { subject: 'economics', cls });
const S = (en, hi = en) => [en, hi];
const A = (en, hi) => ({ en, hi });
const cr = (n) => `₹${n} crore`;

export const ECONOMICS_XII = [
  p('gdp-exp', 'XII', 'ch2', 'apply', 'medium', (r) => {
    const C = r.int(40, 80) * 100, I = r.int(8, 20) * 100, G = r.int(10, 25) * 100, X = r.int(5, 12) * 100, M = r.int(4, 10) * 100;
    const v = C + I + G + X - M;
    return { en: `From the following data (₹ crore): private final consumption expenditure ${C}; government final consumption expenditure ${G}; gross domestic capital formation ${I}; exports ${X}; imports ${M}. Calculate GDP at market price by the expenditure method.`,
      hi: `निम्नलिखित आँकड़ों (₹ करोड़) से व्यय विधि द्वारा बाज़ार कीमत पर सकल घरेलू उत्पाद (GDP) परिकलित कीजिए: निजी अंतिम उपभोग व्यय ${C}; सरकारी अंतिम उपभोग व्यय ${G}; सकल घरेलू पूँजी निर्माण ${I}; निर्यात ${X}; आयात ${M}।`,
      steps: [S('GDP at MP = C + G + I + (X − M)', 'बाज़ार कीमत पर GDP = C + G + I + (X − M)'), S(`Net exports = ${X} − ${M} = ${X - M}`, `निवल निर्यात = ${X} − ${M} = ${X - M}`), S(`GDP at MP = ${C} + ${G} + ${I} + ${X - M} = ${cr(v)}`, `बाज़ार कीमत पर GDP = ${C} + ${G} + ${I} + ${X - M} = ${cr(v)}`)],
      value: v, unit: '₹ crore', ansText: A(cr(v), `₹${v} करोड़`), wrongText: [A(cr(C + I + G + X + M), `₹${C + I + G + X + M} करोड़`), A(cr(C + I + G), `₹${C + I + G} करोड़`), A(cr(C + I + G - X + M), `₹${C + I + G - X + M} करोड़`)] };
  }),
  p('nnp-fc', 'XII', 'ch2', 'apply', 'medium', (r) => {
    const gdp = r.int(60, 120) * 100, dep = r.int(4, 9) * 100, nit = r.int(5, 10) * 100, nfia = r.pick([-300, -200, 200, 300, 400]);
    const v = gdp - dep - nit + nfia;
    return { en: `Given (₹ crore): GDP at market price ${gdp}; depreciation ${dep}; net indirect taxes ${nit}; net factor income from abroad ${nfia}. Calculate National Income (NNP at factor cost).`,
      hi: `दिया गया है (₹ करोड़): बाज़ार कीमत पर GDP ${gdp}; ह्रास ${dep}; निवल अप्रत्यक्ष कर ${nit}; विदेशों से निवल साधन आय ${nfia}। राष्ट्रीय आय (साधन लागत पर NNP) परिकलित कीजिए।`,
      steps: [S('NNP at FC = GDP at MP − Depreciation + NFIA − NIT', 'साधन लागत पर NNP = बाज़ार कीमत पर GDP − ह्रास + NFIA − NIT'), S(`= ${gdp} − ${dep} + (${nfia}) − ${nit}`, `= ${gdp} − ${dep} + (${nfia}) − ${nit}`), S(`National Income = ${cr(v)}`, `राष्ट्रीय आय = ₹${v} करोड़`)],
      value: v, unit: '₹ crore', ansText: A(cr(v), `₹${v} करोड़`), wrongText: [A(cr(gdp - dep - nit - nfia), `₹${gdp - dep - nit - nfia} करोड़`), A(cr(gdp - dep + nit + nfia), `₹${gdp - dep + nit + nfia} करोड़`), A(cr(gdp + nfia - nit), `₹${gdp + nfia - nit} करोड़`)] };
  }),
  p('money-mult', 'XII', 'ch3', 'apply', 'easy', (r) => {
    const lrr = r.pick([5, 10, 20, 25]), dep = r.pick([1000, 2000, 5000, 10000]);
    const k = 100 / lrr, tot = dep * k;
    return { en: `The Legal Reserve Ratio is ${lrr}% and an initial deposit of ₹${dep} is made in a bank. Calculate the money multiplier and the maximum total deposits that can be created in the banking system.`,
      hi: `वैधानिक आरक्षित अनुपात ${lrr}% है और किसी बैंक में ₹${dep} की प्रारंभिक जमा की गई है। मुद्रा गुणक तथा बैंकिंग प्रणाली में सृजित हो सकने वाली अधिकतम कुल जमा राशि परिकलित कीजिए।`,
      steps: [S(`Money multiplier = 1/LRR = 1/${lrr / 100} = ${fmt(k)}`, `मुद्रा गुणक = 1/LRR = 1/${lrr / 100} = ${fmt(k)}`), S(`Total deposits = ₹${dep} × ${fmt(k)} = ₹${fmt(tot, 8)}`, `कुल जमा = ₹${dep} × ${fmt(k)} = ₹${fmt(tot, 8)}`)],
      value: tot, unit: '₹', ansText: A(`Multiplier ${fmt(k)}; deposits ₹${fmt(tot, 8)}`, `गुणक ${fmt(k)}; जमा ₹${fmt(tot, 8)}`), wrongText: [A(`Multiplier ${fmt(lrr / 100)}; deposits ₹${fmt(dep * lrr / 100, 8)}`, `गुणक ${fmt(lrr / 100)}`), A(`Multiplier ${fmt(k)}; deposits ₹${fmt(tot - dep, 8)}`, `गुणक ${fmt(k)}; जमा ₹${fmt(tot - dep, 8)}`), A(`Multiplier ${fmt(k + 1)}; deposits ₹${fmt(dep * (k + 1), 8)}`, `गुणक ${fmt(k + 1)}`)] };
  }),
  p('multiplier', 'XII', 'ch4', 'apply', 'medium', (r) => {
    const mpc = r.pick([0.5, 0.6, 0.75, 0.8, 0.9]), dI = r.pick([100, 200, 500, 1000]);
    const K = 1 / (1 - mpc), dY = K * dI;
    return { en: `In an economy the marginal propensity to consume is ${mpc}. If investment increases by ₹${dI} crore, calculate the investment multiplier and the increase in national income.`,
      hi: `किसी अर्थव्यवस्था में सीमांत उपभोग प्रवृत्ति ${mpc} है। यदि निवेश में ₹${dI} करोड़ की वृद्धि होती है, तो निवेश गुणक तथा राष्ट्रीय आय में वृद्धि परिकलित कीजिए।`,
      steps: [S(`K = 1/(1 − MPC) = 1/(1 − ${mpc}) = ${fmt(K)}`, `K = 1/(1 − MPC) = 1/(1 − ${mpc}) = ${fmt(K)}`), S(`ΔY = K × ΔI = ${fmt(K)} × ${dI}`, `ΔY = K × ΔI = ${fmt(K)} × ${dI}`), S(`ΔY = ₹${fmt(dY)} crore`, `ΔY = ₹${fmt(dY)} करोड़`)],
      value: dY, unit: '₹ crore', ansText: A(`K = ${fmt(K)}; ΔY = ₹${fmt(dY)} crore`, `K = ${fmt(K)}; ΔY = ₹${fmt(dY)} करोड़`), wrongText: [A(`K = ${fmt(1 / mpc)}; ΔY = ₹${fmt(dI / mpc)} crore`, `K = ${fmt(1 / mpc)}`), A(`K = ${fmt(mpc / (1 - mpc))}; ΔY = ₹${fmt(dI * mpc / (1 - mpc))} crore`, `K = ${fmt(mpc / (1 - mpc))}`), A(`K = ${fmt(1 / (1 - mpc))}; ΔY = ₹${fmt(dI)} crore`, `K = ${fmt(K)}; ΔY = ₹${fmt(dI)} करोड़`)] };
  }),
  p('equilibrium-income', 'XII', 'ch4', 'apply', 'hard', (r) => {
    const a = r.pick([50, 100, 200]), c = r.pick([0.5, 0.6, 0.75, 0.8]), I = r.pick([100, 200, 300, 400]);
    const Y = (a + I) / (1 - c), Cv = a + c * Y;
    return { en: `In an economy, the consumption function is C = ${a} + ${c}Y and investment is ₹${I} crore. Calculate the equilibrium level of national income and consumption expenditure.`,
      hi: `किसी अर्थव्यवस्था में उपभोग फलन C = ${a} + ${c}Y तथा निवेश ₹${I} करोड़ है। राष्ट्रीय आय का संतुलन स्तर तथा उपभोग व्यय परिकलित कीजिए।`,
      steps: [S('At equilibrium Y = C + I', 'संतुलन पर Y = C + I'), S(`Y = ${a} + ${c}Y + ${I} ⇒ Y(1 − ${c}) = ${a + I}`, `Y = ${a} + ${c}Y + ${I} ⇒ Y(1 − ${c}) = ${a + I}`), S(`Y = ₹${fmt(Y)} crore`, `Y = ₹${fmt(Y)} करोड़`), S(`C = ${a} + ${c}×${fmt(Y)} = ₹${fmt(Cv)} crore`, `C = ${a} + ${c}×${fmt(Y)} = ₹${fmt(Cv)} करोड़`)],
      value: Y, unit: '₹ crore', ansText: A(`Y = ₹${fmt(Y)} crore; C = ₹${fmt(Cv)} crore`, `Y = ₹${fmt(Y)} करोड़; C = ₹${fmt(Cv)} करोड़`), wrongText: [A(`Y = ₹${fmt(a + I)} crore; C = ₹${fmt(a)} crore`, `Y = ₹${fmt(a + I)} करोड़`), A(`Y = ₹${fmt(Y * c)} crore; C = ₹${fmt(Cv * c)} crore`, `Y = ₹${fmt(Y * c)} करोड़`), A(`Y = ₹${fmt((a + I) / c)} crore; C = ₹${fmt(Cv)} crore`, `Y = ₹${fmt((a + I) / c)} करोड़`)] };
  }),
  p('deficits', 'XII', 'ch5', 'apply', 'medium', (r) => {
    const rr = r.int(15, 25) * 100, cap = r.int(3, 8) * 100, borrow = r.int(5, 12) * 100, rexp = r.int(20, 30) * 100, cexp = r.int(6, 12) * 100, intr = r.int(3, 6) * 100;
    // total receipts including borrowing = rr + cap(non-debt capital receipts) + borrow
    const totalExp = rexp + cexp, totalRecNoBorrow = rr + cap, fd = totalExp - totalRecNoBorrow, rd = rexp - rr, pd = fd - intr;
    return { en: `From the budget data (₹ crore): revenue receipts ${rr}; capital receipts other than borrowings ${cap}; borrowings ${borrow}; revenue expenditure ${rexp}; capital expenditure ${cexp}; interest payments ${intr}. Calculate (i) revenue deficit, (ii) fiscal deficit, (iii) primary deficit.`,
      hi: `बजट आँकड़ों (₹ करोड़) से परिकलित कीजिए: राजस्व प्राप्तियाँ ${rr}; उधार के अतिरिक्त पूँजीगत प्राप्तियाँ ${cap}; उधार ${borrow}; राजस्व व्यय ${rexp}; पूँजीगत व्यय ${cexp}; ब्याज भुगतान ${intr}। (i) राजस्व घाटा, (ii) राजकोषीय घाटा, (iii) प्राथमिक घाटा।`,
      steps: [S(`Revenue deficit = ${rexp} − ${rr} = ${rd}`, `राजस्व घाटा = ${rexp} − ${rr} = ${rd}`), S(`Fiscal deficit = Total expenditure − Receipts excluding borrowings = ${totalExp} − ${totalRecNoBorrow} = ${fd}`, `राजकोषीय घाटा = कुल व्यय − उधार रहित कुल प्राप्तियाँ = ${totalExp} − ${totalRecNoBorrow} = ${fd}`), S(`Primary deficit = Fiscal deficit − Interest = ${fd} − ${intr} = ${pd}`, `प्राथमिक घाटा = राजकोषीय घाटा − ब्याज = ${fd} − ${intr} = ${pd}`)],
      value: fd, unit: '₹ crore', ansText: A(`Revenue deficit ₹${rd} cr; Fiscal deficit ₹${fd} cr; Primary deficit ₹${pd} cr`, `राजस्व घाटा ₹${rd} करोड़; राजकोषीय घाटा ₹${fd} करोड़; प्राथमिक घाटा ₹${pd} करोड़`),
      wrongText: [A(`Revenue deficit ₹${fd} cr; Fiscal deficit ₹${rd} cr; Primary deficit ₹${pd} cr`, `राजस्व घाटा ₹${fd} करोड़; राजकोषीय घाटा ₹${rd} करोड़`), A(`Revenue deficit ₹${rd} cr; Fiscal deficit ₹${borrow} cr; Primary deficit ₹${borrow - intr} cr`, `राजस्व घाटा ₹${rd} करोड़`), A(`Revenue deficit ₹${rd} cr; Fiscal deficit ₹${fd + intr} cr; Primary deficit ₹${fd} cr`, `राजस्व घाटा ₹${rd} करोड़; राजकोषीय घाटा ₹${fd + intr} करोड़`)] };
  }),
  p('bop', 'XII', 'ch6', 'apply', 'easy', (r) => {
    const X = r.int(20, 40) * 10, M = r.int(25, 50) * 10, inv = r.int(-10, 15) * 10;
    const bot = X - M, ca = bot + inv;
    return { en: `In a year, exports of goods were ₹${X} crore, imports of goods ₹${M} crore and net invisibles (services, income, transfers) ₹${inv} crore. Calculate the balance of trade and the current account balance.`,
      hi: `किसी वर्ष वस्तुओं का निर्यात ₹${X} करोड़, वस्तुओं का आयात ₹${M} करोड़ तथा निवल अदृश्य मदें (सेवाएँ, आय, अंतरण) ₹${inv} करोड़ रहीं। व्यापार शेष तथा चालू खाता शेष परिकलित कीजिए।`,
      steps: [S(`Balance of trade = X − M = ${X} − ${M} = ${bot}`, `व्यापार शेष = X − M = ${X} − ${M} = ${bot}`), S(`Current account balance = BOT + net invisibles = ${bot} + (${inv}) = ${ca}`, `चालू खाता शेष = व्यापार शेष + निवल अदृश्य = ${bot} + (${inv}) = ${ca}`)],
      value: ca, unit: '₹ crore', ansText: A(`BOT ₹${bot} cr; Current account ₹${ca} cr`, `व्यापार शेष ₹${bot} करोड़; चालू खाता ₹${ca} करोड़`), wrongText: [A(`BOT ₹${-bot} cr; Current account ₹${-ca} cr`, `व्यापार शेष ₹${-bot} करोड़`), A(`BOT ₹${bot} cr; Current account ₹${bot - inv} cr`, `व्यापार शेष ₹${bot} करोड़; चालू खाता ₹${bot - inv} करोड़`), A(`BOT ₹${X + M} cr; Current account ₹${ca} cr`, `व्यापार शेष ₹${X + M} करोड़`)] };
  }),
];

export const ECONOMICS_XI = [
  p('elasticity', 'XI', 'ch2', 'apply', 'medium', (r) => {
    const P1 = r.pick([10, 20, 40]), P2 = P1 + r.pick([2, 4, 5]), Q1 = r.pick([100, 200, 400]), Q2 = Q1 - r.pick([10, 20, 40]);
    const ed = ((Q2 - Q1) / Q1) / ((P2 - P1) / P1);
    const mag = Math.abs(ed);
    const t = mag > 1 ? ['elastic', 'लोचदार'] : mag < 1 ? ['inelastic', 'बेलोचदार'] : ['unitary elastic', 'इकाई लोचदार'];
    return { en: `When the price of a good rises from ₹${P1} to ₹${P2}, the quantity demanded falls from ${Q1} to ${Q2} units. Calculate the price elasticity of demand by the percentage method and state its nature.`,
      hi: `जब किसी वस्तु की कीमत ₹${P1} से बढ़कर ₹${P2} हो जाती है, तो माँगी गई मात्रा ${Q1} इकाई से घटकर ${Q2} इकाई रह जाती है। प्रतिशत विधि से माँग की कीमत लोच परिकलित कीजिए तथा उसकी प्रकृति बताइए।`,
      steps: [S(`% change in quantity = (${Q2} − ${Q1})/${Q1} × 100 = ${fmt((Q2 - Q1) / Q1 * 100)}%`, `मात्रा में प्रतिशत परिवर्तन = (${Q2} − ${Q1})/${Q1} × 100 = ${fmt((Q2 - Q1) / Q1 * 100)}%`), S(`% change in price = (${P2} − ${P1})/${P1} × 100 = ${fmt((P2 - P1) / P1 * 100)}%`, `कीमत में प्रतिशत परिवर्तन = (${P2} − ${P1})/${P1} × 100 = ${fmt((P2 - P1) / P1 * 100)}%`), S(`Ed = ${fmt(ed)}; |Ed| = ${fmt(mag)}`, `Ed = ${fmt(ed)}; |Ed| = ${fmt(mag)}`), S(`Demand is ${t[0]}`, `माँग ${t[1]} है`)],
      value: mag, unit: '', ansText: A(`Ed = (−) ${fmt(mag)}; ${t[0]}`, `Ed = (−) ${fmt(mag)}; ${t[1]}`), wrongText: [A(`Ed = ${fmt(1 / mag)}; ${mag > 1 ? 'inelastic' : 'elastic'}`, `Ed = ${fmt(1 / mag)}`), A(`Ed = ${fmt(mag * 2)}; elastic`, `Ed = ${fmt(mag * 2)}; लोचदार`), A(`Ed = ${fmt(mag / 2)}; inelastic`, `Ed = ${fmt(mag / 2)}; बेलोचदार`)] };
  }),
  p('cost-mc', 'XI', 'ch3', 'apply', 'medium', (r) => {
    const tfc = r.pick([20, 30, 50]);
    const tvc = [0, r.int(10, 20), 0, 0]; tvc[2] = tvc[1] + r.int(8, 15); tvc[3] = tvc[2] + r.int(10, 18);
    const tc = tvc.map((v) => v + tfc), mc3 = tc[3] - tc[2], avc3 = tvc[3] / 3, atc3 = tc[3] / 3;
    return { en: `A firm has total fixed cost ₹${tfc}. Total variable cost for 0, 1, 2 and 3 units of output is ₹${tvc.join(', ')} respectively. Calculate the marginal cost of the 3rd unit, and AVC and ATC at 3 units.`,
      hi: `एक फर्म की कुल स्थिर लागत ₹${tfc} है। 0, 1, 2 तथा 3 इकाई उत्पादन पर कुल परिवर्ती लागत क्रमशः ₹${tvc.join(', ')} है। तीसरी इकाई की सीमांत लागत तथा 3 इकाई पर AVC और ATC परिकलित कीजिए।`,
      steps: [S(`TC(2) = ${tfc} + ${tvc[2]} = ${tc[2]}; TC(3) = ${tfc} + ${tvc[3]} = ${tc[3]}`, `TC(2) = ${tfc} + ${tvc[2]} = ${tc[2]}; TC(3) = ${tfc} + ${tvc[3]} = ${tc[3]}`), S(`MC₃ = TC₃ − TC₂ = ${mc3}`, `MC₃ = TC₃ − TC₂ = ${mc3}`), S(`AVC = ${tvc[3]}/3 = ${fmt(avc3)}`, `AVC = ${tvc[3]}/3 = ${fmt(avc3)}`), S(`ATC = ${tc[3]}/3 = ${fmt(atc3)}`, `ATC = ${tc[3]}/3 = ${fmt(atc3)}`)],
      value: mc3, unit: '₹', ansText: A(`MC = ₹${mc3}; AVC = ₹${fmt(avc3)}; ATC = ₹${fmt(atc3)}`, `MC = ₹${mc3}; AVC = ₹${fmt(avc3)}; ATC = ₹${fmt(atc3)}`), wrongText: [A(`MC = ₹${fmt(avc3)}; AVC = ₹${mc3}; ATC = ₹${fmt(atc3)}`, `MC = ₹${fmt(avc3)}`), A(`MC = ₹${tc[3]}; AVC = ₹${fmt(avc3)}; ATC = ₹${fmt(atc3)}`, `MC = ₹${tc[3]}`), A(`MC = ₹${mc3}; AVC = ₹${fmt(atc3)}; ATC = ₹${fmt(avc3)}`, `MC = ₹${mc3}; AVC = ₹${fmt(atc3)}`)] };
  }),
  p('mean-median', 'XI', 'ch7', 'apply', 'easy', (r) => {
    const xs = Array.from({ length: 7 }, () => r.int(10, 60));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length, med = xs.slice().sort((a, b) => a - b)[3];
    return { en: `The marks of 7 students are ${xs.join(', ')}. Calculate the arithmetic mean and the median.`, hi: `7 विद्यार्थियों के अंक ${xs.join(', ')} हैं। समांतर माध्य तथा माध्यिका परिकलित कीजिए।`,
      steps: [S(`Sum = ${xs.reduce((a, b) => a + b, 0)}; Mean = Sum/7 = ${fmt(mean)}`, `योग = ${xs.reduce((a, b) => a + b, 0)}; माध्य = योग/7 = ${fmt(mean)}`), S(`Arranged in order: ${xs.slice().sort((a, b) => a - b).join(', ')}`, `आरोही क्रम: ${xs.slice().sort((a, b) => a - b).join(', ')}`), S(`Median = size of (7+1)/2 = 4th item = ${med}`, `माध्यिका = (7+1)/2 = चौथा पद = ${med}`)],
      value: mean, unit: '', ansText: A(`Mean = ${fmt(mean)}; Median = ${med}`, `माध्य = ${fmt(mean)}; माध्यिका = ${med}`), wrongText: [A(`Mean = ${med}; Median = ${fmt(mean)}`, `माध्य = ${med}; माध्यिका = ${fmt(mean)}`), A(`Mean = ${fmt(mean + 1)}; Median = ${med}`, `माध्य = ${fmt(mean + 1)}; माध्यिका = ${med}`), A(`Mean = ${fmt(mean)}; Median = ${xs.slice().sort((a, b) => a - b)[2]}`, `माध्य = ${fmt(mean)}; माध्यिका = ${xs.slice().sort((a, b) => a - b)[2]}`)] };
  }),
];

export const ECONOMICS_CASES = [
  E('economics.XII.ch2.case-income', 'ch2', 'analyse', 'medium', (r) => {
    const coe = r.int(30, 60) * 100, os = r.int(15, 30) * 100, mi = r.int(5, 15) * 100, nfia = r.pick([-200, 100, 300]);
    const ndp = coe + os + mi, nnp = ndp + nfia;
    return { case: true, passage: { en: `The statistical office of a country compiled the following data (₹ crore): compensation of employees ${coe}; operating surplus ${os}; mixed income of self-employed ${mi}; net factor income from abroad ${nfia}.`,
      hi: `किसी देश के सांख्यिकी कार्यालय ने निम्न आँकड़े (₹ करोड़) संकलित किए: कर्मचारियों का पारिश्रमिक ${coe}; संचालन अधिशेष ${os}; स्वनियोजितों की मिश्रित आय ${mi}; विदेशों से निवल साधन आय ${nfia}।` },
      subs: [
        { marks: 1, mode: 'mcq', en: 'Net domestic product at factor cost (₹ crore) is:', hi: 'साधन लागत पर निवल घरेलू उत्पाद (₹ करोड़) है:', steps: [S('NDP at FC = COE + OS + MI', 'साधन लागत पर NDP = COE + OS + MI')], value: ndp, unit: '', wrong: [coe + os, ndp + nfia + 100, ndp - nfia] , sig: 6 },
        { marks: 1, mode: 'mcq', en: 'National income (NNP at FC) in ₹ crore is:', hi: 'राष्ट्रीय आय (साधन लागत पर NNP) ₹ करोड़ में है:', steps: [S('NNP at FC = NDP at FC + NFIA', 'साधन लागत पर NNP = साधन लागत पर NDP + NFIA')], value: nnp, unit: '', wrong: [ndp, ndp - nfia, coe + os + nfia], sig: 6 },
        { marks: 2, mode: 'num', en: 'Is NDP at factor cost greater or smaller than national income? Explain with the sign of NFIA.', hi: 'क्या साधन लागत पर NDP राष्ट्रीय आय से अधिक है या कम? NFIA के चिह्न के आधार पर स्पष्ट कीजिए।',
          steps: [S(`NFIA = ${nfia}, so National income = NDP ${nfia >= 0 ? '+' : '−'} ${Math.abs(nfia)}`, `NFIA = ${nfia}, अतः राष्ट्रीय आय = NDP ${nfia >= 0 ? '+' : '−'} ${Math.abs(nfia)}`), S(`NDP is ${nfia >= 0 ? 'smaller' : 'greater'} than national income`, `NDP राष्ट्रीय आय से ${nfia >= 0 ? 'कम' : 'अधिक'} है`)], ansText: A(`NDP is ${nfia >= 0 ? 'smaller' : 'greater'} (NFIA ${nfia >= 0 ? 'positive' : 'negative'})`, `NDP ${nfia >= 0 ? 'कम' : 'अधिक'} है (NFIA ${nfia >= 0 ? 'धनात्मक' : 'ऋणात्मक'})`), value: nnp, unit: '' }] };
  }, { kind: 'case', subject: 'economics', cls: 'XII' }),
];
