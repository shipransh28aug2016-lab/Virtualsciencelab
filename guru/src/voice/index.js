// Voice module: registers service 'voice' and tool 'speak'.
import { listen as sttListen, sttSupported } from './stt.js';
import { createTTS } from './tts.js';
import { parseCommand } from './commands.js';
import { createWake, matchWake } from './wake.js';
import { detect } from '../i18n/detect.js';

/**
 * Build the voice service object (exported for tests / direct use).
 * @param {any} [k] kernel API (optional)
 * @param {{synth?:any, Utterance?:any, SR?:any}} [inject]
 */
export function createVoice(k, inject = {}) {
  const cfg = (key, def) => (k && k.config ? k.config.get(key, def) : def);
  const emit = (evt, payload) => { try { k && k.bus && k.bus.emit(evt, payload); } catch (_) { /* never break voice */ } };
  const tts = createTTS({ synth: inject.synth, Utterance: inject.Utterance, getRate: () => Number(cfg('voice.rate', 1)) || 1 });
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  let wakeCtl = null;

  const svc = {
    supported() { return { stt: !!(inject.SR || sttSupported(g)), tts: tts.supported() }; },

    listen(o = {}) {
      return sttListen({
        preferred: cfg('voice.lastSttLang', 'hi-IN'),
        SR: inject.SR,
        ...o,
        lang: o.lang || cfg('voice.inputLang', 'auto'),
        onInterim: (t) => { emit('voice:interim', { text: t }); if (o.onInterim) o.onInterim(t); },
        onFinal: (text, meta) => {
          if (k && k.config && meta && meta.confidence > 0) k.config.set('voice.lastSttLang', meta.lang);
          const command = parseCommand(text, detect(text));
          emit('voice:final', { text, ...meta, command });
          if (command) emit('voice:command', { ...command, text });
          if (o.onFinal) o.onFinal(text, { ...meta, command });
        },
        onRetry: (e) => { emit('voice:retry', e); if (o.onRetry) o.onRetry(e); },
        onError: (e) => { emit('voice:error', e); if (o.onError) o.onError(e); },
      });
    },

    speak(text, o = {}) { emit('voice:speak', { chars: String(text || '').length }); return tts.speak(text, o); },
    cancel() { tts.cancel(); },
    /** Toggle hands-free "Hey Guru". Returns the new state; call with no argument to read it. */
    wake(on) {
      if (!wakeCtl) {
        wakeCtl = createWake({
          listen: (o) => svc.listen(o),
          parse: (t) => parseCommand(t),
          onWake: (e) => { emit('voice:wake', e); if (e.command) emit('voice:command', { ...e.command, text: e.rest }); },
          onState: (s) => emit('voice:wake-state', { on: s }),
        });
      }
      if (on === undefined) return wakeCtl.active;
      if (on) wakeCtl.start(); else wakeCtl.stop();
      return wakeCtl.active;
    },
    parseCommand,
    matchWake,
  };
  return svc;
}

export async function register(k) {
  const voice = createVoice(k);
  k.services.set('voice', voice);

  k.tools.register({
    name: 'speak',
    description: 'Read text aloud to the user (Hindi or English). Markdown is stripped automatically.',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to speak' },
        lang: { type: 'string', enum: ['hi-IN', 'en-IN', 'auto'], description: 'Speech language; auto picks by script' },
        rate: { type: 'number', description: 'Speed multiplier 0.5-2' },
      },
      required: ['text'],
    },
    tags: ['voice'],
    run: async (args) => {
      const text = String((args && args.text) || '').trim();
      if (!text) return { spoken: false, reason: 'empty' };
      if (!voice.supported().tts) return { spoken: false, reason: 'unsupported' };
      const r = await voice.speak(text, { lang: args.lang, rate: args.rate });
      return { spoken: !r.cancelled, chunks: r.chunks, cancelled: !!r.cancelled };
    },
  });

  if (k.intents && k.intents.register) {
    k.intents.register({
      id: 'speak',
      tool: 'speak',
      patterns: [/^(?:say|speak|read out|read aloud)\s+(.{2,})$/i, /^(?:बोलो|बोलकर सुनाओ|कहो)\s+(.{2,})$/u, /^(?:bolo|keh do|kaho)\s+(.{2,})$/i],
      extract: (text) => {
        const m = /^(?:say|speak|read out|read aloud|बोलो|बोलकर सुनाओ|कहो|bolo|keh do|kaho)\s+(.+)$/iu.exec(String(text).trim());
        return { text: m ? m[1] : String(text), lang: 'auto' };
      },
      examples: ['say hello', 'बोलो नमस्ते', 'bolo namaste'],
    });
  }
  return voice;
}

export { parseCommand, matchWake, createTTS };
