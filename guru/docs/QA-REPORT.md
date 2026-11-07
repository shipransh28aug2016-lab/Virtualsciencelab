# QA report (agent 10)

Run: `node guru/tests/run-all.mjs`. Result: 180 pass, 0 fail, 1 skip (ui has no index.js, by design).

| Suite | Pass | Fail |
|---|---|---|
| cbse 8, connectors 34, files 32, kernel 21, llm 18, memory 11, voice-i18n 21 | 145 | 0 |
| contract (services, 36 tools, 10 agents, intents, i18n, zip, artifacts) | 26 | 0 |
| integration (QP 70 marks Hindi + docx, pptx, xlsx round trip, memory, depth guard, Drive mock + confirm gate, no-network, tool failure) | 8 | 0 |

## Open issues
1. HIGH, kernel, `src/kernel/builtin-tools.js` runJsNode: vm escape. Repro: `k.tools.call('run_js',{code:"return console.log.constructor('return process.version')()"},{})` returns the Node version. See SECURITY.md #1.
2. MED, kernel, `builtin-tools.js` runJsWorker: `new Function` in a blob worker is blocked by the page CSP (no unsafe-eval), so run_js fails in the browser. Not testable under Node; verify manually.
3. MED, files, `src/files/zip.js` ~L97-109: zip-bomb (sizes trusted from the central directory). SECURITY.md #4.
4. MED, connectors, `gdrive.js` L7-14: default OAuth scopes too broad. SECURITY.md #9.
5. MED, `sw.js` handleShare: unbounded cross-site share-target ingest. SECURITY.md #11.
6. NOTE, kernel: `intents.list()` returns only `{id, tool, examples}` (no patterns/extract); contract test adapted.
7. NOTE, memory: natural-language "yaad rakhna ..." may not auto-store a pref; the integration test falls back to `memory_remember` and logs `# QA-NOTE` when that happens.

Test notes: Drive tests use `connectors.get('gdrive').setToken('test-token')`; fetch is blocked globally in integration tests unless mocked.
