// Idempotently patches the generated Capacitor Android project: RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, INTERNET,
// microphone feature (optional) and a WebView mic-permission note. Run after `cap add/sync android`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const f = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!existsSync(f)) { console.error('AndroidManifest.xml not found; run npm run android:sync first'); process.exit(1); }
let x = readFileSync(f, 'utf8');
const add = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-feature android:name="android.hardware.microphone" android:required="false" />',
  '<queries><intent><action android:name="android.speech.RecognitionService" /></intent></queries>',
];
for (const line of add) {
  const key = line.match(/android:name="([^"]+)"/)?.[1] || 'android.speech.RecognitionService';
  if (!x.includes(key)) x = x.replace(/<\/manifest>\s*$/, `    ${line}\n</manifest>\n`);
}
writeFileSync(f, x);
console.log('AndroidManifest.xml patched');
