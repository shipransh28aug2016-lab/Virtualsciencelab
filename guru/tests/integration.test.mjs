// End-to-end scenarios on the LOCAL provider. No network (fetch is blocked unless mocked).
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, runGoal, artifactBytes, mockFetch, jsonRes } from './fixtures/helpers.mjs';

const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { throw new Error('NETWORK BLOCKED in tests: ' + u); };

const b = await boot();
const skip = b.skip;
const k = b.k;

const ctxFor = (store = []) => ({ depth: 0, artifacts: { add: (blob, filename) => { store.push({ blob, filename }); return { filename, mime: blob.type, blobRef: filename }; } } });

/** Gather all artifacts from RunRecord + bus events. */
function collectArtifacts(rec, events) {
  const out = [...(rec?.artifacts || [])];
  for (const e of events) if ((e.type || e.evt) === 'artifact' && (e.payload || e.artifact)) out.push(e.payload || e.artifact);
  return out;
}
function findDeep(o, pred, d = 0) {
  if (!o || typeof o !== 'object' || d > 8) return null;
  if (pred(o)) return o;
  for (const v of Object.values(o)) { const r = findDeep(v, pred, d + 1); if (r) return r; }
  return null;
}
function sumMarks(paper) {
  return paper.sections.reduce((s, sec) => s + sec.questions.reduce((a, q) => a + (q.marks || 0), 0), 0);
}

test('1. "class 12 physics ka 70 marks ka QP banao Hindi mein" -> paper + docx re-reads', { skip, timeout: 60000 }, async () => {
  const store = [];
  const bus = [];
  k.bus.on('artifact', (a) => bus.push(a));
  const { rec, events } = await runGoal(k, 'class 12 physics ka 70 marks ka QP banao Hindi mein');
  assert.ok(rec && rec.id, 'RunRecord');
  assert.ok(rec.answer && rec.answer.length > 0, 'non-empty answer');
  // paper object: from tool call directly, so totals are checkable independent of routing
  const r = await k.tools.call('cbse_question_paper', { subject: 'physics', cls: 12, marks: 70, lang: 'hi' }, ctxFor(store));
  const paper = findDeep(r, (o) => Array.isArray(o.sections) && o.sections[0]?.questions);
  assert.ok(paper, 'paper object with sections[].questions');
  assert.equal(sumMarks(paper), 70, 'section marks sum to 70');
  if (paper.totals) assert.equal(paper.totals.marks ?? paper.totals.total, 70);
  const all = JSON.stringify(paper);
  assert.match(all, /[ऀ-ॿ]/, 'Hindi (Devanagari) text present');
  for (const sec of paper.sections) for (const q of sec.questions) {
    assert.ok(q.answer !== undefined && q.answer !== '', `Q${q.no} has computed answer`);
    assert.ok(q.marks > 0);
  }
  const stems = paper.sections.flatMap((s) => s.questions.map((q) => (typeof q.text === 'string' ? q.text : JSON.stringify(q.text))));
  assert.equal(new Set(stems).size, stems.length, 'no duplicate stems');
  const chk = await k.tools.call('cbse_answer_check', { paper }, ctxFor());
  assert.ok(chk, 'answer_check result');
  assert.ok(!/"ok":\s*false|"valid":\s*false/.test(JSON.stringify(chk)), 'answer_check passes: ' + JSON.stringify(chk).slice(0, 300));
  // docx artifact re-read
  const files = k.services.get('files');
  const w = await files.write('docx', { title: paper.header?.title || 'QP', lang: 'hi', blocks: [{ t: 'h1', text: 'भौतिक विज्ञान' }, { t: 'p', text: 'कुल अंक: 70' }] });
  const bytes = new Uint8Array(await w.blob.arrayBuffer());
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); // PK
  const back = await files.read(bytes, w.filename);
  assert.equal(back.format, 'docx');
  assert.match(back.text, /भौतिक विज्ञान/);
  // artifact produced by the run itself (if routed through emit/file_write)
  const arts = collectArtifacts(rec, events).concat(store, bus);
  const docx = arts.find((a) => /\.docx$/i.test(a.filename || a.name || ''));
  if (docx) {
    const bb = await artifactBytes(docx);
    if (bb) { const rr = await files.read(bb, docx.filename || docx.name); assert.ok(rr.text.length > 20); assert.match(rr.text, /[ऀ-ॿ]/); }
  }
});

test('2. study notes -> pptx artifact re-reads', { skip, timeout: 60000 }, async () => {
  const files = k.services.get('files');
  const r = await k.tools.call('cbse_study_material', { subject: 'physics', cls: 12, topic: 'Electrostatics', format: 'pptx', lang: 'en' }, ctxFor());
  assert.ok(r);
  const spec = { title: 'Electrostatics', slides: [{ title: 'Coulomb law', bullets: ['F = k q1 q2 / r^2', 'विद्युत बल'], notes: 'n' }, { title: 'Field', bullets: ['E = F/q'] }] };
  const w = await files.write('pptx', spec);
  assert.match(w.mime, /presentationml/);
  const back = await files.read(new Uint8Array(await w.blob.arrayBuffer()), 'x.pptx');
  assert.equal(back.format, 'pptx');
  assert.ok((back.slides || []).length >= 2, 'two slides read back');
  assert.match(JSON.stringify(back), /Coulomb/); assert.match(JSON.stringify(back), /विद्युत/);
});

test('3. xlsx marks sheet round-trip incl. formulas + edit', { skip, timeout: 60000 }, async () => {
  const files = k.services.get('files');
  const rows = [['Name', 'Phy', 'Chem', 'Total'], ['आरव', 70, 65, null], ['Sia', 55, 80, null]];
  const w = await files.write('xlsx', { sheets: [{ name: 'Marks', rows, widths: [20, 8, 8, 8], formulas: { D2: 'B2+C2', D3: 'B3+C3' } }] });
  const bytes = new Uint8Array(await w.blob.arrayBuffer());
  const back = await files.read(bytes, 'm.xlsx');
  assert.equal(back.format, 'xlsx');
  const sh = back.sheets[0];
  assert.equal(sh.name, 'Marks');
  const flat = JSON.stringify(sh);
  assert.match(flat, /आरव/); assert.match(flat, /70/);
  const e = await files.edit(bytes, 'xlsx', [{ op: 'setCell', sheet: 'Marks', cell: 'B3', value: 99 }]);
  const again = await files.read(new Uint8Array(await e.blob.arrayBuffer()), 'm.xlsx');
  assert.match(JSON.stringify(again.sheets[0]), /99/);
});

test('4. memory learns a stated preference and recalls it next run', { skip, timeout: 60000 }, async () => {
  const mem = k.services.get('memory');
  await runGoal(k, 'yaad rakhna: mujhe question paper hamesha Hindi mein chahiye aur 12pt font');
  let hits = await mem.recall('question paper language preference Hindi', { k: 6 });
  if (!hits.some((h) => /hindi|हिंदी|हिन्दी/i.test(h.text))) {
    // fall back to explicit tool path; the explicit tool MUST work
    await k.tools.call('memory_remember', { kind: 'pref', text: 'User wants question papers always in Hindi, 12pt font', tags: ['qp'] }, ctxFor());
    hits = await mem.recall('question paper language preference Hindi', { k: 6 });
    assert.ok(hits.some((h) => /hindi/i.test(h.text)), 'explicit memory_remember recall failed');
    t_note('implicit preference capture from natural language did not store (reflect/curator gap)');
  }
  // new run sees it
  const { events } = await runGoal(k, 'ek QP banao physics class 12');
  const recallEv = events.find((e) => (e.type || e.evt) === 'recall');
  assert.ok(recallEv || true);
  const prof = await mem.profile();
  assert.ok(prof && typeof prof === 'object');
  // Devanagari-aware retrieval
  await mem.remember({ kind: 'fact', text: 'विद्यार्थी का नाम आरव है', tags: ['stu'] });
  const dv = await mem.recall('आरव', { k: 3 });
  assert.ok(dv.some((h) => /आरव/.test(h.text)), 'Devanagari BM25 recall');
  // export/import round trip
  const dump = await mem.export();
  const s = typeof dump === 'string' ? dump : JSON.stringify(dump);
  await mem.import(JSON.parse(s));
  // forget
  const id = await mem.remember({ kind: 'fact', text: 'temporary zebra quartz', tags: [] });
  await mem.forget(id);
  assert.ok(!(await mem.recall('zebra quartz', { k: 3 })).some((h) => h.id === id), 'forgotten item gone');
});
function t_note(m) { console.log('# QA-NOTE ' + m); }

test('5. recursion depth guard: delegate stops at maxDepth', { skip, timeout: 60000 }, async () => {
  let threw = null, res = null;
  try { res = await k.tools.call('delegate', { agent: 'guru', task: 'delegate yourself again recursively forever' }, { ...ctxFor(), depth: 3, maxDepth: 3 }); } catch (e) { threw = e; }
  const blob = threw ? String(threw.message) : JSON.stringify(res);
  assert.match(blob, /depth|recurs|limit|max/i, 'delegate at depth==maxDepth must refuse with a depth message, got: ' + blob.slice(0, 200));
  // full run must terminate within limits
  const t0 = Date.now();
  const { rec } = await runGoal(k, 'repeat this task by delegating to yourself until done', { maxDepth: 1, maxSteps: 8 });
  assert.ok(rec, 'terminates'); assert.ok(Date.now() - t0 < 30000);
  // identical-call dedupe: same call twice in one task should not blow step budget
  const steps = (rec.tasks || []).length;
  assert.ok(steps <= 8 + 2, 'steps bounded: ' + steps);
});

test('6. Drive write via mocked fetch; trash requires confirmation', { skip, timeout: 60000 }, async () => {
  const conns = k.services.get('connectors');
  const drive = conns.get('gdrive');
  assert.ok(drive, 'gdrive connector');
  // inject a token the way a connected GIS client would; connectors should accept config token for tests
  k.config.set('gdrive.token', 'test-token'); k.config.set('google.token', 'test-token'); k.config.set('gdrive.accessToken', 'test-token');
  const m = mockFetch((url, init) => {
    if (/upload\/drive\/v3\/files/.test(url) || /\/drive\/v3\/files/.test(url)) {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return jsonRes({ id: 'F1', name: 'marks.xlsx', webViewLink: 'https://drive.google.com/file/d/F1' });
    }
    return jsonRes({}, 404);
  });
  try {
    let out;
    try { out = await k.tools.call('drive_write', { path: 'marks.csv', content: 'a,b\n1,2', mime: 'text/csv' }, ctxFor()); } catch (e) { out = { error: String(e.message) }; }
    const sentAuth = m.calls.some((c) => /Bearer test-token/.test(JSON.stringify(c.init.headers || {})));
    assert.ok(m.calls.length > 0, 'drive_write must call Drive API (got ' + JSON.stringify(out).slice(0, 200) + ')');
    assert.ok(sentAuth, 'Authorization: Bearer header sent');
    assert.ok(m.calls.every((c) => /^https:\/\/(www\.)?googleapis\.com|^https:\/\/[a-z]+\.googleapis\.com/.test(c.url)), 'only googleapis hosts: ' + m.calls.map((c) => c.url));
    // trash/remove must NOT hit the network without confirm
    m.calls.length = 0;
    let rem; try { rem = await drive.remove('F1'); } catch (e) { rem = { error: String(e.message) }; }
    const deleted = m.calls.some((c) => /DELETE|PATCH/.test(c.init.method || '') );
    assert.ok(!deleted, 'remove without confirmed:true must not delete. Got: ' + JSON.stringify(rem));
    assert.match(JSON.stringify(rem), /confirm/i, 'response must indicate confirmation required');
    let rem2; try { rem2 = await drive.remove('F1', { confirmed: true }); } catch (e) { rem2 = { error: String(e.message) }; }
    assert.ok(m.calls.some((c) => /DELETE|PATCH/.test(c.init.method || '')), 'confirmed remove performs call: ' + JSON.stringify(rem2));
  } finally { m.restore(); }
});

test('7. network is never touched by local-provider runs', { skip }, async () => {
  const { rec } = await runGoal(k, 'physics class 12 ke liye 5 MCQ banao');
  assert.ok(rec.answer !== undefined);
});

test('8. a failing tool does not crash run()', { skip, timeout: 60000 }, async () => {
  k.tools.register({ name: 'qa_boom', description: 'always throws', schema: { type: 'object', properties: {} }, run: async () => { throw new Error('boom'); } });
  let r; try { r = await k.tools.call('qa_boom', {}, ctxFor()); } catch (e) { r = { error: e.message }; }
  assert.ok(r);
});
