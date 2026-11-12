const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const androidRoot = path.join(root, 'android', 'app', 'src', 'main');
const sourceRoot = path.join(root, 'native', 'android');
const packageDir = path.join(androidRoot, 'java', 'com', 'playverse', 'app', 'plugins');

if (!fs.existsSync(androidRoot)) {
  console.error('Android platform is not generated. Run npx cap add android first.');
  process.exit(1);
}
for (const file of ['ArcadeHudPlugin.java', 'ArcadeHudService.java', 'NativeScreenSharePlugin.kt']) {
  const source = path.join(sourceRoot, file);
  if (!fs.existsSync(source)) throw new Error('Missing native source: ' + source);
}
fs.mkdirSync(packageDir, { recursive: true });
for (const file of ['ArcadeHudPlugin.java', 'ArcadeHudService.java', 'NativeScreenSharePlugin.kt']) {
  fs.copyFileSync(path.join(sourceRoot, file), path.join(packageDir, file));
}

const manifestPath = path.join(androidRoot, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.CAMERA" />'
];
for (const permission of permissions) {
  const name = permission.match(/android:name="([^"]+)"/)[1];
  if (!manifest.includes('android:name="' + name + '"')) {
    manifest = manifest.replace(/<application\b/, permission + '\n    <application');
  }
}
const service = `<service
            android:name="com.playverse.app.plugins.ArcadeHudService"
            android:exported="false"
            android:stopWithTask="false"
            android:foregroundServiceType="specialUse|mediaProjection|microphone|camera">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="User-enabled floating in-game controls for PLAYVERSE" />
        </service>`;
if (!manifest.includes('com.playverse.app.plugins.ArcadeHudService')) {
  manifest = manifest.replace('</application>', '    ' + service + '\n    </application>');
}
fs.writeFileSync(manifestPath, manifest);

const javaRoot = path.join(androidRoot, 'java');
function findMainActivity(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') return full;
  }
  return null;
}
const mainActivity = findMainActivity(javaRoot);
if (!mainActivity) throw new Error('Capacitor MainActivity.java not found.');
let activity = fs.readFileSync(mainActivity, 'utf8');
const importLine = 'import com.playverse.app.plugins.ArcadeHudPlugin;';
const nativeShareImport = 'import com.playverse.app.plugins.NativeScreenSharePlugin;';
if (!activity.includes(importLine)) {
  const packageLine = activity.match(/^package [^;]+;/m);
  if (!packageLine) throw new Error('MainActivity package declaration not found.');
  activity = activity.replace(packageLine[0], packageLine[0] + '\n\n' + importLine);
}
if (!activity.includes(nativeShareImport)) {
  activity = activity.replace(importLine, importLine + '\n' + nativeShareImport);
}
if (!activity.includes('registerPlugin(NativeScreenSharePlugin.class)')) {
  const onCreate = /((?:public|protected)\s+void\s+onCreate\s*\([^)]*\)\s*\{)/;
  if (onCreate.test(activity)) {
    activity = activity.replace(onCreate, match => match + '\n        registerPlugin(ArcadeHudPlugin.class);\n        registerPlugin(NativeScreenSharePlugin.class);');
  } else {
    const classOpen = /extends BridgeActivity\s*\{/;
    if (!classOpen.test(activity)) throw new Error('Unsupported MainActivity template; plugin was not registered.');
    activity = activity.replace(classOpen, match => match + '\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ArcadeHudPlugin.class);\n        registerPlugin(NativeScreenSharePlugin.class);\n        super.onCreate(savedInstanceState);\n    }');
    if (!activity.includes('import android.os.Bundle;')) {
      activity = activity.replace(importLine, importLine + '\nimport android.os.Bundle;');
    }
  }
}
fs.writeFileSync(mainActivity, activity);

// Install the native LiveKit Android SDK required for MediaProjection publishing.
const rootGradlePath = path.join(root, 'android', 'build.gradle');
if (!fs.existsSync(rootGradlePath)) throw new Error('Android root build.gradle not found.');
let rootGradle = fs.readFileSync(rootGradlePath, 'utf8');
if (!rootGradle.includes('kotlin-gradle-plugin')) {
  if (!/dependencies\s*\{/.test(rootGradle)) throw new Error('Cannot locate root Gradle dependencies block.');
  rootGradle = rootGradle.replace(/dependencies\s*\{/, match => match + '\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21"');
}
if (!rootGradle.includes('jitpack.io')) {
  rootGradle = rootGradle.replace(/allprojects\s*\{\s*repositories\s*\{/, match => match + '\n        maven { url "https://jitpack.io" }');
}
fs.writeFileSync(rootGradlePath, rootGradle);

const appGradlePath = path.join(root, 'android', 'app', 'build.gradle');
if (!fs.existsSync(appGradlePath)) throw new Error('Android app build.gradle not found.');
let appGradle = fs.readFileSync(appGradlePath, 'utf8');
if (!appGradle.includes("apply plugin: 'kotlin-android'")) {
  appGradle = appGradle.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\\napply plugin: 'kotlin-android'");
}
if (!appGradle.includes('io.livekit:livekit-android')) {
  appGradle = appGradle.replace(/dependencies\\s*\\{/, match => match + '\\n    implementation "io.livekit:livekit-android:2.30.0"');
}
fs.writeFileSync(appGradlePath, appGradle);

console.log('Native PLAYVERSE HUD and LiveKit MediaProjection plugin installed.');
