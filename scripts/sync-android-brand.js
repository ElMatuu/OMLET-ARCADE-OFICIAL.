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
  fs.copyFileSync(path.join(generated, density, 'ic_launcher.png'), path.join(destination, 'ic_launcher_round.png'));
}
fs.mkdirSync(path.join(resources, 'mipmap-anydpi-v26'), { recursive: true });
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  fs.writeFileSync(path.join(resources, 'mipmap-anydpi-v26', name), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/playverse_icon_background" />
    <foreground android:drawable="@mipmap/playverse_foreground" />
</adaptive-icon>
`);
}
fs.mkdirSync(path.join(resources, 'mipmap-xxxhdpi'), { recursive: true });
fs.copyFileSync(path.join(generated, 'playverse_foreground.png'), path.join(resources, 'mipmap-xxxhdpi', 'playverse_foreground.png'));
fs.mkdirSync(path.join(resources, 'values'), { recursive: true });
fs.writeFileSync(path.join(resources, 'values', 'playverse_brand.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="playverse_icon_background">#08090D</color></resources>
`);

const drawable = path.join(resources, 'drawable-nodpi');
fs.mkdirSync(drawable, { recursive: true });
fs.copyFileSync(path.join(generated, 'playverse_splash.png'), path.join(drawable, 'playverse_splash.png'));
fs.mkdirSync(path.join(resources, 'drawable'), { recursive: true });
fs.writeFileSync(path.join(resources, 'drawable', 'playverse_splash_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/playverse_icon_background" />
    <item>
        <bitmap android:src="@drawable/playverse_splash" android:gravity="center" />
    </item>
</layer-list>
`);

const manifestPath = path.join(androidRoot, 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) throw new Error('AndroidManifest.xml was not found.');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const application = manifest.match(/<application\b[^>]*>/);
if (!application) throw new Error('AndroidManifest.xml does not contain an application element.');
let appTag = application[0];
for (const [attribute, value] of [['android:icon', '@mipmap/ic_launcher'], ['android:roundIcon', '@mipmap/ic_launcher_round'], ['android:label', 'PLAYVERSE']]) {
  const pattern = new RegExp('\\s' + attribute + '="[^"]*"');
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
  manifest = manifest.slice(0, at) + missing.join('\n') + '\n    ' + manifest.slice(at);
}
fs.writeFileSync(manifestPath, manifest);

const baseStyles = path.join(resources, 'values', 'styles.xml');
if (!fs.existsSync(baseStyles)) throw new Error('Capacitor styles.xml not found; cannot safely configure legacy splash.');
let styles = fs.readFileSync(baseStyles, 'utf8');
const stylePattern = /(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*>)([\s\S]*?)(<\/style>)/;
if (!stylePattern.test(styles)) throw new Error('AppTheme.NoActionBarLaunch style not found in Capacitor resources.');
styles = styles.replace(stylePattern, (match, open, body, close) => {
  if (body.includes('android:background')) return match;
  return open + body + '\n        <item name="android:background">@drawable/playverse_splash_background</item>\n    ' + close;
});
fs.writeFileSync(baseStyles, styles);

const v31 = path.join(resources, 'values-v31');
fs.mkdirSync(v31, { recursive: true });
const splashStyles = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  '    <style name="AppTheme.NoActionBarLaunch">',
  '        <item name="android:windowSplashScreenBackground">#08090D</item>',
  '        <item name="android:windowSplashScreenAnimatedIcon">@mipmap/playverse_foreground</item>',
  '        <item name="android:windowSplashScreenIconBackgroundColor">#08090D</item>',
  '        <item name="android:postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
  '        <item name="android:background">@drawable/playverse_splash_background</item>',
  '    </style>',
  '</resources>'
].join(String.fromCharCode(10)) + String.fromCharCode(10);
fs.writeFileSync(path.join(v31, 'styles.xml'), splashStyles);
console.log('PLAYVERSE: official icon installed for Android launcher; branded splash configured for legacy Android and Android 12+.');
