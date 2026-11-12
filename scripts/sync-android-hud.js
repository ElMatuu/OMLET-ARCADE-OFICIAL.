const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const androidRoot = path.join(root, 'android', 'app', 'src', 'main');
const javaRoot = path.join(androidRoot, 'java');
const sourceRoot = path.join(root, 'native', 'android');

if (!fs.existsSync(androidRoot)) {
  throw new Error('Android platform is not generated. Run npx cap add android first.');
}

function findMainActivity(directory) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(candidate);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') {
      return candidate;
    }
  }
  return null;
}

const activityPath = findMainActivity(javaRoot);
if (!activityPath) throw new Error('Capacitor MainActivity.java was not found.');
let activity = fs.readFileSync(activityPath, 'utf8');
const packageMatch = activity.match(/^package\s+([\w.]+);/m);
if (!packageMatch) throw new Error('Could not determine Android application package.');
const appPackage = packageMatch[1];
const pluginPackage = appPackage + '.plugins';
const pluginDirectory = path.join(path.dirname(activityPath), 'plugins');
fs.mkdirSync(pluginDirectory, { recursive: true });

for (const file of ['ArcadeHudPlugin.java', 'ArcadeHudService.java', 'NativeScreenSharePlugin.kt']) {
  const sourcePath = path.join(sourceRoot, file);
  if (!fs.existsSync(sourcePath)) throw new Error('Missing native HUD source: ' + sourcePath);
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/^package\s+[\w.]+;/m, 'package ' + pluginPackage + ';');
  fs.writeFileSync(path.join(pluginDirectory, file), source);
}

const manifestPath = path.join(androidRoot, 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) throw new Error('AndroidManifest.xml was not found.');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS'
];
const missingPermissions = permissions.filter(name => !manifest.includes('android:name="' + name + '"'));
if (missingPermissions.length) {
  const declarations = missingPermissions.map(name => '    <uses-permission android:name="' + name + '" />').join('\n');
  if (!/<application\b/.test(manifest)) throw new Error('AndroidManifest.xml has no application element.');
  manifest = manifest.replace(/<application\b/, declarations + '\n    <application');
}

const serviceName = pluginPackage + '.ArcadeHudService';
const serviceDeclaration = '    <service\n' +
  '        android:name="' + serviceName + '"\n' +
  '        android:exported="false"\n' +
  '        android:stopWithTask="false"\n' +
  '        android:foregroundServiceType="specialUse|mediaProjection|microphone|camera">\n' +
  '        <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="User-enabled floating in-game controls for PLAYVERSE" />\n' +
  '    </service>';
const serviceIndex = manifest.indexOf(serviceName);
if (serviceIndex >= 0) {
  const start = manifest.lastIndexOf('<service', serviceIndex);
  const end = manifest.indexOf('</service>', serviceIndex);
  if (start < 0 || end < 0) throw new Error('Existing ArcadeHudService declaration is malformed.');
  manifest = manifest.slice(0, start) + serviceDeclaration + manifest.slice(end + '</service>'.length);
} else {
  if (!manifest.includes('</application>')) throw new Error('AndroidManifest.xml application element is not closed.');
  manifest = manifest.replace('</application>', serviceDeclaration + '\n    </application>');
}
fs.writeFileSync(manifestPath, manifest);

const imports = [
  'import ' + pluginPackage + '.ArcadeHudPlugin;',
  'import ' + pluginPackage + '.ArcadeHudService;',
  'import ' + pluginPackage + '.NativeScreenSharePlugin;'
];
for (const importLine of imports) {
  if (!activity.includes(importLine)) {
    const lastImport = activity.match(/^import .*;\s*$/gm);
    if (lastImport && lastImport.length) {
      const anchor = lastImport[lastImport.length - 1];
      activity = activity.replace(anchor, anchor + '\n' + importLine);
    } else {
      activity = activity.replace(packageMatch[0], packageMatch[0] + '\n\n' + importLine);
    }
  }
}
const registrations = [
  'registerPlugin(ArcadeHudPlugin.class);',
  'registerPlugin(NativeScreenSharePlugin.class);'
];
for (const registration of registrations) {
  if (activity.includes(registration)) continue;
  const onCreate = /((?:public|protected)\s+void\s+onCreate\s*\([^)]*\)\s*\{)/;
  if (onCreate.test(activity)) {
    activity = activity.replace(onCreate, match => match + '\n        ' + registration);
  } else {
    const classOpen = /extends BridgeActivity\s*\{/;
    if (!classOpen.test(activity)) throw new Error('Unsupported MainActivity template; cannot register ArcadeHudPlugin.');
    activity = activity.replace(classOpen, match => match +
      '\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        ' +
      registration + '\n        super.onCreate(savedInstanceState);\n    }\n');
  }
}
fs.writeFileSync(activityPath, activity);

// Install the native LiveKit Android SDK used by the MediaProjection companion publisher.
const rootGradlePath = path.join(root, 'android', 'build.gradle');
if (!fs.existsSync(rootGradlePath)) throw new Error('Android root build.gradle not found.');
let rootGradle = fs.readFileSync(rootGradlePath, 'utf8');
if (!rootGradle.includes('kotlin-gradle-plugin')) {
  if (!/dependencies\s*\{/.test(rootGradle)) throw new Error('Cannot locate root Gradle dependencies block.');
  rootGradle = rootGradle.replace(/dependencies\s*\{/, match => match + '\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21"');
}
const settingsGradlePath = path.join(root, 'android', 'settings.gradle');
if (!fs.existsSync(settingsGradlePath)) throw new Error('Android settings.gradle not found.');
let settingsGradle = fs.readFileSync(settingsGradlePath, 'utf8');
if (!settingsGradle.includes('jitpack.io')) {
  const managedRepositories = /dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{/;
  if (managedRepositories.test(settingsGradle)) {
    settingsGradle = settingsGradle.replace(managedRepositories, match => match + '\n        maven { url "https://jitpack.io" }');
  } else {
    const projectRepositories = /allprojects\s*\{\s*repositories\s*\{/;
    if (!projectRepositories.test(rootGradle)) throw new Error('Cannot locate Android dependency repositories for JitPack.');
    rootGradle = rootGradle.replace(projectRepositories, match => match + '\n        maven { url "https://jitpack.io" }');
  }
  fs.writeFileSync(settingsGradlePath, settingsGradle);
}
fs.writeFileSync(rootGradlePath, rootGradle);

const appGradlePath = path.join(root, 'android', 'app', 'build.gradle');
if (!fs.existsSync(appGradlePath)) throw new Error('Android app build.gradle not found.');
let appGradle = fs.readFileSync(appGradlePath, 'utf8');
if (!appGradle.includes("apply plugin: 'kotlin-android'")) {
  appGradle = appGradle.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'");
}
if (!appGradle.includes('io.livekit:livekit-android')) {
  appGradle = appGradle.replace(/dependencies\s*\{/, match => match + '\n    implementation "io.livekit:livekit-android:2.30.0"');
}
if (!appGradle.includes('KotlinCompile).configureEach')) {
  appGradle += '\ntasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach { kotlinOptions { jvmTarget = "17" } }\n';
}
fs.writeFileSync(appGradlePath, appGradle);

console.log('PLAYVERSE Android HUD and native MediaProjection sources copied, plugins registered, and Gradle dependencies synchronized.');
