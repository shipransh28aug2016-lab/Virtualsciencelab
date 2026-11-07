// Accountancy generators. Every journal/answer table is built so Dr = Cr (checked again by validators).
import { fmt, rs, gcd, fracStr } from '../util.js';
import { E } from './common.js';

const p = (id, cls, ch, bloom, diff, fn) => E(`accountancy.${cls}.${ch}.${id}`, ch, bloom, diff, fn, { subject: 'accountancy', cls });
const S = (en, hi = en) => [en, hi];
const A = (en, hi) => ({ en, hi });
const NAMES = ['Asha', 'Bharat', 'Charu', 'Deepak', 'Esha'];
const NAMES_HI = { Asha: 'आशा', Bharat: 'भरत', Charu: 'चारु', Deepak: 'दीपक', Esha: 'ईशा' };
const h = (n) => NAMES_HI[n];
const lcm = (a, b) => (a * b) / gcd(a, b);
const ratioStr = (arr) => arr.join(' : ');
/** journal entry builder: lines [[accEn, accHi, dr, cr]] */
const J = (no, lines, narrEn, narrHi) => ({ no, lines: lines.map(([en, hi, dr, cr]) => ({ acc: A(en, hi), dr: dr || null, cr: cr || null })), narr: A(narrEn, narrHi) });
export const journalBalanced = (journal) => journal.every((e) => e.lines.reduce((t, l) => t + (l.dr || 0), 0) === e.lines.reduce((t, l) => t + (l.cr || 0), 0));
const jsteps = (journal) => journal.map((e) => S(`Entry ${e.no}: ${e.lines.map((l) => (l.dr ? `${l.acc.en} Dr ${rs(l.dr)}` : `To ${l.acc.en} ${rs(l.cr)}`)).join('; ')}`, `प्रविष्टि ${e.no}: ${e.lines.map((l) => (l.dr ? `${l.acc.hi} नामे ${rs(l.dr)}` : `${l.acc.hi} जमा ${rs(l.cr)}`)).join('; ')}`));

export const ACCOUNTANCY_XII = [
  p('subscription', 'XII', 'ch1', 'apply', 'medium', (r) => {
    const rec = r.int(40, 90) * 1000, oo = r.int(2, 6) * 1000, co = r.int(3, 8) * 1000, oa = r.int(1, 3) * 1000, ca = r.int(1, 4) * 1000;
    const v = rec - oo + co + oa - ca;
    return { en: `A club received subscriptions of ${rs(rec)} during the year. Subscriptions outstanding: at the beginning ${rs(oo)}, at the end ${rs(co)}. Subscriptions received in advance: at the beginning ${rs(oa)}, at the end ${rs(ca)}. Calculate the amount of subscriptions to be credited to the Income and Expenditure Account.`,
      hi: `एक क्लब ने वर्ष में ${rs(rec)} अभिदान (चंदा) प्राप्त किया। बकाया अभिदान: प्रारंभ में ${rs(oo)}, अंत में ${rs(co)}। अग्रिम प्राप्त अभिदान: प्रारंभ में ${rs(oa)}, अंत में ${rs(ca)}। आय-व्यय खाते के जमा पक्ष में दर्शाई जाने वाली अभिदान की राशि परिकलित कीजिए।`,
      steps: [S('Subscriptions received during the year', 'वर्ष में प्राप्त अभिदान'), S(`Less: outstanding at the beginning ${rs(oo)}; Add: outstanding at the end ${rs(co)}`, `घटाइए: प्रारंभिक बकाया ${rs(oo)}; जोड़िए: अंतिम बकाया ${rs(co)}`), S(`Add: advance at the beginning ${rs(oa)}; Less: advance at the end ${rs(ca)}`, `जोड़िए: प्रारंभिक अग्रिम ${rs(oa)}; घटाइए: अंतिम अग्रिम ${rs(ca)}`), S(`Subscriptions for the year = ${rs(v)}`, `वर्ष के अभिदान = ${rs(v)}`)],
      value: v, unit: '₹', ansText: A(rs(v), rs(v)), wrongText: [A(rs(rec + oo - co), rs(rec + oo - co)), A(rs(rec), rs(rec)), A(rs(rec - co + oo), rs(rec - co + oo))].map((x) => x) };
  }),
  p('pnl-appropriation', 'XII', 'ch2', 'apply', 'medium', (r) => {
    const [a, b] = NAMES.slice(0, 2);
    const ca = r.int(4, 8) * 50000, cb = r.int(2, 6) * 50000, rate = r.pick([5, 6, 8, 10]), np = r.int(6, 15) * 10000;
    const ia = ca * rate / 100, ib = cb * rate / 100, rem = np - ia - ib, sa = rem / 2, sb = rem / 2;
    return { en: `${a} and ${b} are partners sharing profits equally. Their capitals are ${rs(ca)} and ${rs(cb)}. Interest on capital is allowed at ${rate}% p.a. The net profit for the year before interest is ${rs(np)}. Calculate the total amount credited to ${a}'s account from the Profit & Loss Appropriation Account.`,
      hi: `${h(a)} और ${h(b)} साझेदार हैं जो लाभ समान अनुपात में बाँटते हैं। उनकी पूँजी क्रमशः ${rs(ca)} तथा ${rs(cb)} है। पूँजी पर ${rate}% वार्षिक ब्याज दिया जाता है। ब्याज से पूर्व वर्ष का शुद्ध लाभ ${rs(np)} है। लाभ-हानि विनियोजन खाते से ${h(a)} के खाते में जमा की गई कुल राशि परिकलित कीजिए।`,
      steps: [S(`Interest on ${a}'s capital = ${rs(ca)} × ${rate}% = ${rs(ia)}`, `${h(a)} की पूँजी पर ब्याज = ${rs(ca)} × ${rate}% = ${rs(ia)}`), S(`Interest on ${b}'s capital = ${rs(ib)}`, `${h(b)} की पूँजी पर ब्याज = ${rs(ib)}`), S(`Profit after interest = ${rs(np)} − ${rs(ia + ib)} = ${rs(rem)}`, `ब्याज के बाद लाभ = ${rs(np)} − ${rs(ia + ib)} = ${rs(rem)}`), S(`${a}'s total = ${rs(ia)} + ${rs(sa)} = ${rs(ia + sa)}`, `${h(a)} का कुल = ${rs(ia)} + ${rs(sa)} = ${rs(ia + sa)}`)],
      value: ia + sa, unit: '₹', ansText: A(rs(ia + sa), rs(ia + sa)), wrongText: [A(rs(sa), rs(sa)), A(rs(np / 2), rs(np / 2)), A(rs(ia + sb + ib), rs(ia + sb + ib))] };
  }),
  p('sacrifice', 'XII', 'ch3', 'apply', 'medium', (r) => {
    const sets = [[[3, 2], [1, 1]], [[1, 1], [3, 2]], [[2, 1], [1, 1]], [[3, 1], [2, 1]], [[5, 3], [3, 2]], [[4, 3], [2, 1]]];
    const [o, n] = r.pick(sets);
    const [a, b] = ['Asha', 'Bharat'];
    const oT = o[0] + o[1], nT = n[0] + n[1];
    const L = lcm(oT, nT), dA = o[0] * (L / oT) - n[0] * (L / nT);
    const who = dA > 0 ? [a, b, dA] : dA < 0 ? [b, a, -dA] : null;
    if (!who) return null;
    const txt = `${who[0]} sacrifices ${fracStr(who[2], L)}, ${who[1]} gains ${fracStr(who[2], L)}`;
    const txtHi = `${h(who[0])} का त्याग ${fracStr(who[2], L)} है, ${h(who[1])} का लाभ ${fracStr(who[2], L)} है`;
    return { en: `${a} and ${b} share profits in the ratio ${ratioStr(o)}. They decide to share future profits in the ratio ${ratioStr(n)}. Calculate the sacrificing and gaining ratio.`,
      hi: `${h(a)} तथा ${h(b)} लाभ ${ratioStr(o)} के अनुपात में बाँटते हैं। वे भविष्य में लाभ ${ratioStr(n)} के अनुपात में बाँटने का निर्णय लेते हैं। त्याग तथा लाभ अनुपात परिकलित कीजिए।`,
      steps: [S(`Old share: ${a} = ${o[0]}/${oT}, ${b} = ${o[1]}/${oT}`, `पुराना हिस्सा: ${h(a)} = ${o[0]}/${oT}, ${h(b)} = ${o[1]}/${oT}`), S(`New share: ${a} = ${n[0]}/${nT}, ${b} = ${n[1]}/${nT}`, `नया हिस्सा: ${h(a)} = ${n[0]}/${nT}, ${h(b)} = ${n[1]}/${nT}`), S('Sacrifice = Old share − New share (negative means gain)', 'त्याग = पुराना हिस्सा − नया हिस्सा (ऋणात्मक = लाभ)'), S(txt, txtHi)],
      value: who[2] / L, unit: '', ansText: A(txt, txtHi),
      wrongText: [A(`${who[1]} sacrifices ${fracStr(who[2], L)}, ${who[0]} gains ${fracStr(who[2], L)}`, `${h(who[1])} का त्याग ${fracStr(who[2], L)} है, ${h(who[0])} का लाभ ${fracStr(who[2], L)} है`), A(`${who[0]} sacrifices ${fracStr(who[2] * 2, L)}, ${who[1]} gains ${fracStr(who[2] * 2, L)}`, `${h(who[0])} का त्याग ${fracStr(who[2] * 2, L)} है`), A('No sacrifice or gain; ratios are equal', 'कोई त्याग या लाभ नहीं')] };
  }),
  p('admission-goodwill', 'XII', 'ch4', 'apply', 'hard', (r) => {
    const a = 'Asha', b = 'Bharat', c = 'Charu';
    const share = r.pick([[1, 5], [1, 4], [1, 3]]), ratio = r.pick([[3, 2], [2, 1], [1, 1]]);
    const avg = r.pick([30000, 40000, 60000, 75000]), yrs = r.pick([2, 3]), gw = avg * yrs;
    const capNew = r.pick([50000, 80000, 100000]);
    const gwShare = gw * share[0] / share[1];
    // new partner brings capital + his share of goodwill in cash; premium credited to sacrificing partners (sacrifice = old ratio share of what new takes => sacrifice ratio = old ratio)
    const T = ratio[0] + ratio[1];
    const prA = gwShare * ratio[0] / T, prB = gwShare * ratio[1] / T;
    if (!Number.isInteger(prA) || !Number.isInteger(prB)) return null;
    const j = [
      J(1, [['Bank A/c', 'बैंक खाता', capNew + gwShare, 0], [`${c}'s Capital A/c`, `${h(c)} का पूँजी खाता`, 0, capNew], ['Premium for Goodwill A/c', 'ख्याति के लिए प्रीमियम खाता', 0, gwShare]], `Being capital and premium for goodwill brought in by ${c}`, `${h(c)} द्वारा पूँजी तथा ख्याति का प्रीमियम लाने की प्रविष्टि`),
      J(2, [['Premium for Goodwill A/c', 'ख्याति के लिए प्रीमियम खाता', gwShare, 0], [`${a}'s Capital A/c`, `${h(a)} का पूँजी खाता`, 0, prA], [`${b}'s Capital A/c`, `${h(b)} का पूँजी खाता`, 0, prB]], 'Being premium distributed among sacrificing partners in their sacrificing ratio', 'त्याग करने वाले साझेदारों में प्रीमियम को त्याग अनुपात में बाँटने की प्रविष्टि'),
    ];
    return { en: `${a} and ${b} share profits in the ratio ${ratioStr(ratio)}. They admit ${c} for ${share[0]}/${share[1]} share, which ${c} acquires from ${a} and ${b} in their old ratio. The average profit of the firm is ${rs(avg)} and goodwill is valued at ${yrs} years' purchase of average profit. ${c} brings capital of ${rs(capNew)} and his share of goodwill in cash. Pass the journal entries.`,
      hi: `${h(a)} और ${h(b)} लाभ ${ratioStr(ratio)} के अनुपात में बाँटते हैं। वे ${h(c)} को ${share[0]}/${share[1]} हिस्से के लिए साझेदार बनाते हैं, जो ${h(c)} अपने पुराने अनुपात में ${h(a)} तथा ${h(b)} से प्राप्त करता है। फर्म का औसत लाभ ${rs(avg)} है और ख्याति का मूल्यांकन औसत लाभ के ${yrs} वर्ष के क्रय के आधार पर किया गया। ${h(c)} ${rs(capNew)} पूँजी तथा ख्याति में अपना हिस्सा नकद लाता है। जर्नल प्रविष्टियाँ कीजिए।`,
      steps: [S(`Goodwill = ${rs(avg)} × ${yrs} = ${rs(gw)}`, `ख्याति = ${rs(avg)} × ${yrs} = ${rs(gw)}`), S(`${c}'s share of goodwill = ${rs(gw)} × ${share[0]}/${share[1]} = ${rs(gwShare)}`, `${h(c)} का ख्याति में हिस्सा = ${rs(gw)} × ${share[0]}/${share[1]} = ${rs(gwShare)}`), S(`Sacrificing ratio = old ratio ${ratioStr(ratio)}`, `त्याग अनुपात = पुराना अनुपात ${ratioStr(ratio)}`), ...jsteps(j)],
      value: gwShare, unit: '₹', journal: j, ansText: A(`Premium for goodwill ${rs(gwShare)}; Bank Dr ${rs(capNew + gwShare)}`, `ख्याति का प्रीमियम ${rs(gwShare)}; बैंक नामे ${rs(capNew + gwShare)}`) };
  }),
  p('retirement-gain', 'XII', 'ch5', 'apply', 'hard', (r) => {
    const sets = [[[5, 3, 2], 2, [3, 2]], [[3, 2, 1], 3, [3, 2]], [[2, 2, 1], 3, [1, 1]], [[4, 3, 2], 2, [4, 3]]];
    const [o, ret, newr] = r.pick(sets);
    // partners A,B,C; C retires (index 2) when ret===... keep C retiring always
    const oT = o[0] + o[1] + o[2], nT = newr[0] + newr[1], L = lcm(oT, nT);
    const gA = newr[0] * (L / nT) - o[0] * (L / oT), gB = newr[1] * (L / nT) - o[1] * (L / oT);
    if (gA <= 0 || gB <= 0) return null;
    const txt = `Gaining ratio ${gA} : ${gB} (${fracStr(gA, L)} and ${fracStr(gB, L)} gained)`;
    return { en: `Asha, Bharat and Charu share profits in the ratio ${ratioStr(o)}. Charu retires and the continuing partners decide to share future profits in the ratio ${ratioStr(newr)}. Calculate the gaining ratio.`,
      hi: `आशा, भरत तथा चारु लाभ ${ratioStr(o)} के अनुपात में बाँटते हैं। चारु सेवानिवृत्त होती है और शेष साझेदार भविष्य के लाभ ${ratioStr(newr)} के अनुपात में बाँटने का निर्णय लेते हैं। लाभ अनुपात (Gaining ratio) परिकलित कीजिए।`,
      steps: [S(`Old shares: ${o.map((x) => x + '/' + oT).join(', ')}`, `पुराने हिस्से: ${o.map((x) => x + '/' + oT).join(', ')}`), S(`New shares: ${newr.map((x) => x + '/' + nT).join(', ')}`, `नए हिस्से: ${newr.map((x) => x + '/' + nT).join(', ')}`), S('Gain = New share − Old share', 'लाभ = नया हिस्सा − पुराना हिस्सा'), S(txt, `लाभ अनुपात ${gA} : ${gB}`)],
      value: gA / gB, unit: '', ansText: A(txt, `लाभ अनुपात ${gA} : ${gB}`),
      wrongText: [A(`Gaining ratio ${gB} : ${gA}`, `लाभ अनुपात ${gB} : ${gA}`), A(`Gaining ratio ${o[0]} : ${o[1]}`, `लाभ अनुपात ${o[0]} : ${o[1]}`), A(`Gaining ratio ${newr[0]} : ${newr[1]}`, `लाभ अनुपात ${newr[0]} : ${newr[1]}`)].filter((x) => x.en !== txt) };
  }),
  p('realisation-loss', 'XII', 'ch6', 'apply', 'medium', (r) => {
    const A1 = r.int(4, 9) * 20000, pct = r.pick([60, 70, 80, 90]), L = r.int(2, 5) * 10000, exp = r.pick([2000, 3000, 5000]);
    const realised = A1 * pct / 100, loss = A1 - realised + exp;
    return { en: `On dissolution of a firm, assets (other than cash) of book value ${rs(A1)} realised ${pct}% of book value. Liabilities of ${rs(L)} were settled at book value. Realisation expenses were ${rs(exp)}. Calculate the loss on realisation.`,
      hi: `फर्म के विघटन पर रोकड़ के अतिरिक्त परिसंपत्तियाँ, जिनका पुस्तक मूल्य ${rs(A1)} था, पुस्तक मूल्य के ${pct}% पर वसूल हुईं। ${rs(L)} के दायित्वों का भुगतान पुस्तक मूल्य पर किया गया। वसूली व्यय ${rs(exp)} थे। वसूली पर हानि परिकलित कीजिए।`,
      steps: [S(`Assets realised = ${rs(A1)} × ${pct}% = ${rs(realised)}`, `वसूल परिसंपत्तियाँ = ${rs(A1)} × ${pct}% = ${rs(realised)}`), S(`Loss on assets = ${rs(A1)} − ${rs(realised)} = ${rs(A1 - realised)}`, `परिसंपत्तियों पर हानि = ${rs(A1)} − ${rs(realised)} = ${rs(A1 - realised)}`), S('Liabilities settled at book value: no gain or loss', 'दायित्व पुस्तक मूल्य पर चुकाए: कोई लाभ/हानि नहीं'), S(`Add realisation expenses ${rs(exp)}; Loss = ${rs(loss)}`, `वसूली व्यय ${rs(exp)} जोड़ें; हानि = ${rs(loss)}`)],
      value: loss, unit: '₹', ansText: A(rs(loss), rs(loss)), wrongText: [A(rs(A1 - realised), rs(A1 - realised)), A(rs(A1 - realised + L), rs(A1 - realised + L)), A(rs(A1 - realised - exp), rs(A1 - realised - exp))] };
  }),
  p('share-issue', 'XII', 'ch7', 'apply', 'hard', (r) => {
    const N = r.pick([5000, 8000, 10000]), prem = r.pick([1, 2, 3]), app = r.pick([2, 3]), allot = r.pick([4, 5]) + prem; const face = 10;
    const call = face + prem - app - allot;
    if (call <= 0) return null;
    const A1 = N * app, A2 = N * allot, A3 = N * call, cap1 = N * app, capAllot = N * (allot - prem), pr = N * prem;
    const j = [
      J(1, [['Bank A/c', 'बैंक खाता', A1, 0], ['Share Application A/c', 'अंश आवेदन खाता', 0, A1]], 'Being application money received', 'आवेदन राशि प्राप्त होने की प्रविष्टि'),
      J(2, [['Share Application A/c', 'अंश आवेदन खाता', A1, 0], ['Share Capital A/c', 'अंश पूँजी खाता', 0, cap1]], 'Being application money transferred to share capital', 'आवेदन राशि अंश पूँजी में हस्तांतरित करने की प्रविष्टि'),
      J(3, [['Share Allotment A/c', 'अंश आबंटन खाता', A2, 0], ['Share Capital A/c', 'अंश पूँजी खाता', 0, capAllot], ['Securities Premium A/c', 'प्रतिभूति प्रीमियम खाता', 0, pr]], 'Being allotment money due including premium', 'प्रीमियम सहित आबंटन राशि देय होने की प्रविष्टि'),
      J(4, [['Bank A/c', 'बैंक खाता', A2, 0], ['Share Allotment A/c', 'अंश आबंटन खाता', 0, A2]], 'Being allotment money received', 'आबंटन राशि प्राप्त होने की प्रविष्टि'),
      J(5, [['Share First and Final Call A/c', 'अंश प्रथम एवं अंतिम याचना खाता', A3, 0], ['Share Capital A/c', 'अंश पूँजी खाता', 0, A3]], 'Being first and final call due', 'प्रथम एवं अंतिम याचना देय होने की प्रविष्टि'),
      J(6, [['Bank A/c', 'बैंक खाता', A3, 0], ['Share First and Final Call A/c', 'अंश प्रथम एवं अंतिम याचना खाता', 0, A3]], 'Being first and final call received', 'प्रथम एवं अंतिम याचना प्राप्त होने की प्रविष्टि'),
    ];
    return { en: `Sunrise Ltd. issued ${N} equity shares of ₹10 each at a premium of ₹${prem} per share, payable: on application ₹${app}; on allotment ₹${allot} (including premium); and the balance on first and final call. All money was duly received. Pass the journal entries.`,
      hi: `सनराइज़ लिमिटेड ने ₹10 वाले ${N} समता अंश ₹${prem} प्रति अंश प्रीमियम पर निर्गमित किए, जिनका भुगतान: आवेदन पर ₹${app}; आबंटन पर ₹${allot} (प्रीमियम सहित); तथा शेष राशि प्रथम एवं अंतिम याचना पर देय था। सारी राशि विधिवत प्राप्त हो गई। जर्नल प्रविष्टियाँ कीजिए।`,
      steps: [S(`Application: ${N} × ₹${app} = ${rs(A1)}; Allotment: ${N} × ₹${allot} = ${rs(A2)}; Call: ${N} × ₹${call} = ${rs(A3)}`, `आवेदन: ${N} × ₹${app} = ${rs(A1)}; आबंटन: ${N} × ₹${allot} = ${rs(A2)}; याचना: ${N} × ₹${call} = ${rs(A3)}`), S(`Securities premium = ${N} × ₹${prem} = ${rs(pr)}`, `प्रतिभूति प्रीमियम = ${N} × ₹${prem} = ${rs(pr)}`), ...jsteps(j)],
      value: A1 + A2 + A3, unit: '₹', journal: j, ansText: A(`Total cash received ${rs(A1 + A2 + A3)}`, `कुल प्राप्त नकद ${rs(A1 + A2 + A3)}`) };
  }),
  p('debenture-discount', 'XII', 'ch8', 'apply', 'hard', (r) => {
    const N = r.pick([500, 1000, 2000]), d = r.pick([5, 10]), pm = r.pick([5, 10]);
    const face = N * 100, cash = face * (100 - d) / 100, prem = face * pm / 100, loss = face - cash + prem;
    const j = [J(1, [['Bank A/c', 'बैंक खाता', cash, 0], ['Loss on Issue of Debentures A/c', 'ऋणपत्र निर्गमन पर हानि खाता', loss, 0], ['Debentures A/c', 'ऋणपत्र खाता', 0, face], ['Premium on Redemption of Debentures A/c', 'ऋणपत्र मोचन पर प्रीमियम खाता', 0, prem]], 'Being debentures issued at a discount, redeemable at a premium', 'ऋणपत्र बट्टे पर निर्गमित, प्रीमियम पर मोचनीय')];
    return { en: `A company issued ${N} 9% debentures of ₹100 each at a discount of ${d}%, redeemable at a premium of ${pm}%. Pass the journal entry for the issue and calculate the loss on issue of debentures.`,
      hi: `एक कंपनी ने ₹100 वाले ${N} 9% ऋणपत्र ${d}% बट्टे पर निर्गमित किए जो ${pm}% प्रीमियम पर मोचनीय हैं। निर्गमन की जर्नल प्रविष्टि कीजिए तथा ऋणपत्रों के निर्गमन पर हानि परिकलित कीजिए।`,
      steps: [S(`Face value = ${N} × 100 = ${rs(face)}; cash received = ${rs(cash)}`, `अंकित मूल्य = ${N} × 100 = ${rs(face)}; प्राप्त नकद = ${rs(cash)}`), S(`Premium on redemption = ${rs(prem)}`, `मोचन पर प्रीमियम = ${rs(prem)}`), S(`Loss on issue = discount ${rs(face - cash)} + premium ${rs(prem)} = ${rs(loss)}`, `निर्गमन पर हानि = बट्टा ${rs(face - cash)} + प्रीमियम ${rs(prem)} = ${rs(loss)}`), ...jsteps(j)],
      value: loss, unit: '₹', journal: j, ansText: A(rs(loss), rs(loss)), wrongText: [A(rs(face - cash), rs(face - cash)), A(rs(prem), rs(prem)), A(rs(face - cash - prem > 0 ? face - cash - prem : loss * 2), rs(loss * 2))] };
  }),
  p('current-ratio', 'XII', 'ch11', 'apply', 'easy', (r) => {
    const ca = r.int(4, 12) * 50000, cl = r.int(2, 6) * 50000, inv = r.int(1, 3) * 50000;
    const cr = ca / cl, qr = (ca - inv) / cl;
    return { en: `A company has current assets of ${rs(ca)} (including inventory ${rs(inv)}) and current liabilities of ${rs(cl)}. Calculate the current ratio and the quick (liquid) ratio.`,
      hi: `एक कंपनी की चालू परिसंपत्तियाँ ${rs(ca)} (जिसमें ${rs(inv)} का स्टॉक शामिल है) तथा चालू दायित्व ${rs(cl)} हैं। चालू अनुपात तथा तरल (शीघ्र) अनुपात परिकलित कीजिए।`,
      steps: [S('Current ratio = Current assets / Current liabilities', 'चालू अनुपात = चालू परिसंपत्तियाँ / चालू दायित्व'), S(`= ${ca}/${cl} = ${fmt(cr)} : 1`, `= ${ca}/${cl} = ${fmt(cr)} : 1`), S('Quick assets = Current assets − Inventory', 'तरल परिसंपत्तियाँ = चालू परिसंपत्तियाँ − स्टॉक'), S(`Quick ratio = ${ca - inv}/${cl} = ${fmt(qr)} : 1`, `तरल अनुपात = ${ca - inv}/${cl} = ${fmt(qr)} : 1`)],
      value: cr, unit: '', ansText: A(`Current ratio ${fmt(cr)} : 1; Quick ratio ${fmt(qr)} : 1`, `चालू अनुपात ${fmt(cr)} : 1; तरल अनुपात ${fmt(qr)} : 1`),
      wrongText: [A(`Current ratio ${fmt(qr)} : 1; Quick ratio ${fmt(cr)} : 1`, `चालू अनुपात ${fmt(qr)} : 1; तरल अनुपात ${fmt(cr)} : 1`), A(`Current ratio ${fmt(cl / ca)} : 1; Quick ratio ${fmt(cl / (ca - inv))} : 1`, `चालू अनुपात ${fmt(cl / ca)} : 1`), A(`Current ratio ${fmt(cr)} : 1; Quick ratio ${fmt(cr)} : 1`, `चालू अनुपात ${fmt(cr)} : 1; तरल अनुपात ${fmt(cr)} : 1`)] };
  }),
  p('debt-equity', 'XII', 'ch11', 'apply', 'medium', (r) => {
    const ltb = r.int(2, 6) * 100000, sh = r.int(4, 10) * 100000, res = r.int(1, 4) * 100000;
    const de = ltb / (sh + res);
    return { en: `A company's long-term borrowings are ${rs(ltb)}, shareholders' funds comprise share capital ${rs(sh)} and reserves ${rs(res)}. Calculate the debt-equity ratio.`,
      hi: `एक कंपनी के दीर्घकालीन उधार ${rs(ltb)} हैं; अंशधारियों की निधि में अंश पूँजी ${rs(sh)} तथा संचय ${rs(res)} हैं। ऋण-समता अनुपात परिकलित कीजिए।`,
      steps: [S('Debt-equity ratio = Long-term debt / Shareholders\' funds', 'ऋण-समता अनुपात = दीर्घकालीन ऋण / अंशधारियों की निधि'), S(`Shareholders' funds = ${rs(sh)} + ${rs(res)} = ${rs(sh + res)}`, `अंशधारियों की निधि = ${rs(sh)} + ${rs(res)} = ${rs(sh + res)}`), S(`Ratio = ${ltb}/${sh + res} = ${fmt(de)} : 1`, `अनुपात = ${ltb}/${sh + res} = ${fmt(de)} : 1`)],
      value: de, unit: '', ansText: A(`${fmt(de)} : 1`, `${fmt(de)} : 1`), wrongText: [A(`${fmt(ltb / sh)} : 1`, `${fmt(ltb / sh)} : 1`), A(`${fmt((sh + res) / ltb)} : 1`, `${fmt((sh + res) / ltb)} : 1`), A(`${fmt(ltb / (sh + res + ltb))} : 1`, `${fmt(ltb / (sh + res + ltb))} : 1`)] };
  }),
  p('cash-ops', 'XII', 'ch12', 'apply', 'hard', (r) => {
    const np = r.int(2, 6) * 50000, dep = r.int(1, 3) * 10000, intr = r.int(1, 3) * 5000, tax = r.int(1, 3) * 10000, dinv = r.int(1, 2) * 10000, dpay = r.int(1, 3) * 10000, dcrd = r.int(1, 2) * 10000;
    const opBefore = np + tax + dep + intr, wc = -dinv + dpay + dcrd, cashGen = opBefore + wc, net = cashGen - tax;
    return { en: `From the following, calculate cash flow from operating activities: Net profit after tax ${rs(np)}; provision for tax ${rs(tax)}; depreciation ${rs(dep)}; interest on debentures ${rs(intr)}; increase in inventory ${rs(dinv)}; increase in trade payables ${rs(dpay)}; decrease in trade receivables ${rs(dcrd)}; income tax paid ${rs(tax)}.`,
      hi: `निम्नलिखित से संचालन गतिविधियों से रोकड़ प्रवाह परिकलित कीजिए: कर के बाद शुद्ध लाभ ${rs(np)}; कर के लिए प्रावधान ${rs(tax)}; ह्रास ${rs(dep)}; ऋणपत्रों पर ब्याज ${rs(intr)}; स्टॉक में वृद्धि ${rs(dinv)}; व्यापारिक देयों में वृद्धि ${rs(dpay)}; व्यापारिक प्राप्यों में कमी ${rs(dcrd)}; आयकर का भुगतान ${rs(tax)}।`,
      steps: [S(`Net profit before tax = ${rs(np)} + ${rs(tax)} = ${rs(np + tax)}`, `कर से पूर्व शुद्ध लाभ = ${rs(np)} + ${rs(tax)} = ${rs(np + tax)}`), S(`Add non-cash/non-operating items: depreciation ${rs(dep)} + interest ${rs(intr)}; operating profit before working capital changes = ${rs(opBefore)}`, `गैर-रोकड़/गैर-संचालन मदें जोड़ें: ह्रास ${rs(dep)} + ब्याज ${rs(intr)}; कार्यशील पूँजी परिवर्तन से पूर्व संचालन लाभ = ${rs(opBefore)}`), S(`Working capital changes: −${rs(dinv)} + ${rs(dpay)} + ${rs(dcrd)} = ${rs(wc)}`, `कार्यशील पूँजी परिवर्तन: −${rs(dinv)} + ${rs(dpay)} + ${rs(dcrd)} = ${rs(wc)}`), S(`Cash generated from operations = ${rs(cashGen)}; less tax paid ${rs(tax)}`, `संचालन से उत्पन्न रोकड़ = ${rs(cashGen)}; घटाइए: कर भुगतान ${rs(tax)}`), S(`Net cash from operating activities = ${rs(net)}`, `संचालन गतिविधियों से निवल रोकड़ = ${rs(net)}`)],
      value: net, unit: '₹', ansText: A(rs(net), rs(net)), wrongText: [A(rs(cashGen), rs(cashGen)), A(rs(net - 2 * dinv), rs(net - 2 * dinv)), A(rs(np + dep + wc - tax), rs(np + dep + wc - tax))] };
  }),
].filter(Boolean);

export const ACCOUNTANCY_XI = [
  p('brs', 'XI', 'ch5', 'apply', 'medium', (r) => {
    const cb = r.int(20, 60) * 1000, a = r.int(2, 8) * 1000, b = r.int(1, 5) * 1000, c = r.int(1, 5) * 100, d = r.int(1, 5) * 100;
    const pb = cb + a - b - c + d;
    return { en: `The favourable balance as per cash book is ${rs(cb)}. Cheques issued but not yet presented ${rs(a)}; cheques deposited but not yet cleared ${rs(b)}; bank charges ${rs(c)} debited by the bank but not recorded in cash book; interest ${rs(d)} credited by the bank but not recorded in cash book. Find the balance as per pass book.`,
      hi: `रोकड़ बही के अनुसार अनुकूल शेष ${rs(cb)} है। जारी किए गए पर अप्रस्तुत चेक ${rs(a)}; जमा कराए पर अभी तक संग्रहित न हुए चेक ${rs(b)}; बैंक द्वारा नामे किए गए बैंक व्यय ${rs(c)} जो रोकड़ बही में नहीं लिखे; बैंक द्वारा जमा किया गया ब्याज ${rs(d)} जो रोकड़ बही में नहीं लिखा। पास बुक के अनुसार शेष ज्ञात कीजिए।`,
      steps: [S(`Balance as per cash book ${rs(cb)}`, `रोकड़ बही के अनुसार शेष ${rs(cb)}`), S(`Add: cheques issued not presented ${rs(a)}; interest credited ${rs(d)}`, `जोड़िए: अप्रस्तुत चेक ${rs(a)}; जमा ब्याज ${rs(d)}`), S(`Less: cheques deposited not cleared ${rs(b)}; bank charges ${rs(c)}`, `घटाइए: असंग्रहित चेक ${rs(b)}; बैंक व्यय ${rs(c)}`), S(`Balance as per pass book = ${rs(pb)}`, `पास बुक के अनुसार शेष = ${rs(pb)}`)],
      value: pb, unit: '₹', ansText: A(rs(pb), rs(pb)), wrongText: [A(rs(cb - a + b + c - d), rs(cb - a + b + c - d)), A(rs(cb + a + b - c + d), rs(cb + a + b - c + d)), A(rs(cb + a - b + c - d), rs(cb + a - b + c - d))] };
  }),
  p('depreciation', 'XI', 'ch7', 'apply', 'medium', (r) => {
    const cost = r.int(4, 12) * 50000, life = r.pick([5, 8, 10]), scrap = r.pick([0.05, 0.1, 0.2]) * cost, rate = r.pick([10, 15, 20]);
    const slm = (cost - scrap) / life, y1 = cost * rate / 100, y2 = (cost - y1) * rate / 100;
    return { en: `A machine costing ${rs(cost)} has an estimated life of ${life} years and scrap value ${rs(scrap)}. Calculate (a) annual depreciation under the straight line method and (b) depreciation for the second year under the written down value method at ${rate}% p.a.`,
      hi: `${rs(cost)} की लागत वाली एक मशीन का अनुमानित जीवन ${life} वर्ष तथा अवशेष मूल्य ${rs(scrap)} है। (अ) सीधी रेखा विधि से वार्षिक ह्रास तथा (ब) ${rate}% वार्षिक दर से ह्रासित मूल्य (WDV) विधि से दूसरे वर्ष का ह्रास परिकलित कीजिए।`,
      steps: [S(`SLM depreciation = (Cost − Scrap)/Life = (${rs(cost)} − ${rs(scrap)})/${life} = ${rs(slm)}`, `सीधी रेखा विधि ह्रास = (लागत − अवशेष)/जीवन = (${rs(cost)} − ${rs(scrap)})/${life} = ${rs(slm)}`), S(`WDV year 1 depreciation = ${rs(cost)} × ${rate}% = ${rs(y1)}`, `WDV प्रथम वर्ष का ह्रास = ${rs(cost)} × ${rate}% = ${rs(y1)}`), S(`Book value at start of year 2 = ${rs(cost - y1)}`, `द्वितीय वर्ष के आरंभ में पुस्तक मूल्य = ${rs(cost - y1)}`), S(`Year 2 depreciation = ${rs(y2)}`, `द्वितीय वर्ष का ह्रास = ${rs(y2)}`)],
      value: y2, unit: '₹', ansText: A(`(a) ${rs(slm)} (b) ${rs(y2)}`, `(अ) ${rs(slm)} (ब) ${rs(y2)}`), wrongText: [A(`(a) ${rs(cost / life)} (b) ${rs(y1)}`, `(अ) ${rs(cost / life)} (ब) ${rs(y1)}`), A(`(a) ${rs(slm)} (b) ${rs(y1)}`, `(अ) ${rs(slm)} (ब) ${rs(y1)}`), A(`(a) ${rs(y1)} (b) ${rs(slm)}`, `(अ) ${rs(y1)} (ब) ${rs(slm)}`)] };
  }),
  p('trial-balance', 'XI', 'ch6', 'apply', 'medium', (r) => {
    const drItems = [['Plant and machinery', 'संयंत्र एवं मशीनरी', r.int(5, 9) * 20000], ['Stock', 'स्टॉक', r.int(2, 6) * 10000], ['Debtors', 'देनदार', r.int(2, 5) * 10000], ['Cash in hand', 'हस्तस्थ रोकड़', r.int(1, 4) * 5000], ['Rent', 'किराया', r.int(1, 3) * 6000]];
    const crItems = [['Creditors', 'लेनदार', r.int(2, 5) * 10000], ['Sales', 'विक्रय', r.int(8, 15) * 10000]];
    const dr = drItems.reduce((t, x) => t + x[2], 0), cr = crItems.reduce((t, x) => t + x[2], 0), cap = dr - cr;
    if (cap <= 0) return null;
    const rows = [...drItems.map((x) => [x[0], rs(x[2]), '']), ...crItems.map((x) => [x[0], '', rs(x[2])])];
    return { en: `The following balances are extracted from the books of a trader. Find the amount of Capital that will make the trial balance agree.`, hi: `एक व्यापारी की पुस्तकों से निम्न शेष लिए गए हैं। वह पूँजी की राशि ज्ञात कीजिए जिससे तलपट मेल खाए।`,
      table: { header: ['Account', 'Debit (₹)', 'Credit (₹)'], rows },
      steps: [S(`Total of debit balances = ${rs(dr)}`, `नामे शेषों का योग = ${rs(dr)}`), S(`Total of credit balances (excluding capital) = ${rs(cr)}`, `जमा शेषों का योग (पूँजी को छोड़कर) = ${rs(cr)}`), S(`Capital = ${rs(dr)} − ${rs(cr)} = ${rs(cap)}`, `पूँजी = ${rs(dr)} − ${rs(cr)} = ${rs(cap)}`)],
      value: cap, unit: '₹', ansText: A(rs(cap), rs(cap)), wrongText: [A(rs(dr + cr), rs(dr + cr)), A(rs(dr), rs(dr)), A(rs(cr), rs(cr))] };
  }),
  p('incomplete-profit', 'XI', 'ch10', 'apply', 'medium', (r) => {
    const oc = r.int(4, 9) * 50000, cc = oc + r.int(1, 4) * 20000, dr = r.int(1, 3) * 10000, fresh = r.int(0, 2) * 20000;
    const profit = cc - oc + dr - fresh;
    return { en: `Opening capital of a trader was ${rs(oc)} and closing capital ${rs(cc)}. During the year he withdrew ${rs(dr)} for personal use and introduced additional capital of ${rs(fresh)}. Calculate the profit for the year using the Statement of Affairs (Net Worth) method.`,
      hi: `एक व्यापारी की प्रारंभिक पूँजी ${rs(oc)} तथा अंतिम पूँजी ${rs(cc)} थी। वर्ष में उसने निजी प्रयोग हेतु ${rs(dr)} निकाले तथा ${rs(fresh)} की अतिरिक्त पूँजी लगाई। हैसियत विवरण (निवल मूल्य) विधि से वर्ष का लाभ परिकलित कीजिए।`,
      steps: [S(`Increase in capital = ${rs(cc)} − ${rs(oc)} = ${rs(cc - oc)}`, `पूँजी में वृद्धि = ${rs(cc)} − ${rs(oc)} = ${rs(cc - oc)}`), S(`Add drawings ${rs(dr)}; less fresh capital ${rs(fresh)}`, `जोड़िए: आहरण ${rs(dr)}; घटाइए: नई पूँजी ${rs(fresh)}`), S(`Profit = ${rs(profit)}`, `लाभ = ${rs(profit)}`)],
      value: profit, unit: '₹', ansText: A(rs(profit), rs(profit)), wrongText: [A(rs(cc - oc), rs(cc - oc)), A(rs(cc - oc - dr + fresh), rs(cc - oc - dr + fresh)), A(rs(cc - oc + dr + fresh), rs(cc - oc + dr + fresh))] };
  }),
];

export const ACCOUNTANCY_CASES = [
  E('accountancy.XII.ch11.case-ratios', 'ch11', 'analyse', 'medium', (r) => {
    const ca = r.int(5, 10) * 40000, cl = r.int(2, 4) * 40000, inv = r.int(1, 3) * 40000, ltd = r.int(2, 5) * 100000, eq = r.int(5, 9) * 100000;
    const cr = ca / cl, qr = (ca - inv) / cl, de = ltd / eq;
    return { case: true, passage: { en: `Rainbow Traders Ltd. reports: current assets ${rs(ca)} (inventory ${rs(inv)}), current liabilities ${rs(cl)}, long-term debt ${rs(ltd)} and shareholders' funds ${rs(eq)}. The management wants to assess liquidity and solvency.`,
      hi: `रेनबो ट्रेडर्स लिमिटेड की रिपोर्ट: चालू परिसंपत्तियाँ ${rs(ca)} (स्टॉक ${rs(inv)}), चालू दायित्व ${rs(cl)}, दीर्घकालीन ऋण ${rs(ltd)} तथा अंशधारियों की निधि ${rs(eq)}। प्रबंधन तरलता तथा शोधन क्षमता का मूल्यांकन करना चाहता है।` },
      subs: [
        { marks: 1, mode: 'mcq', en: 'The current ratio is:', hi: 'चालू अनुपात है:', steps: [S('Current assets / Current liabilities')], value: cr, unit: ': 1', wrong: [qr, cl / ca, de] },
        { marks: 1, mode: 'mcq', en: 'The quick ratio is:', hi: 'तरल अनुपात है:', steps: [S('(Current assets − Inventory) / Current liabilities', '(चालू परिसंपत्तियाँ − स्टॉक) / चालू दायित्व')], value: qr, unit: ': 1', wrong: [cr, (ca + inv) / cl, de] },
        { marks: 2, mode: 'num', en: 'Calculate the debt-equity ratio and state whether it is conservative if the standard norm is 2 : 1.', hi: 'ऋण-समता अनुपात परिकलित कीजिए तथा यदि मानक 2 : 1 हो तो बताइए कि क्या यह सुरक्षित है।',
          steps: [S(`Debt-equity = ${ltd}/${eq} = ${fmt(de)} : 1`, `ऋण-समता = ${ltd}/${eq} = ${fmt(de)} : 1`), S(`${de <= 2 ? 'Below' : 'Above'} 2 : 1, hence ${de <= 2 ? 'safe/conservative' : 'risky'}`, `2 : 1 से ${de <= 2 ? 'कम' : 'अधिक'}, अतः ${de <= 2 ? 'सुरक्षित' : 'जोखिमपूर्ण'}`)], ansText: A(`${fmt(de)} : 1 (${de <= 2 ? 'conservative' : 'risky'})`, `${fmt(de)} : 1 (${de <= 2 ? 'सुरक्षित' : 'जोखिमपूर्ण'})`), value: de, unit: '' }] };
  }, { kind: 'case', subject: 'accountancy', cls: 'XII' }),
];
