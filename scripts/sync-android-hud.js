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
for (const file of ['ArcadeHudPlugin.java', 'ArcadeHudService.java']) {
  const source = path.join(sourceRoot, file);
  if (!fs.existsSync(source)) throw new Error('Missing native source: ' + source);
}
fs.mkdirSync(packageDir, { recursive: true });
for (const file of ['ArcadeHudPlugin.java', 'ArcadeHudService.java']) {
  fs.copyFileSync(path.join(sourceRoot, file), path.join(packageDir, file));
}

const manifestPath = path.join(androidRoot, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />'
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
            android:foregroundServiceType="specialUse">
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
if (!activity.includes(importLine)) {
  const packageLine = activity.match(/^package [^;]+;/m);
  if (!packageLine) throw new Error('MainActivity package declaration not found.');
  activity = activity.replace(packageLine[0], packageLine[0] + '\n\n' + importLine);
}
if (!activity.includes('registerPlugin(ArcadeHudPlugin.class)')) {
  const onCreate = /((?:public|protected)\\s+void\\s+onCreate\\s*\\([^)]*\\)\\s*\\{)/;
  if (onCreate.test(activity)) {
    activity = activity.replace(onCreate, match => match + '\\n        registerPlugin(ArcadeHudPlugin.class);');
  } else {
    const classOpen = /extends BridgeActivity\\s*\\{/;
    if (!classOpen.test(activity)) throw new Error('Unsupported MainActivity template; plugin was not registered.');
    activity = activity.replace(classOpen, match => match + '\\n    @Override\\n    public void onCreate(Bundle savedInstanceState) {\\n        registerPlugin(ArcadeHudPlugin.class);\\n        super.onCreate(savedInstanceState);\\n    }');
    if (!activity.includes('import android.os.Bundle;')) {
      activity = activity.replace(importLine, importLine + '\\nimport android.os.Bundle;');
    }
  }
}
fs.writeFileSync(mainActivity, activity);
console.log('Native PLAYVERSE floating HUD plugin and service installed.');
