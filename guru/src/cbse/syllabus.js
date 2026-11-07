// Syllabus data: embedded chapter tables (bilingual) + overlay from repo curriculum JSON when loadable.
// Weights are RELATIVE chapter weights used for paper assembly. Where they come from the repo JSON
// (Physics / Chemistry unit "marks") `source` is 'repo'; otherwise 'embedded' and verified:false.
import { bi } from './util.js';

const C = (rows) => rows.map(([en, hi, w], i) => ({ id: 'ch' + (i + 1), no: i + 1, name: bi(en, hi), weight: w }));

export const SUBJECTS = {
  physics: { code: '042', name: bi('Physics', 'भौतिक विज्ञान'), numeric: true },
  chemistry: { code: '043', name: bi('Chemistry', 'रसायन विज्ञान'), numeric: true },
  accountancy: { code: '055', name: bi('Accountancy', 'लेखाशास्त्र'), numeric: true },
  business: { code: '054', name: bi('Business Studies', 'व्यावसायिक अध्ययन'), numeric: false },
  economics: { code: '030', name: bi('Economics', 'अर्थशास्त्र'), numeric: true },
  maths: { code: '041', name: bi('Mathematics', 'गणित'), numeric: true },
  hindi: { code: '002/302', name: bi('Hindi', 'हिन्दी'), numeric: false, structureOnly: true },
  english: { code: '301', name: bi('English', 'अंग्रेज़ी'), numeric: false, structureOnly: true },
};

export const ALIASES = {
  physics: ['physics', 'phy', 'भौतिकी', 'भौतिक विज्ञान', 'फिजिक्स', 'फिज़िक्स'],
  chemistry: ['chemistry', 'chem', 'रसायन', 'रसायन विज्ञान', 'केमिस्ट्री'],
  accountancy: ['accountancy', 'accounts', 'accounting', 'लेखाशास्त्र', 'लेखा', 'अकाउंटेंसी', 'अकाउंट्स'],
  business: ['business studies', 'business', 'bst', 'व्यावसायिक अध्ययन', 'बिज़नेस स्टडीज', 'बिजनेस स्टडीज', 'बिज़नेस'],
  economics: ['economics', 'eco', 'अर्थशास्त्र', 'इकोनॉमिक्स'],
  maths: ['mathematics', 'maths', 'math', 'गणित', 'मैथ्स'],
  hindi: ['hindi', 'हिन्दी', 'हिंदी'],
  english: ['english', 'अंग्रेज़ी', 'अंग्रेजी', 'इंग्लिश'],
};

export const CLASSES = ['X', 'XI', 'XII'];

const CHAPTERS = {
  'physics-XI': C([
    ['Units and Measurements', 'मात्रक एवं मापन', 23], ['Motion in a Straight Line', 'सरल रेखा में गति', 12], ['Motion in a Plane', 'समतल में गति', 12],
    ['Laws of Motion', 'गति के नियम', 23], ['Work, Energy and Power', 'कार्य, ऊर्जा और शक्ति', 17], ['System of Particles and Rotational Motion', 'कणों के निकाय तथा घूर्णी गति', 17],
    ['Gravitation', 'गुरुत्वाकर्षण', 17], ['Mechanical Properties of Solids', 'ठोसों के यांत्रिक गुण', 7], ['Mechanical Properties of Fluids', 'तरलों के यांत्रिक गुण', 7],
    ['Thermal Properties of Matter', 'द्रव्य के तापीय गुण', 6], ['Thermodynamics', 'ऊष्मागतिकी', 20], ['Kinetic Theory', 'अणुगति सिद्धांत', 20],
    ['Oscillations', 'दोलन', 5], ['Waves', 'तरंगें', 5]]),
  'physics-XII': C([
    ['Electric Charges and Fields', 'विद्युत आवेश तथा क्षेत्र', 8], ['Electrostatic Potential and Capacitance', 'स्थिरवैद्युत विभव तथा धारिता', 8], ['Current Electricity', 'विद्युत धारा', 16],
    ['Moving Charges and Magnetism', 'गतिमान आवेश और चुंबकत्व', 9], ['Magnetism and Matter', 'चुंबकत्व एवं द्रव्य', 8], ['Electromagnetic Induction', 'वैद्युतचुंबकीय प्रेरण', 9],
    ['Alternating Current', 'प्रत्यावर्ती धारा', 8], ['Electromagnetic Waves', 'वैद्युतचुंबकीय तरंगें', 18], ['Ray Optics and Optical Instruments', 'किरण प्रकाशिकी एवं प्रकाशिक यंत्र', 9],
    ['Wave Optics', 'तरंग प्रकाशिकी', 9], ['Dual Nature of Radiation and Matter', 'विकिरण तथा द्रव्य की द्वैत प्रकृति', 12], ['Atoms', 'परमाणु', 6],
    ['Nuclei', 'नाभिक', 6], ['Semiconductor Electronics', 'अर्धचालक इलेक्ट्रॉनिकी', 7]]),
  'chemistry-XI': C([
    ['Some Basic Concepts of Chemistry', 'रसायन विज्ञान की कुछ मूल अवधारणाएँ', 7], ['Structure of Atom', 'परमाणु की संरचना', 9], ['Classification of Elements and Periodicity in Properties', 'तत्वों का वर्गीकरण एवं गुणधर्मों में आवर्तिता', 6],
    ['Chemical Bonding and Molecular Structure', 'रासायनिक आबंधन तथा आण्विक संरचना', 7], ['Chemical Thermodynamics', 'रासायनिक ऊष्मगतिकी', 9], ['Equilibrium', 'साम्यावस्था', 7],
    ['Redox Reactions', 'अपचयोपचय अभिक्रियाएँ', 4], ['Organic Chemistry: Some Basic Principles and Techniques', 'कार्बनिक रसायन: कुछ आधारभूत सिद्धांत तथा तकनीकें', 11], ['Hydrocarbons', 'हाइड्रोकार्बन', 10]]),
  'chemistry-XII': C([
    ['Solutions', 'विलयन', 7], ['Electrochemistry', 'वैद्युतरसायन', 9], ['Chemical Kinetics', 'रासायनिक बलगतिकी', 7], ['d- and f-Block Elements', 'd- एवं f- ब्लॉक के तत्व', 7],
    ['Coordination Compounds', 'उपसहसंयोजन यौगिक', 7], ['Haloalkanes and Haloarenes', 'हैलोऐल्केन तथा हैलोऐरीन', 6], ['Alcohols, Phenols and Ethers', 'ऐल्कोहॉल, फीनॉल एवं ईथर', 6],
    ['Aldehydes, Ketones and Carboxylic Acids', 'ऐल्डिहाइड, कीटोन एवं कार्बोक्सिलिक अम्ल', 8], ['Amines', 'ऐमीन', 6], ['Biomolecules', 'जैव-अणु', 7]]),
  'accountancy-XI': C([
    ['Introduction to Accounting', 'लेखांकन का परिचय', 6], ['Theory Base of Accounting', 'लेखांकन का सैद्धांतिक आधार', 8], ['Recording of Transactions - I', 'लेन-देनों का अभिलेखन - I', 14],
    ['Recording of Transactions - II', 'लेन-देनों का अभिलेखन - II', 14], ['Bank Reconciliation Statement', 'बैंक समाधान विवरण', 6], ['Trial Balance and Rectification of Errors', 'तलपट एवं त्रुटियों का सुधार', 10],
    ['Depreciation, Provisions and Reserves', 'ह्रास, प्रावधान तथा संचय', 10], ['Bills of Exchange', 'विनिमय बिल', 6], ['Financial Statements', 'वित्तीय विवरण', 14], ['Accounts from Incomplete Records', 'अपूर्ण अभिलेखों से लेखे', 12]]),
  'accountancy-XII': C([
    ['Accounting for Not-for-Profit Organisations', 'अलाभकारी संगठनों के लिए लेखांकन', 10], ['Accounting for Partnership Firms - Fundamentals', 'साझेदारी फर्म का लेखांकन - मूलभूत', 8],
    ['Change in Profit-Sharing Ratio among the Existing Partners', 'विद्यमान साझेदारों के लाभ-विभाजन अनुपात में परिवर्तन', 6], ['Admission of a Partner', 'साझेदार का प्रवेश', 8], ['Retirement / Death of a Partner', 'साझेदार की सेवानिवृत्ति / मृत्यु', 8],
    ['Dissolution of a Partnership Firm', 'साझेदारी फर्म का विघटन', 8], ['Accounting for Share Capital', 'अंश पूँजी के लिए लेखांकन', 12], ['Issue and Redemption of Debentures', 'ऋणपत्रों का निर्गमन एवं मोचन', 6],
    ['Financial Statements of a Company', 'कंपनी के वित्तीय विवरण', 6], ['Analysis of Financial Statements', 'वित्तीय विवरणों का विश्लेषण', 6], ['Accounting Ratios', 'लेखांकन अनुपात', 10], ['Cash Flow Statement', 'रोकड़ प्रवाह विवरण', 12]]),
  'business-XI': C([
    ['Business, Trade and Commerce', 'व्यवसाय, व्यापार और वाणिज्य', 8], ['Forms of Business Organisation', 'व्यावसायिक संगठन के स्वरूप', 12], ['Private, Public and Global Enterprises', 'निजी, सार्वजनिक एवं वैश्विक उपक्रम', 8],
    ['Business Services', 'व्यावसायिक सेवाएँ', 9], ['Emerging Modes of Business', 'व्यवसाय के उदीयमान स्वरूप', 6], ['Social Responsibilities of Business and Business Ethics', 'व्यवसाय की सामाजिक ज़िम्मेदारियाँ तथा व्यावसायिक नैतिकता', 6],
    ['Formation of a Company', 'कंपनी का निर्माण', 8], ['Sources of Business Finance', 'व्यावसायिक वित्त के स्रोत', 12], ['Small Business and Entrepreneurship', 'लघु व्यवसाय एवं उद्यमिता', 8], ['Internal Trade', 'आंतरिक व्यापार', 10], ['International Business', 'अंतर्राष्ट्रीय व्यापार', 8]]),
  'business-XII': C([
    ['Nature and Significance of Management', 'प्रबंध की प्रकृति एवं महत्व', 8], ['Principles of Management', 'प्रबंध के सिद्धांत', 10], ['Business Environment', 'व्यावसायिक पर्यावरण', 6],
    ['Planning', 'नियोजन', 6], ['Organising', 'संगठन', 10], ['Staffing', 'नियुक्तिकरण', 8], ['Directing', 'निर्देशन', 10], ['Controlling', 'नियंत्रण', 6],
    ['Financial Management', 'वित्तीय प्रबंध', 8], ['Financial Markets', 'वित्तीय बाज़ार', 8], ['Marketing Management', 'विपणन प्रबंध', 12], ['Consumer Protection', 'उपभोक्ता संरक्षण', 8]]),
  'economics-XI': C([
    ['Introduction to Microeconomics', 'सूक्ष्म अर्थशास्त्र का परिचय', 6], ['Consumer\'s Equilibrium and Demand', 'उपभोक्ता का संतुलन तथा माँग', 14], ['Producer Behaviour and Supply', 'उत्पादक का व्यवहार तथा पूर्ति', 14],
    ['Forms of Market and Price Determination', 'बाज़ार के रूप तथा कीमत निर्धारण', 12], ['Introduction to Statistics in Economics', 'अर्थशास्त्र में सांख्यिकी का परिचय', 6], ['Collection, Organisation and Presentation of Data', 'आँकड़ों का संग्रह, संगठन एवं प्रस्तुतीकरण', 10],
    ['Statistical Tools and Interpretation', 'सांख्यिकीय उपकरण तथा निर्वचन', 24]]),
  'economics-XII': C([
    ['Introduction to Macroeconomics', 'समष्टि अर्थशास्त्र का परिचय', 3], ['National Income and Related Aggregates', 'राष्ट्रीय आय एवं संबंधित समाहार', 12], ['Money and Banking', 'मुद्रा और बैंकिंग', 8],
    ['Determination of Income and Employment', 'आय और रोज़गार का निर्धारण', 10], ['Government Budget and the Economy', 'सरकारी बजट एवं अर्थव्यवस्था', 8], ['Balance of Payments', 'भुगतान संतुलन', 6],
    ['Indian Economy on the Eve of Independence', 'स्वतंत्रता की पूर्व संध्या पर भारतीय अर्थव्यवस्था', 5], ['Indian Economy 1950-1990', 'भारतीय अर्थव्यवस्था 1950-1990', 8], ['Economic Reforms since 1991', '1991 से आर्थिक सुधार', 8],
    ['Poverty and Human Capital Formation', 'निर्धनता तथा मानव पूँजी निर्माण', 8], ['Rural Development and Employment', 'ग्रामीण विकास और रोज़गार', 6], ['Environment and Sustainable Development', 'पर्यावरण तथा सतत् विकास', 6]]),
  'maths-X': C([
    ['Real Numbers', 'वास्तविक संख्याएँ', 6], ['Polynomials', 'बहुपद', 6], ['Pair of Linear Equations in Two Variables', 'दो चर वाले रैखिक समीकरण युग्म', 7], ['Quadratic Equations', 'द्विघात समीकरण', 7],
    ['Arithmetic Progressions', 'समांतर श्रेढ़ी', 6], ['Triangles', 'त्रिभुज', 7], ['Coordinate Geometry', 'निर्देशांक ज्यामिति', 6], ['Introduction to Trigonometry', 'त्रिकोणमिति का परिचय', 7],
    ['Some Applications of Trigonometry', 'त्रिकोणमिति के कुछ अनुप्रयोग', 6], ['Circles', 'वृत्त', 6], ['Areas Related to Circles', 'वृत्तों से संबंधित क्षेत्रफल', 6], ['Surface Areas and Volumes', 'पृष्ठीय क्षेत्रफल एवं आयतन', 7],
    ['Statistics', 'सांख्यिकी', 7], ['Probability', 'प्रायिकता', 6]]),
  'maths-XI': C([
    ['Sets', 'समुच्चय', 4], ['Relations and Functions', 'संबंध एवं फलन', 6], ['Trigonometric Functions', 'त्रिकोणमितीय फलन', 8], ['Complex Numbers and Quadratic Equations', 'सम्मिश्र संख्याएँ और द्विघात समीकरण', 6],
    ['Linear Inequalities', 'रैखिक असमिकाएँ', 4], ['Permutations and Combinations', 'क्रमचय और संचय', 6], ['Binomial Theorem', 'द्विपद प्रमेय', 6], ['Sequences and Series', 'अनुक्रम तथा श्रेणी', 8],
    ['Straight Lines', 'सरल रेखाएँ', 8], ['Conic Sections', 'शंकु परिच्छेद', 8], ['Introduction to Three Dimensional Geometry', 'त्रिविमीय ज्यामिति का परिचय', 4], ['Limits and Derivatives', 'सीमा और अवकलज', 10],
    ['Statistics', 'सांख्यिकी', 6], ['Probability', 'प्रायिकता', 6]]),
  'maths-XII': C([
    ['Relations and Functions', 'संबंध एवं फलन', 5], ['Inverse Trigonometric Functions', 'प्रतिलोम त्रिकोणमितीय फलन', 4], ['Matrices', 'आव्यूह', 5], ['Determinants', 'सारणिक', 6],
    ['Continuity and Differentiability', 'सांतत्य तथा अवकलनीयता', 7], ['Application of Derivatives', 'अवकलज के अनुप्रयोग', 7], ['Integrals', 'समाकलन', 9], ['Application of Integrals', 'समाकलनों के अनुप्रयोग', 5],
    ['Differential Equations', 'अवकल समीकरण', 6], ['Vector Algebra', 'सदिश बीजगणित', 6], ['Three Dimensional Geometry', 'त्रिविमीय ज्यामिति', 6], ['Linear Programming', 'रैखिक प्रोग्रामन', 6], ['Probability', 'प्रायिकता', 8]]),
};

// Structure-only subjects: chapters are skill areas, not weighted content.
CHAPTERS['hindi-XII'] = C([['Reading (Unseen Passages)', 'अपठित बोध', 20], ['Writing Skills', 'रचनात्मक लेखन', 20], ['Literature (Aroh / Vitan)', 'पाठ्यपुस्तक (आरोह / वितान)', 40]]);
CHAPTERS['english-XII'] = C([['Reading Comprehension', 'पठन कौशल', 20], ['Writing Skills', 'लेखन कौशल', 20], ['Literature (Flamingo / Vistas)', 'साहित्य (Flamingo / Vistas)', 40]]);
CHAPTERS['hindi-XI'] = CHAPTERS['hindi-XII'];
CHAPTERS['english-XI'] = CHAPTERS['english-XII'];

let curriculum = null;
let curriculumSource = null;

/** Inject curriculum JSON (the repo file) manually. */
export function setCurriculum(json, source = 'injected') { curriculum = json; curriculumSource = source; }

/** Try loading the repo curriculum JSON (browser fetch or Node fs). Never throws. */
export async function loadCurriculum() {
  if (curriculum) return curriculum;
  try {
    const url = new URL('../../../data/curriculum/cbse-2026-27.json', import.meta.url);
    if (url.protocol === 'file:') {
      const fs = await import(/* @vite-ignore */ 'node:fs/promises');
      const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url');
      curriculum = JSON.parse(await fs.readFile(fileURLToPath(url), 'utf8'));
    } else if (typeof fetch === 'function') {
      const res = await fetch(url);
      if (res.ok) curriculum = await res.json();
    }
    if (curriculum) curriculumSource = 'repo:data/curriculum/cbse-2026-27.json';
  } catch { /* embedded fallback */ }
  return curriculum;
}

export function normaliseSubject(s) {
  const t = String(s || '').toLowerCase().trim();
  for (const [k, list] of Object.entries(ALIASES)) if (list.some((a) => t === a || t.includes(a))) return k;
  return SUBJECTS[t] ? t : null;
}
export function normaliseClass(c) {
  const t = String(c ?? '').toUpperCase().replace(/CLASS|कक्षा|TH|वीं|वी/g, '').trim();
  const map = { '10': 'X', X: 'X', '11': 'XI', XI: 'XI', '12': 'XII', XII: 'XII' };
  return map[t] || null;
}

/** Overlay repo unit marks onto embedded chapter weights. */
function overlay(subject, cls, chapters) {
  if (!curriculum) return { chapters, source: 'embedded' };
  const sub = curriculum.subjects?.find((s) => s.subject?.toLowerCase() === subject);
  const cl = sub?.classes?.find((c) => c.class === cls);
  if (!cl?.units) return { chapters, source: 'embedded' };
  const out = chapters.map((c) => ({ ...c }));
  let hit = false;
  if (subject === 'physics') {
    for (const u of cl.units) {
      const nos = (u.chapters || []).map((x) => +(/Chapter-(\d+)/.exec(x) || [])[1]).filter(Boolean);
      for (const n of nos) { const c = out.find((x) => x.no === n); if (c) { c.weight = +(u.marks / nos.length).toFixed(2); c.unit = u.title; hit = true; } }
    }
  } else if (subject === 'chemistry') {
    for (const u of cl.units) { const c = out.find((x) => x.no === +u.unit); if (c) { c.weight = u.marks; c.unit = u.title; hit = true; } }
  }
  return { chapters: out, source: hit ? 'repo' : 'embedded' };
}

/**
 * Syllabus for a subject/class.
 * @returns {{subject:string,code:string,cls:string,name:{en:string,hi:string},chapters:object[],source:string,verified:boolean,books?:string[],practical?:object}|null}
 */
export function getSyllabus(subject, cls) {
  const s = normaliseSubject(subject), c = normaliseClass(cls);
  if (!s || !c) return null;
  const base = CHAPTERS[`${s}-${c}`];
  if (!base) return null;
  const { chapters, source } = overlay(s, c, base);
  const out = {
    subject: s, code: SUBJECTS[s].code, cls: c, name: SUBJECTS[s].name, chapters, source,
    verified: source === 'repo', structureOnly: !!SUBJECTS[s].structureOnly,
    note: source === 'repo'
      ? `Chapter weights from ${curriculumSource} (unit marks distributed over chapters).`
      : 'Chapter list and weights are embedded defaults; verified:false - confirm against the latest CBSE curriculum.',
  };
  const sub = curriculum?.subjects?.find((x) => x.subject?.toLowerCase() === s);
  const cl = sub?.classes?.find((x) => x.class === c);
  if (cl) { out.practical = { marks: cl.practicalMarks, hours: cl.practicalDurationHours, scheme: cl.evaluationScheme }; out.books = sub.prescribedBooks; }
  return out;
}

export function listSubjects() {
  return Object.keys(SUBJECTS).map((k) => ({ key: k, code: SUBJECTS[k].code, name: SUBJECTS[k].name, classes: CLASSES.filter((c) => CHAPTERS[`${k}-${c}`]) }));
}

export function findChapter(syl, ref) {
  if (!syl || ref == null) return null;
  const s = String(ref).trim();
  const m = /^(?:ch(?:apter)?[\s-]*)?(\d+)$/i.exec(s) || /(?:अध्याय|chapter|ch|unit)\s*(\d+)/i.exec(s);
  if (m) return syl.chapters.find((c) => c.no === +m[1]) || null;
  const t = s.toLowerCase();
  return syl.chapters.find((c) => c.name.en.toLowerCase().includes(t) || c.name.hi.includes(s)) || null;
}
