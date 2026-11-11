const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const generated = path.join(root, 'assets', 'generated');
const androidRoot = path.join(root, 'android', 'app', 'src', 'main');
const resources = path.join(androidRoot, 'res');

if (!fs.existsSync(androidRoot)) {
  console.error('Android platform is not generated yet. Run npx cap add android first.');
  process.exit(1);
}
if (!fs.existsSync(path.join(generated, 'playverse_foreground.png'))) {
  console.error('Generated brand assets are missing. Run node scripts/generate-icons.js first.');
  process.exit(1);
}

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const destination = path.join(resources, 'mipmap-' + density);
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(generated, density, 'ic_launcher.png'), path.join(destination, 'ic_launcher.png'));
}
fs.mkdirSync(path.join(resources, 'mipmap-anydpi-v26'), { recursive: true });
fs.writeFileSync(path.join(resources, 'mipmap-anydpi-v26', 'ic_launcher.xml'), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/playverse_icon_background" />
    <foreground android:drawable="@mipmap/playverse_foreground" />
</adaptive-icon>
`);
fs.writeFileSync(path.join(resources, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/playverse_icon_background" />
    <foreground android:drawable="@mipmap/playverse_foreground" />
</adaptive-icon>
`);
fs.mkdirSync(path.join(resources, 'mipmap-xxxhdpi'), { recursive: true });
fs.copyFileSync(path.join(generated, 'playverse_foreground.png'), path.join(resources, 'mipmap-xxxhdpi', 'playverse_foreground.png'));
fs.mkdirSync(path.join(resources, 'values'), { recursive: true });
fs.writeFileSync(path.join(resources, 'values', 'playverse_brand.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="playverse_icon_background">#08090D</color></resources>
`);

const manifestPath = path.join(androidRoot, 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) throw new Error('AndroidManifest.xml was not found.');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const application = manifest.match(/<application\\b[^>]*>/);
if (!application) throw new Error('AndroidManifest.xml does not contain an application element.');
let appTag = application[0];
for (const [attribute, value] of [['android:icon', '@mipmap/ic_launcher'], ['android:roundIcon', '@mipmap/ic_launcher_round'], ['android:label', 'PLAYVERSE']]) {
  const pattern = new RegExp('\\\\s' + attribute.replace(':', ':') + '="[^"]*"');
  if (pattern.test(appTag)) appTag = appTag.replace(pattern, ' ' + attribute + '="' + value + '"');
  else appTag = appTag.slice(0, -1) + ' ' + attribute + '="' + value + '">';
}
manifest = manifest.replace(application[0], appTag);

const permissions = [
  '    <uses-permission android:name="android.permission.CAMERA" />',
  '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
  '    <uses-feature android:name="android.hardware.microphone" android:required="false" />'
];
const missing = permissions.filter((entry) => {
  const name = entry.match(/android:name="([^"]+)"/)[1];
  return !manifest.includes('android:name="' + name + '"');
});
if (missing.length) {
  const at = manifest.indexOf('<application');
  manifest = manifest.slice(0, at) + missing.join('\\n') + '\\n    ' + manifest.slice(at);
}
fs.writeFileSync(manifestPath, manifest);

const v31 = path.join(resources, 'values-v31');
fs.mkdirSync(v31, { recursive: true });
fs.writeFileSync(path.join(v31, 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBar">
        <item name="android:windowSplashScreenBackground">#08090D</item>
        <item name="android:windowSplashScreenAnimatedIcon">@mipmap/playverse_foreground</item>
        <item name="android:windowSplashScreenIconBackgroundColor">#08090D</item>
        <item name="android:postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`);
console.log('PLAYVERSE: same official brand applied to Android launcher, adaptive icon, and Android 12+ startup screen.');
