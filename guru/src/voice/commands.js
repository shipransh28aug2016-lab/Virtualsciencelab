// Voice/text UI command parser: bilingual + Hinglish regex tables. DOM-free.
// parseCommand(text, lang) -> {intent, args} | null. Commands are short; long utterances are never commands.

const MAX_TOKENS = 9;

/** Normalise an utterance: NFC, lowercase, drop nukta/chandrabindu variance, punctuation, politeness words. */
export function normalize(text) {
  let s = String(text ?? '').normalize('NFC').toLowerCase();
  s = s.replace(/़/g, '').replace(/ँ/g, 'ं'); // nukta off, chandrabindu -> anusvara
  s = s.replace(/[.,!?;:"'“”‘’()\[\]{}।॥\-_/\\|*~`]+/g, ' ');
  s = s.replace(/\b(?:please|pls|kindly|guru ?ji|guru|hey|ok|okay|zara|jara|na|toh|to)\b/g, ' ');
  s = s.replace(/(?:^|\s)(?:कृपया|कृप्या|गुरु ?जी|गुरुजी|गुरु|जी|ज़रा|जरा|ज़रा|अब|ना|तो|ओके|हे)(?=\s|$)/gu, ' ');
  s = s.replace(/(?:^|\s)(?:kripya|ab)(?=\s|$)/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Build a regex that matches an alternation as whole words (JS \b does not understand Devanagari). */
const W = (alt) => new RegExp(`(?:^|\\s)(?:${alt})(?=\\s|$)`, 'u');
const SETTINGS = 'settings?|setting|सेटिंग्स?|सेटिंग|सैटिंग्स?|सैटिंग|सेट्टिंग';
const MEMORY = 'memory|memories|मेमोरी|याददाश्त|यादें|याद';
const CLOSE_V = 'close|hide|dismiss|exit|band|bnd|बंद|हटाओ|हटा दो|छिपाओ|बंद करो|बंद कर दो';
const OPEN_V = 'open|show|display|go to|kholo|khol do|khol|dikhao|dikha do|खोलो|खोल दो|खोलिए|खोलिये|दिखाओ|दिखा दो|दिखाइए';

const LANG_WORDS = {
  en: ['english', 'angrezi', 'angreji', 'inglish', 'इंग्लिश', 'अंग्रेजी', 'अंग्रेज़ी', 'अँग्रेजी', 'अंग्रेज', 'अंग्रेजी'],
  hi: ['hindi', 'hindee', 'हिंदी', 'हिन्दी', 'हिंदि'],
  hinglish: ['hinglish', 'हिंग्लिश', 'हिंगलिश', 'mix', 'mixed', 'मिक्स'],
};
const LANG_FILLER = new Set(('switch change set talk speak reply respond answer use language to in with only now me mein main mai bolo bolna boliye bolie bolo ' +
  'baat karo kijiye kare karein badlo badal do dijiye jawab bhasha likho likhna in the my है ही में मैं बोलो बोलिए बोलिये बोलना बात करो करें कीजिए कीजिये बदलो बदल दो दीजिए जवाब भाषा सिर्फ़ सिर्फ लिखो लिखना से se').split(/\s+/));

function langCommand(norm) {
  const toks = norm.split(' ');
  let found = null;
  for (const t of toks) {
    for (const [code, words] of Object.entries(LANG_WORDS)) if (words.includes(t)) found = found || code;
  }
  if (!found) return null;
  const allWords = Object.values(LANG_WORDS).flat();
  if (!toks.every((t) => allWords.includes(t) || LANG_FILLER.has(t))) return null;
  return { intent: 'set_lang', args: { lang: found } };
}

/**
 * Ordered table of [intent, regex, argsFn?]. First match wins. Regexes run on normalised text.
 */
const TABLE = [
  ['stop', /^(?:stop|stop it|stop speaking|stop talking|stop reading|cancel|quiet|silence|shut up|enough|ruko|ruk jao|ruk ja|ruk|rukiye|chup|chup ho jao|chup raho|bas|bas karo|bas kijiye|thamo|tham jao|रुको|रुक जाओ|रुक जा|रुकिए|रुकिये|चुप|चुप हो जाओ|चुप रहो|बस|बस करो|बस कीजिए|थम जाओ|थमो|बंद करो बोलना|बोलना बंद करो|बोलना बंद|बोलना बंद कर दो)$/u],
  ['mic_off', new RegExp(`(?:^|\\s)(?:mic|microphone|माइक|मइक|माईक)\\s+(?:off|band|बंद|बंद करो|बंद कर दो|mute)(?=\\s|$)|(?:^|\\s)(?:stop listening|mute mic|sunna band karo|सुनना बंद करो|सुनना बंद)(?=\\s|$)`, 'u')],
  ['close', new RegExp(`^(?:(?:${SETTINGS}|${MEMORY}|panel|drawer|palette|पैनल|ड्रॉअर)\\s+)?(?:${CLOSE_V})(?:\\s+(?:${SETTINGS}|${MEMORY}|panel|drawer|palette|पैनल))?(?:\\s+(?:karo|kar do|kijiye|करो|कर दो|कीजिए))?$`, 'u'), (m, n) => ({ target: new RegExp(`(${MEMORY})`, 'u').test(n) ? 'memory' : /(?:^|\s)(?:palette)(?=\s|$)/.test(n) ? 'palette' : 'settings' })],
  ['open_memory', new RegExp(`^(?:(?:${OPEN_V})\\s+)?(?:my\\s+|meri\\s+|मेरी\\s+)?(?:${MEMORY})(?:\\s+(?:${OPEN_V}|panel|dikhao|kholo))?(?:\\s+(?:karo|kar do|kijiye|करो|कर दो|कीजिए))?$`, 'u')],
  ['open_settings', new RegExp(`^(?:(?:${OPEN_V})\\s+)?(?:${SETTINGS})(?:\\s+(?:${OPEN_V}|panel))?(?:\\s+(?:karo|kar do|kijiye|करो|कर दो|कीजिए))?$|^(?:go to|jao|जाओ|चलो)\\s+(?:${SETTINGS})$`, 'u')],
  ['theme', /^(?:(?:switch to|turn on|enable|set|use)\s+)?(?:(dark|night|अंधेरा|डार्क|गहरा|गहरी|काली|light|day|bright|लाइट|उजाला|हल्की|हल्का|सफेद)\s*(?:mode|theme|मोड|थीम)?)(?:\s+(?:on|karo|kar do|kijiye|chalu karo|on karo|करो|कर दो|कीजिए|चालू करो|चालू))?$/u,
    (m) => ({ theme: /^(?:dark|night|अंधेरा|डार्क|गहरा|गहरी|काली)/u.test(m[1]) ? 'dark' : 'light' })],
  ['new_chat', /^(?:(?:start|begin|open|create|make|shuru karo|shuru|शुरू करो)\s+)?(?:(?:a\s+)?new\s+(?:chat|conversation|thread|session)|naya chat|nayi chat|naya conversation|nayi baatcheet|naya baatcheet|chat naya|clear chat|chat clear|chat saaf|start over|reset chat|नया चैट|नई चैट|नयी चैट|नई बातचीत|नयी बातचीत|नया बातचीत|चैट साफ़ करो|चैट साफ करो|चैट क्लियर करो|चैट क्लियर|फिर से शुरू करो|दोबारा शुरू करो|फिर से शुरू)(?:\s+(?:karo|kar do|kijiye|shuru karo|करो|कर दो|कीजिए|शुरू करो))?$/u],
  ['read_aloud', /^(?:(?:read|say)\s+(?:it\s+|this\s+|that\s+|the\s+(?:answer|reply|response)\s+)?(?:out\s+)?(?:loud|aloud|out)|read(?:\s+(?:it|this|that|the answer|the reply|the response))?\s*(?:out loud|aloud)?|read to me|speak (?:it|this)|padh(?:o|kar sunao|\s?kar sunao|ke sunao| ke sunao)|padho|padh kar sunao|padhkar sunao|bol kar sunao|bolkar sunao|bolke sunao|sunao|mujhe sunao|jor se padho|zor se padho|(?:yeh|ye|ise|isko) padho|(?:yeh|ye|ise|isko) padh kar sunao|पढ\s?कर सुनाओ|पढ\s?कर सुनाइए|पढ़कर सुनाइये|पढ़ो|पढ|पढ़ दो|ज़ोर से पढ़ो|जोर से पढ़ो|यह पढ़ो|इसे पढ़ो|इसे पढ़कर सुनाओ|बोलकर सुनाओ|बोल कर सुनाओ|सुनाओ|मुझे सुनाओ|सुना दो|उत्तर पढ़ो|जवाब पढ़ो|जवाब सुनाओ|उत्तर सुनाओ)$/u],
  ['upload', /^(?:(?:file|photo|image|document|pdf|फाइल|फ़ाइल|फोटो|दस्तावेज़|दस्तावेज)\s+)?(?:upload|attach|add file|add a file|attach file|attach a file|upload file|upload a file|pick file|choose file|select file|file upload|file add|file jodo|file chuno|file bhejo|अपलोड|अटैच|जोड़ो|जोडो|चुनो|भेजो)(?:\s+(?:file|a file|photo|image|document|pdf|फाइल|फोटो))?(?:\s+(?:karo|kar do|kijiye|करो|कर दो|कीजिए|कीजिये))?$|^(?:फाइल|फोटो|file|photo)\s+(?:जोड़ो|जोडो|चुनो|भेजो|jodo|chuno|bhejo|attach karo|upload karo|अपलोड करो|अटैच करो)$|^(?:फाइल|फोटो|file|photo)\s+(?:अपलोड|attach)\s+(?:करो|karo)$/u],
  ['palette', /^(?:command palette|commands|command list|show commands|open commands|कमांड पैलेट|कमांड|कमांड्स?|कमांड सूची|कमांड दिखाओ|कमांड खोलो)$/u],
  ['repeat', /^(?:repeat|say again|say that again|repeat that|again|phir se bolo|phir bolo|dobara bolo|dubara bolo|ek baar aur|फिर से बोलो|दोबारा बोलो|दुबारा बोलो|फिर बोलो|एक बार और|फिर से सुनाओ)$/u],
  ['send', /^(?:send|send it|send message|submit|bhejo|bhej do|bhejiye|भेजो|भेज दो|भेजिए|भेजिये|सेंड|सेंड करो)$/u],
  ['help', /^(?:help|help me|what can you do|commands help|madad|madad karo|help karo|मदद|मदद करो|सहायता|हेल्प|तुम क्या कर सकते हो|आप क्या कर सकते हैं)$/u],
];

// Patterns are matched against nukta-free text, so strip nukta from the tables too.
for (const row of TABLE) row[1] = new RegExp(row[1].source.replace(/\u093C/g, ''), row[1].flags);

/**
 * Parse a UI command from a short utterance.
 * @param {string} text raw utterance (Devanagari, Latin or Hinglish)
 * @param {string} [lang] hint ('hi'|'en'|'hinglish'); currently all tables are tried regardless
 * @returns {{intent:string,args:Object}|null}
 */
export function parseCommand(text, lang) { // eslint-disable-line no-unused-vars
  const norm = normalize(text);
  if (!norm) return null;
  if (norm.split(' ').length > MAX_TOKENS) return null;
  const lc = langCommand(norm);
  for (const [intent, re, argsFn] of TABLE) {
    const m = re.exec(norm);
    if (!m) continue;
    if (intent === 'stop' && lc) continue;
    return { intent, args: argsFn ? argsFn(m, norm) : {} };
  }
  return lc;
}

/** Intents this parser can return (for docs / UI wiring). */
export const COMMAND_INTENTS = ['stop', 'mic_off', 'close', 'open_memory', 'open_settings', 'theme', 'new_chat', 'read_aloud', 'upload', 'palette', 'repeat', 'send', 'help', 'set_lang'];

export default parseCommand;
