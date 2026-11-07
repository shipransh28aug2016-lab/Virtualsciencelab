# Guru / गुरु

**EN:** Guru is a bilingual (Hindi/English) voice and text AI work-bot for CBSE teachers and ed-tech developers. It builds question papers, marking schemes, practice sets, notes and case studies, reads and writes docx/xlsx/pptx/pdf, and connects to Google Drive, GitHub and the web. It is a static site, an installable PWA and an Android app. With no API key it runs an offline local engine; with a key it uses a full LLM.

**HI:** गुरु CBSE शिक्षकों और ed-tech डेवलपर्स के लिए हिंदी/अंग्रेज़ी वॉइस और टेक्स्ट AI सहायक है। यह प्रश्न-पत्र, मार्किंग स्कीम, अभ्यास सेट, नोट्स और केस स्टडी बनाता है, docx/xlsx/pptx/pdf पढ़ता-लिखता है, और Google Drive, GitHub व वेब से जुड़ता है। यह स्टैटिक साइट, इंस्टॉल होने वाला PWA और Android ऐप है। API key के बिना ऑफ़लाइन लोकल इंजन चलता है; key के साथ पूरा LLM।

## 60-second start / 60 सेकंड में शुरू
```
cd guru
npm start            # http://localhost:8080  (guru/ at /, repo data/ at /data)
npm test             # node:test suites
npm run lint         # JSON/JS syntax, manifest icons, sw precache freshness
```
Needs Node 18+ only; no `npm install` is required for the web app. Open the page, type or tap the mic, and ask: "Class 12 Accountancy ka sample paper banao".
सिर्फ़ Node 18+ चाहिए; वेब ऐप के लिए `npm install` ज़रूरी नहीं। पेज खोलें, लिखें या माइक दबाएँ।

Scripts: `start`, `test`, `lint`, `build:sw` (regenerate service-worker precache list and version), `icons` (regenerate PNG/SVG icons), `android:sync`.

## Publish on GitHub Pages / GitHub Pages पर प्रकाशित करें
1. Push the repo to GitHub (default branch `main`).
2. Settings, Pages, Source: **GitHub Actions**.
3. Push any change under `guru/` or `data/curriculum/`, or run the **guru-pages** workflow manually.
4. Open `https://<user>.github.io/<repo>/` (redirects to `/guru/`).

The workflow runs `build:sw`, lint, then publishes `guru/` as `/guru/` and `data/curriculum` as `/data/curriculum`, so the CBSE module's `../../../data/curriculum` path resolves the same as locally. All URLs are relative, so project sites under `/<repo>/` work.
हिंदी: ऊपर के चरण वही हैं: रेपो पुश करें, Pages का Source "GitHub Actions" रखें, वर्कफ़्लो चलाएँ।

**Service worker registration** (done by the UI): `navigator.serviceWorker.register('./sw.js')`. Update flow: when a new version installs, the SW posts `{type:'sw:waiting'}` to pages; the UI shows "Update available" and sends `registration.waiting.postMessage({type:'SKIP_WAITING'})`, then reloads on `controllerchange`. Other messages: `GET_VERSION`, `CLEAR_SHARE`. The SW never caches or intercepts cross-origin requests or API/auth hosts (Anthropic, OpenAI, Gemini, Google, GitHub).

## Install on Android / Android पर इंस्टॉल
**PWA (easiest):** open the Pages URL in Chrome, menu, *Install app* / *Add to Home screen*. You get the Guru icon, offline use, "Share to Guru" for files (PDF, docx, xlsx, pptx, csv, txt, md, images), and long-press shortcuts *Voice* and *New question paper*.

**APK:** open the repo's **Actions** tab, run **guru-android**, download artifact `guru-debug-apk`, copy `app-debug.apk` to the phone and allow "install unknown apps". Details, local build, microphone/speech-recognition behaviour in WebView and the TWA/Bubblewrap route: `android/README.md`. (Debug APK is signed with the debug key; for Play Store make a release build with your own keystore.)

Shared files land in Cache Storage `guru-share`: `share/<id>/meta.json` (`{id,at,title,text,url,files:[{key,name,type,size}]}`) and `share/<id>/<n>` (file bytes; `X-Guru-Name` header is the URL-encoded file name). The page opens as `./?share=<id>`; `connectors/device.js` reads and `CLEAR_SHARE` clears them.

## Connectors setup / कनेक्टर सेटअप
Open ⚙ Settings in Guru.
- **LLM key:** pick Anthropic, OpenAI-compatible (set base URL) or Gemini and paste the key. Optionally set a passphrase to encrypt it at rest. No key = offline local engine.
- **Google Drive (OAuth Client ID):**
  1. console.cloud.google.com, create a project, enable **Google Drive API**, Docs, Sheets and Slides APIs.
  2. APIs & Services, OAuth consent screen: External, add yourself as a test user.
  3. Credentials, Create credentials, **OAuth client ID**, type **Web application**.
  4. Authorized JavaScript origins: `http://localhost:8080` and `https://<user>.github.io` (origin only, no path). No redirect URI is needed for the token client.
  5. Paste the Client ID into Settings, Google. Press Connect; Google asks for consent in a popup. Scope is requested only when you connect. (The Android APK origin is `https://localhost`; add it too, or use the PWA/TWA for Drive.)
- **GitHub token:** github.com, Settings, Developer settings, Fine-grained tokens, Generate: restrict to the repos you want, permissions *Contents: Read and write* (add *Pull requests* for PRs). Paste in Settings, GitHub.
- **Web fetch/search (CORS proxy):** browsers block cross-site fetches. Set a CORS proxy URL you control or trust (for example a small Cloudflare Worker that forwards `?url=`) and, for search, a search endpoint. Without them `web_fetch` works only for CORS-enabled sites.

## Privacy and security / गोपनीयता और सुरक्षा
- No backend, no telemetry. Memory, settings and files live in your browser (IndexedDB/localStorage) on your device.
- API keys and tokens are stored locally, optionally passphrase-encrypted (AES-GCM via WebCrypto); they are sent only to their own provider. Use restricted/least-privilege tokens; anyone with access to your unlocked browser profile can use them.
- With a cloud LLM, your prompts and any file text you attach are sent to that provider. In offline local mode nothing leaves the device.
- The service worker does not cache API, auth or cross-origin requests; the share-target inbox can be cleared. Destructive actions (delete, overwrite) are confirm-gated in the UI.
- Generated question content carries computed answers; always verify against the latest CBSE circular before use in an exam.
हिंदी: सारा डेटा आपके डिवाइस पर रहता है; कुंजियाँ केवल संबंधित प्रदाता को जाती हैं; ऑफ़लाइन मोड में कुछ बाहर नहीं जाता।

## Extending / विस्तार
**Add a tool** in any module's `register(k)`:
```js
export async function register(k) {
  k.tools.register({
    name: 'word_count', description: 'Count words in text',
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: async ({ text }) => ({ words: text.trim().split(/\s+/).filter(Boolean).length }),
  });
  k.intents.register({ id: 'word_count', tool: 'word_count',
    patterns: [/word count|शब्द गिन/i], extract: (t) => ({ text: t }), examples: ['word count of this'] });
}
```
**Add an agent:** `k.agents.register({ id:'reviewer', name:'Reviewer', role:'…', description:'…', system:'…', tools:['file_read','critique'], tier:'smart' })`. Create `src/<mod>/index.js`, add `tests/<mod>.test.mjs`, then run `npm run build:sw` (CI does it automatically) so the new files are precached. Full module protocol: `docs/CONTRACT.md`.

## Files owned by the deploy layer
`manifest.webmanifest`, `sw.js`, `capacitor.config.json`, `.well-known/assetlinks.json.template`, `tools/` (`serve.mjs`, `build-sw-manifest.mjs`, `make-icons.mjs`, `lint.mjs`, `android-sync.mjs`, `android-patch.mjs`), `android/`, `.github/workflows/guru-pages.yml` and `guru-android.yml`. See `LICENSE-NOTES.md` for third-party notes.
