import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, scriptStats } from '../src/i18n/detect.js';
import { translit, numerals } from '../src/i18n/translit.js';
import { strings, KEYS } from '../src/i18n/strings.js';
import { createI18n, register as regI18n } from '../src/i18n/index.js';
import { parseCommand } from '../src/voice/commands.js';
import { stripMarkdown, normalizeForSpeech, chunkText, chunkLang, pickVoice, createTTS } from '../src/voice/tts.js';
import { listen, shouldRetry, pickBest } from '../src/voice/stt.js';
import { matchWake } from '../src/voice/wake.js';
import { register as regVoice } from '../src/voice/index.js';

// ---------- strings ----------
test('strings: >=120 keys, en/hi parity, hindi really Devanagari', () => {
  assert.ok(KEYS.length >= 120, `only ${KEYS.length}`);
  assert.deepEqual(Object.keys(strings.en).sort(), Object.keys(strings.hi).sort());
  for (const k of KEYS) {
    assert.ok(strings.en[k] && strings.hi[k], k);
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(strings.en[k]), ph(strings.hi[k]), `placeholders differ: ${k}`);
  }
  const devKeys = KEYS.filter((k) => /[ऀ-ॿ]/.test(strings.hi[k]));
  assert.ok(devKeys.length > KEYS.length * 0.9);
  for (const g of ['app.', 'topbar.', 'composer.', 'settings.', 'status.', 'error.', 'onboarding.', 'artifact.', 'memory.', 'connectors.', 'confirm.']) {
    assert.ok(KEYS.some((k) => k.startsWith(g)), g);
  }
});

// ---------- detect ----------
test('detect: hi / en / hinglish', () => {
  assert.equal(detect('कक्षा 12 भौतिकी का प्रश्न पत्र बनाओ'), 'hi');
  assert.equal(detect('Make a physics question paper for class 12'), 'en');
  assert.equal(detect('mujhe class 12 ka paper banao'), 'hinglish');
  assert.equal(detect('kya hai ye'), 'hinglish');
  assert.equal(detect('CBSE का पेपर बनाओ'), 'hinglish');
  assert.equal(detect('hi there, how are you'), 'en');
  assert.equal(detect('12345 !!!'), 'en');
  assert.equal(detect(''), 'en');
  const s = scriptStats('अabc');
  assert.equal(s.deva, 1);
  assert.equal(s.latin, 3);
});

// ---------- numerals ----------
test('numerals both ways', () => {
  assert.equal(numerals('2026-27', 'deva'), '२०२६-२७');
  assert.equal(numerals('कक्षा १२ में ७० अंक', 'latn'), 'कक्षा 12 में 70 अंक');
  assert.equal(numerals(numerals('0123456789', 'deva'), 'latn'), '0123456789');
  assert.equal(numerals('abc', 'deva'), 'abc');
});

// ---------- translit ----------
test('translit latin -> deva', () => {
  assert.equal(translit('namaste', 'deva'), 'नमस्ते');
  assert.equal(translit('kya hai', 'deva'), 'क्या है');
  assert.equal(translit('kitaab', 'deva'), 'किताब');
  assert.equal(translit('shikshak', 'deva'), 'शिक्षक');
  assert.equal(translit('gyaan', 'deva'), 'ज्ञान');
  assert.equal(translit('bharat', 'deva'), 'भरत');
  assert.equal(translit('kaksha', 'deva'), 'कक्षा');
  assert.equal(translit('mantri', 'deva'), 'मंत्री');
  assert.equal(translit('pyaar', 'deva'), 'प्यार');
  assert.equal(translit('dhanyavaad', 'deva'), 'धन्यवाद');
  assert.equal(translit('Class 12', 'deva'), 'क्लास 12');
  assert.equal(translit('aap kaise hain?', 'deva'), 'आप कैसे हैं?');
});

test('translit deva -> latin', () => {
  assert.equal(translit('नमस्ते', 'latin'), 'namaste');
  assert.equal(translit('किताब', 'latin'), 'kitaab');
  assert.equal(translit('कमल', 'latin'), 'kamal');
  assert.equal(translit('समझना', 'latin'), 'samajhna');
  assert.equal(translit('क्या', 'latin'), 'kya');
  assert.equal(translit('ज्ञान', 'latin'), 'gyaan');
  assert.equal(translit('कक्षा', 'latin'), 'kaksha');
  assert.equal(translit('मेरा नाम गुरु है', 'latin'), 'mera naam guru hai');
  assert.equal(translit('हिंदी', 'latin'), 'hindee');
  assert.equal(translit('पुस्तक।', 'latin'), 'pustak.');
  assert.equal(translit('Hello 5', 'latin'), 'Hello 5');
});

test('translit: nukta letters and round trip of simple words', () => {
  assert.equal(translit('ज़रूर', 'latin'), 'zaroor');
  assert.equal(translit('फ़ोन', 'latin'), 'fon');
  for (const w of ['namaste', 'kitaab', 'kaksha', 'shikshak']) {
    assert.equal(translit(translit(w, 'deva'), 'latin').replace(/aa/g, 'a'), w.replace(/aa/g, 'a'));
  }
});

// ---------- commands ----------
test('parseCommand: Hindi', () => {
  const t = (s) => parseCommand(s, 'hi');
  assert.equal(t('सेटिंग खोलो').intent, 'open_settings');
  assert.equal(t('सेटिंग बंद करो').intent, 'close');
  assert.deepEqual(t('अंग्रेज़ी में बोलो'), { intent: 'set_lang', args: { lang: 'en' } });
  assert.deepEqual(t('हिंदी में बात करो'), { intent: 'set_lang', args: { lang: 'hi' } });
  assert.equal(t('नया चैट').intent, 'new_chat');
  assert.equal(t('पढ़कर सुनाओ').intent, 'read_aloud');
  assert.equal(t('पढ़ो').intent, 'read_aloud');
  assert.equal(t('रुको').intent, 'stop');
  assert.equal(t('फाइल अपलोड करो').intent, 'upload');
  assert.equal(t('फ़ाइल जोड़ो').intent, 'upload');
  assert.equal(t('मेमोरी दिखाओ').intent, 'open_memory');
  assert.deepEqual(t('डार्क मोड चालू करो'), { intent: 'theme', args: { theme: 'dark' } });
  assert.equal(t('गुरु जी सेटिंग खोलो').intent, 'open_settings');
});

test('parseCommand: English and Hinglish', () => {
  const t = (s) => parseCommand(s, 'en');
  assert.equal(t('stop').intent, 'stop');
  assert.equal(t('Open settings please').intent, 'open_settings');
  assert.equal(t('settings kholo').intent, 'open_settings');
  assert.equal(t('new chat').intent, 'new_chat');
  assert.equal(t('naya chat').intent, 'new_chat');
  assert.equal(t('read aloud').intent, 'read_aloud');
  assert.equal(t('padh kar sunao').intent, 'read_aloud');
  assert.equal(t('upload').intent, 'upload');
  assert.equal(t('file upload karo').intent, 'upload');
  assert.deepEqual(t('switch to english'), { intent: 'set_lang', args: { lang: 'en' } });
  assert.deepEqual(t('hindi mein baat karo'), { intent: 'set_lang', args: { lang: 'hi' } });
  assert.deepEqual(t('hinglish me bolo'), { intent: 'set_lang', args: { lang: 'hinglish' } });
  assert.deepEqual(t('light mode'), { intent: 'theme', args: { theme: 'light' } });
  assert.equal(t('mic off').intent, 'mic_off');
});

test('parseCommand: tasks are not commands', () => {
  assert.equal(parseCommand('हिंदी में पेपर बनाओ'), null);
  assert.equal(parseCommand('class 12 physics paper banao'), null);
  assert.equal(parseCommand('write a case study about the settings of a lab experiment today'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand(null), null);
});

// ---------- tts pure logic ----------
test('stripMarkdown', () => {
  const md = '# Title\n\n**Bold** and *italic* with `code`.\n\n- item one\n- item two\n\n[site](https://x.y/z) ![img](a.png)\n\n```js\nconsole.log(1)\n```\n| a | b |\n|---|---|\n| 1 | 2 |\n😀 done';
  const out = stripMarkdown(md);
  assert.ok(!/[#*`|\[\]]/.test(out), out);
  assert.ok(out.includes('Bold and italic with code'));
  assert.ok(out.includes('item one'));
  assert.ok(out.includes('site'));
  assert.ok(!out.includes('console.log'));
  assert.ok(!out.includes('😀'));
  assert.ok(out.includes('1, 2'));
  assert.ok(stripMarkdown('देखें https://example.com/x', 'hi').includes('लिंक'));
});

test('normalizeForSpeech: Devanagari numerals, currency, percent', () => {
  assert.equal(normalizeForSpeech('कक्षा १२ में ७५%', 'hi'), 'कक्षा 12 में 75 प्रतिशत');
  assert.equal(normalizeForSpeech('कीमत ₹१,५००', 'hi'), 'कीमत 1500 रुपये');
  assert.equal(normalizeForSpeech('Price Rs. 2,500', 'en'), 'Price 2500 rupees');
  assert.equal(normalizeForSpeech('marks 70-80', 'en'), 'marks 70 to 80');
  assert.equal(normalizeForSpeech('A & B', 'en'), 'A and B');
});

test('chunkText and chunkLang', () => {
  assert.deepEqual(chunkText(''), []);
  const long = Array.from({ length: 30 }, (_, i) => `यह वाक्य संख्या ${i} है।`).join(' ');
  const ch = chunkText(long, 100);
  assert.ok(ch.length > 3);
  assert.ok(ch.every((c) => c.length <= 100));
  assert.equal(ch.join(' ').replace(/\s+/g, ' '), long);
  const noPunct = 'word '.repeat(100).trim();
  const c2 = chunkText(noPunct, 60);
  assert.ok(c2.every((c) => c.length <= 60));
  assert.equal(c2.join(' '), noPunct);
  assert.equal(chunkLang('नमस्ते दोस्तों'), 'hi-IN');
  assert.equal(chunkLang('Hello friends'), 'en-IN');
});

test('pickVoice prefers exact, neural/google, falls back sensibly', () => {
  const voices = [
    { name: 'Basic', lang: 'en-US' },
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' },
    { name: 'Lekha', lang: 'hi-IN', localService: true },
    { name: 'Daniel', lang: 'en-GB' },
  ];
  assert.equal(pickVoice(voices, 'hi-IN').name, 'Google हिन्दी');
  assert.equal(pickVoice(voices, 'en-IN').name, voices[2].name);
  assert.equal(pickVoice(voices, 'hi-IN', 'Lekha').name, 'Lekha');
  assert.equal(pickVoice([{ name: 'Daniel', lang: 'en-GB' }, { name: 'X', lang: 'en_US' }], 'en-IN').name, 'Daniel');
  assert.equal(pickVoice([{ name: 'Daniel', lang: 'en-GB' }], 'hi-IN'), null);
  assert.equal(pickVoice([], 'hi-IN'), null);
});

function fakeSynth(voices = []) {
  const spoken = [];
  return {
    spoken, speaking: false,
    getVoices: () => voices,
    addEventListener() {}, removeEventListener() {},
    speak(u) { spoken.push(u); setTimeout(() => u.onend && u.onend(), 0); },
    cancel() {},
  };
}
class FakeUtterance { constructor(t) { this.text = t; } }

test('createTTS speaks chunks in order with right language', async () => {
  const synth = fakeSynth([{ name: 'Google हिन्दी', lang: 'hi-IN' }, { name: 'Google UK', lang: 'en-GB' }]);
  const tts = createTTS({ synth, Utterance: FakeUtterance });
  assert.ok(tts.supported());
  const r = await tts.speak('# शीर्षक\n\nकक्षा १२ के लिए **नोट्स**। Second sentence in English here.');
  assert.equal(r.cancelled, false);
  assert.ok(r.chunks >= 1);
  const all = synth.spoken.map((u) => u.text).join(' ');
  assert.ok(all.includes('कक्षा 12'));
  assert.ok(!all.includes('**'));
  assert.equal(synth.spoken[0].lang, 'hi-IN');
  const none = createTTS({ synth: null, Utterance: null });
  assert.equal(none.supported(), false);
  assert.equal((await none.speak('x')).unsupported, true);
});

test('createTTS cancel interrupts a queue', async () => {
  const synth = fakeSynth();
  synth.speak = function (u) { this.spoken.push(u); setTimeout(() => u.onend && u.onend(), 5); };
  const tts = createTTS({ synth, Utterance: FakeUtterance });
  const p = tts.speak('One. Two. Three. Four.'.repeat(30), {});
  setTimeout(() => tts.cancel(), 8);
  const r = await p;
  assert.equal(r.cancelled, true);
});

// ---------- stt ----------
test('shouldRetry / pickBest', () => {
  assert.equal(shouldRetry({ text: 'hello', confidence: 0.9 }), false);
  assert.equal(shouldRetry({ text: 'hello', confidence: 0.3 }), true);
  assert.equal(shouldRetry({ text: 'hello', confidence: 0 }), false);
  assert.equal(shouldRetry({ text: '  ', confidence: 0.9 }), true);
  const best = pickBest([{ text: 'a', lang: 'hi-IN', confidence: 0.3 }, { text: 'b', lang: 'en-IN', confidence: 0.8 }, { text: '', lang: 'en-IN', confidence: 1 }]);
  assert.equal(best.text, 'b');
  assert.equal(pickBest([]), null);
});

function makeFakeSR(script) {
  // script: array of {lang?, results:[{text,confidence}]} consumed per started recognizer
  const created = [];
  class SR {
    constructor() { created.push(this); this.step = script.shift() || { results: [] }; }
    start() {
      setTimeout(() => {
        for (const r of this.step.results) {
          const alt = { transcript: r.text, confidence: r.confidence };
          const res = [alt]; res.isFinal = r.final !== false;
          this.onresult && this.onresult({ resultIndex: 0, results: [res] });
        }
        this.onend && this.onend();
      }, 0);
    }
    stop() {}
  }
  SR.created = created;
  return SR;
}

test('stt auto: low confidence retries in the other language and picks best', async () => {
  const SR = makeFakeSR([
    { results: [{ text: 'hello kaisa', confidence: 0.2 }] },
    { results: [{ text: 'हेलो कैसा', confidence: 0.85 }] },
  ]);
  const retries = [];
  const finals = await new Promise((resolve) => {
    const out = [];
    listen({ SR, lang: 'auto', onRetry: (e) => retries.push(e), onFinal: (t, m) => out.push([t, m]), onEnd: () => resolve(out) });
  });
  assert.equal(SR.created.length, 2);
  assert.equal(SR.created[0].lang, 'hi-IN');
  assert.equal(SR.created[1].lang, 'en-IN');
  assert.deepEqual(retries, [{ from: 'hi-IN', to: 'en-IN' }]);
  assert.equal(finals.length, 1);
  assert.equal(finals[0][0], 'हेलो कैसा');
  assert.equal(finals[0][1].retried, true);
});

test('stt fixed language: no retry; unsupported reports error', async () => {
  const SR = makeFakeSR([{ results: [{ text: 'open settings', confidence: 0.2 }] }]);
  const finals = await new Promise((resolve) => {
    const out = [];
    listen({ SR, lang: 'en-IN', onFinal: (t) => out.push(t), onEnd: () => resolve(out) });
  });
  assert.deepEqual(finals, ['open settings']);
  assert.equal(SR.created.length, 1);
  const err = await new Promise((resolve) => listen({ SR: null, lang: 'hi-IN', onError: resolve }));
  assert.equal(err.code, 'unsupported');
});

// ---------- wake ----------
test('matchWake', () => {
  assert.deepEqual(matchWake('Hey Guru open settings'), { matched: true, rest: 'open settings' });
  assert.deepEqual(matchWake('गुरु जी नया चैट'), { matched: true, rest: 'नया चैट' });
  assert.deepEqual(matchWake('हे गुरु'), { matched: true, rest: '' });
  assert.deepEqual(matchWake('okay guru, stop'), { matched: true, rest: 'stop' });
  assert.equal(matchWake('open settings').matched, false);
  assert.equal(matchWake('the guruwhatever').matched, false);
});

// ---------- services ----------
function mockKernel() {
  const store = new Map();
  const events = [];
  const tools = new Map();
  const intents = [];
  const services = new Map();
  return {
    events, tools, intents, services,
    bus: { emit: (e, p) => events.push([e, p]), on() {}, once() {} },
    config: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
    tools_: null,
    tools_api: null,
    toolsApi: {},
    intentsApi: {},
    get toolsReg() { return tools; },
    // kernel-shaped API:
    api() {
      return {
        bus: this.bus, config: this.config,
        tools: { register: (t) => tools.set(t.name, t), call: (n, a) => tools.get(n).run(a, {}), list: () => [...tools.values()] },
        intents: { register: (i) => intents.push(i) },
        services: { set: (n, s) => services.set(n, s), get: (n) => services.get(n), has: (n) => services.has(n) },
        agents: { register() {} },
      };
    },
  };
}

test('i18n service: t, vars, lang, detect, apply', async () => {
  const mk = mockKernel();
  const k = mk.api();
  await regI18n(k);
  const i = k.services.get('i18n');
  assert.equal(i.lang(), 'en');
  assert.equal(i.t('settings.title'), 'Settings');
  assert.equal(i.t('memory.count', { n: 5 }), '5 items remembered');
  assert.equal(i.t('nope.key'), 'nope.key');
  assert.equal(i.setLang('hi'), 'hi');
  assert.equal(i.t('settings.title'), 'सेटिंग');
  assert.equal(i.t('memory.count', { n: 5 }), '5 बातें याद हैं');
  i.setNumerals('deva');
  assert.equal(i.t('memory.count', { n: 12 }), '१२ बातें याद हैं');
  assert.equal(mk.config.get('lang'), 'hi');
  assert.ok(mk.events.some(([e]) => e === 'lang:change'));
  i.setLang('hinglish');
  assert.equal(i.t('voice.listening'), 'Sun raha hoon…');
  assert.equal(i.t('settings.title'), 'Settings');
  assert.equal(i.setLang('xx'), 'hinglish');
  assert.equal(i.detect('mera naam guru hai'), 'hinglish');
  assert.equal(i.translit('namaste', 'deva'), 'नमस्ते');
  assert.equal(i.numerals('12', 'deva'), '१२');
  assert.ok(i.fonts.stack.includes('Noto Sans Devanagari'));

  // fake DOM
  const mkEl = (attrs) => ({ attrs: { ...attrs }, textContent: '', getAttribute(n) { return this.attrs[n] ?? null; }, setAttribute(n, v) { this.attrs[n] = v; } });
  const a = mkEl({ 'data-i18n': 'composer.send' });
  const b = mkEl({ 'data-i18n-placeholder': 'composer.placeholder' });
  const c = mkEl({ 'data-i18n': 'composer.attached', 'data-i18n-vars': '{"n":3}' });
  const html = mkEl({});
  const root = {
    documentElement: html,
    querySelectorAll: (sel) => ({ '[data-i18n]': [a, c], '[data-i18n-placeholder]': [b] }[sel] || []),
  };
  i.setLang('hi'); i.setNumerals('latn');
  assert.equal(i.apply(root), 3);
  assert.equal(a.textContent, 'भेजें');
  assert.equal(c.textContent, '3 फ़ाइल जुड़ी है');
  assert.ok(b.attrs.placeholder.includes('माइक'));
  assert.equal(html.attrs.lang, 'hi');
  assert.equal(i.apply(null), 0);
});

test('voice service: registers tool, handles unsupported env, command events', async () => {
  const mk = mockKernel();
  const k = mk.api();
  const voice = await regVoice(k);
  assert.ok(k.services.has('voice'));
  assert.deepEqual(voice.supported(), { stt: false, tts: false });
  assert.deepEqual(await k.tools.call('speak', { text: 'नमस्ते' }), { spoken: false, reason: 'unsupported' });
  assert.deepEqual(await k.tools.call('speak', { text: '  ' }), { spoken: false, reason: 'empty' });
  assert.equal(mk.intents[0].tool, 'speak');
  assert.deepEqual(mk.intents[0].extract('say hello world'), { text: 'hello world', lang: 'auto' });
  assert.deepEqual(voice.parseCommand('stop'), { intent: 'stop', args: {} });
  assert.equal(voice.wake(), false);

  // with injected engines
  const mk2 = mockKernel();
  const k2 = mk2.api();
  const { createVoice } = await import('../src/voice/index.js');
  const synth = fakeSynth([{ name: 'Google हिन्दी', lang: 'hi-IN' }]);
  const SR = makeFakeSR([{ results: [{ text: 'सेटिंग खोलो', confidence: 0.9 }] }]);
  const v2 = createVoice(k2, { synth, Utterance: FakeUtterance, SR });
  assert.deepEqual(v2.supported(), { stt: true, tts: true });
  const got = await new Promise((resolve) => {
    v2.listen({ lang: 'hi-IN', onFinal: (t, m) => resolve({ t, m }) });
  });
  assert.equal(got.m.command.intent, 'open_settings');
  assert.ok(mk2.events.some(([e, p]) => e === 'voice:command' && p.intent === 'open_settings'));
  assert.equal(mk2.config.get('voice.lastSttLang'), 'hi-IN');
  const r = await v2.speak('नमस्ते १२');
  assert.equal(r.cancelled, false);
  assert.equal(synth.spoken[0].text, 'नमस्ते 12.');
});
