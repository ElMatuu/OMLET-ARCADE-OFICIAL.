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

const animationDir = path.join(resources, 'anim');
fs.mkdirSync(animationDir, { recursive: true });
const animationResources = {
  'playverse_fade_in.xml': '<?xml version="1.0" encoding="utf-8"?>\n<alpha xmlns:android="http://schemas.android.com/apk/res/android" android:duration="180" android:interpolator="@android:anim/decelerate_interpolator" android:fromAlpha="0.0" android:toAlpha="1.0" />',
  'playverse_fade_out.xml': '<?xml version="1.0" encoding="utf-8"?>\n<alpha xmlns:android="http://schemas.android.com/apk/res/android" android:duration="150" android:interpolator="@android:anim/accelerate_interpolator" android:fromAlpha="1.0" android:toAlpha="0.0" />',
  'playverse_panel_enter.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:shareInterpolator="false"><scale android:duration="220" android:interpolator="@android:anim/decelerate_interpolator" android:pivotX="50%" android:pivotY="100%" android:fromXScale="0.9" android:toXScale="1.0" android:fromYScale="0.9" android:toYScale="1.0" /><alpha android:duration="180" android:interpolator="@android:anim/decelerate_interpolator" android:fromAlpha="0.0" android:toAlpha="1.0" /></set>',
  'playverse_panel_exit.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:shareInterpolator="false"><scale android:duration="170" android:interpolator="@android:anim/accelerate_interpolator" android:pivotX="50%" android:pivotY="100%" android:fromXScale="1.0" android:toXScale="0.9" android:fromYScale="1.0" android:toYScale="0.9" /><alpha android:duration="150" android:interpolator="@android:anim/accelerate_interpolator" android:fromAlpha="1.0" android:toAlpha="0.0" /></set>',
  'playverse_slide_in_up.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="220" android:interpolator="@android:anim/decelerate_interpolator" android:fromYDelta="50%p" android:toYDelta="0" />',
  'playverse_slide_in_down.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="220" android:interpolator="@android:anim/decelerate_interpolator" android:fromYDelta="-50%p" android:toYDelta="0" />',
  'playverse_slide_out_down.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="180" android:interpolator="@android:anim/accelerate_interpolator" android:fromYDelta="0" android:toYDelta="50%p" />',
  'playverse_slide_out_up.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="180" android:interpolator="@android:anim/accelerate_interpolator" android:fromYDelta="0" android:toYDelta="-50%p" />',
  'playverse_fade_translate_left.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:shareInterpolator="false"><alpha android:duration="150" android:fromAlpha="1.0" android:toAlpha="0.0" /><translate android:duration="200" android:fromXDelta="0" android:toXDelta="-30%p" /></set>',
  'playverse_fade_translate_right.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:shareInterpolator="false"><alpha android:duration="150" android:fromAlpha="1.0" android:toAlpha="0.0" /><translate android:duration="200" android:fromXDelta="0" android:toXDelta="30%p" /></set>',
  'playverse_float_drift.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="1600" android:fromYDelta="0" android:toYDelta="16" android:repeatCount="infinite" android:repeatMode="reverse" android:interpolator="@android:anim/accelerate_decelerate_interpolator" />',
  'playverse_reveal_ripple.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:shareInterpolator="false"><scale android:duration="600" android:pivotX="0%" android:pivotY="50%" android:fromXScale="0" android:toXScale="1" android:fromYScale="1" android:toYScale="1" android:repeatCount="infinite" android:interpolator="@android:anim/linear_interpolator" /><alpha android:duration="600" android:fromAlpha="1" android:toAlpha="0" android:repeatCount="infinite" android:interpolator="@android:anim/linear_interpolator" /></set>',
  'playverse_rise_in.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="260" android:interpolator="@android:anim/decelerate_interpolator" android:fromYDelta="100%p" android:toYDelta="0" />',
  'playverse_rise_out.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:duration="220" android:interpolator="@android:anim/accelerate_interpolator" android:fromYDelta="0" android:toYDelta="100%p" />',
  'playverse_scale_fade_expand.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:shareInterpolator="false"><scale android:duration="500" android:interpolator="@android:anim/decelerate_interpolator" android:pivotX="50%" android:pivotY="50%" android:fromXScale="0" android:toXScale="1" android:fromYScale="0" android:toYScale="1" /><alpha android:duration="500" android:interpolator="@android:anim/accelerate_interpolator" android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_enter_from_bottom_fade.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:duration="150" android:interpolator="@android:anim/decelerate_interpolator" android:shareInterpolator="true"><translate android:fromYDelta="20%p" android:toYDelta="0" /><alpha android:fromAlpha="0" android:toAlpha="1" /></set>',
  'playverse_enter_from_right_fade.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:duration="150" android:interpolator="@android:anim/decelerate_interpolator" android:shareInterpolator="true"><translate android:fromXDelta="20%p" android:toXDelta="0" /><alpha android:fromAlpha="0" android:toAlpha="1" /></set>',
  'playverse_exit_to_bottom_fade.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:duration="150" android:interpolator="@android:anim/accelerate_interpolator" android:shareInterpolator="true"><translate android:fromYDelta="0" android:toYDelta="20%p" /><alpha android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_exit_to_right_fade.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:duration="150" android:interpolator="@android:anim/accelerate_interpolator" android:shareInterpolator="true"><translate android:fromXDelta="0" android:toXDelta="20%p" /><alpha android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_alpha_in.xml': '<?xml version="1.0" encoding="utf-8"?>\n<alpha xmlns:android="http://schemas.android.com/apk/res/android" android:duration="220" android:interpolator="@android:anim/decelerate_interpolator" android:fromAlpha="0" android:toAlpha="1" />',
  'playverse_alpha_out.xml': '<?xml version="1.0" encoding="utf-8"?>\n<alpha xmlns:android="http://schemas.android.com/apk/res/android" android:duration="180" android:interpolator="@android:anim/accelerate_interpolator" android:fromAlpha="1" android:toAlpha="0" />',
  'playverse_scale_fade_pop.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:shareInterpolator="false"><scale android:duration="500" android:interpolator="@android:anim/decelerate_interpolator" android:pivotX="50%" android:pivotY="50%" android:fromXScale="0" android:toXScale="1" android:fromYScale="0" android:toYScale="1" /><alpha android:duration="500" android:interpolator="@android:anim/accelerate_interpolator" android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_particle_burst_a.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:fillAfter="true"><translate android:duration="400" android:fromYDelta="0" android:toYDelta="-45" /><translate android:duration="200" android:startOffset="400" android:fromXDelta="0" android:toXDelta="-20" android:fromYDelta="0" android:toYDelta="-50" /><translate android:duration="400" android:startOffset="600" android:fromXDelta="0" android:toXDelta="40" android:fromYDelta="0" android:toYDelta="-55" /><alpha android:duration="400" android:startOffset="600" android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_particle_burst_b.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:fillAfter="true"><translate android:duration="400" android:fromYDelta="0" android:toYDelta="-40" /><translate android:duration="300" android:startOffset="400" android:fromXDelta="0" android:toXDelta="30" android:fromYDelta="0" android:toYDelta="-55" /><translate android:duration="300" android:startOffset="700" android:fromXDelta="0" android:toXDelta="-20" android:fromYDelta="0" android:toYDelta="-60" /><alpha android:duration="400" android:startOffset="600" android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_particle_burst_c.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:fillAfter="true"><translate android:duration="400" android:fromYDelta="0" android:toYDelta="-40" /><translate android:duration="200" android:startOffset="400" android:fromXDelta="0" android:toXDelta="-40" android:fromYDelta="0" android:toYDelta="-50" /><translate android:duration="400" android:startOffset="600" android:fromXDelta="0" android:toXDelta="10" android:fromYDelta="0" android:toYDelta="-60" /><alpha android:duration="400" android:startOffset="600" android:fromAlpha="1" android:toAlpha="0" /></set>',
  'playverse_rotate_loop.xml': '<?xml version="1.0" encoding="utf-8"?>\n<rotate xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/linear_interpolator" android:duration="1000" android:fromDegrees="0" android:toDegrees="360" android:pivotX="50%" android:pivotY="50%" android:repeatCount="infinite" />',
  'playverse_scale_bounce.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:shareInterpolator="true"><scale android:duration="400" android:pivotX="50%" android:pivotY="50%" android:fromXScale="1" android:toXScale="1.2" android:fromYScale="1" android:toYScale="1.2" /><scale android:duration="100" android:startOffset="400" android:pivotX="50%" android:pivotY="50%" android:fromXScale="1" android:toXScale="0.83" android:fromYScale="1" android:toYScale="0.83" /></set>',
  'playverse_enter_from_left_fade.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/decelerate_interpolator" android:shareInterpolator="false"><alpha android:duration="300" android:fromAlpha="0" android:toAlpha="1" /><translate android:duration="200" android:fromXDelta="-50%p" android:toXDelta="0" /></set>',
  'playverse_enter_from_right_full.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/decelerate_interpolator" android:shareInterpolator="false"><alpha android:duration="300" android:fromAlpha="0" android:toAlpha="1" /><translate android:duration="200" android:fromXDelta="50%p" android:toXDelta="0" /></set>',
  'playverse_exit_to_left_full.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_interpolator" android:shareInterpolator="false"><alpha android:duration="150" android:fromAlpha="1" android:toAlpha="0" /><translate android:duration="200" android:fromXDelta="0" android:toXDelta="-50%p" /></set>',
  'playverse_exit_to_right_full.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_interpolator" android:shareInterpolator="false"><alpha android:duration="150" android:fromAlpha="1" android:toAlpha="0" /><translate android:duration="200" android:fromXDelta="0" android:toXDelta="50%p" /></set>',
  'playverse_shake_up.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:duration="500" android:repeatCount="12" android:repeatMode="reverse" android:fromYDelta="0" android:toYDelta="-20" />',
  'playverse_shake_right.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:duration="500" android:repeatCount="12" android:repeatMode="reverse" android:fromXDelta="0" android:toXDelta="20" />',
  'playverse_shake_left.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:duration="500" android:repeatCount="12" android:repeatMode="reverse" android:fromXDelta="0" android:toXDelta="-20" />',
  'playverse_shake_down.xml': '<?xml version="1.0" encoding="utf-8"?>\n<translate xmlns:android="http://schemas.android.com/apk/res/android" android:interpolator="@android:anim/accelerate_decelerate_interpolator" android:duration="500" android:repeatCount="12" android:repeatMode="reverse" android:fromYDelta="0" android:toYDelta="20" />'
};
const interpolatorDir = path.join(resources, 'interpolator');
fs.mkdirSync(interpolatorDir, { recursive: true });
fs.writeFileSync(path.join(interpolatorDir, 'playverse_smooth_curve.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<pathInterpolator xmlns:android="http://schemas.android.com/apk/res/android" android:controlX1="0.4" android:controlY1="0.0" android:controlX2="0.6" android:controlY2="1.0" />\n');
for (const [name, xml] of Object.entries(animationResources)) {
  fs.writeFileSync(path.join(animationDir, name), xml + String.fromCharCode(10));
}

const animatorDir = path.join(resources, 'animator');
fs.mkdirSync(animatorDir, { recursive: true });
const animatorResources = {
  'playverse_pop_in.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="scaleX" android:duration="199" android:valueFrom="0.0" android:valueTo="1.0" android:valueType="floatType" android:interpolator="@android:anim/overshoot_interpolator" /><objectAnimator android:propertyName="scaleY" android:duration="199" android:valueFrom="0.0" android:valueTo="1.0" android:valueType="floatType" android:interpolator="@android:anim/overshoot_interpolator" /></set>',
  'playverse_pop_out.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="scaleX" android:duration="200" android:valueFrom="1.0" android:valueTo="0.0" android:valueType="floatType" android:interpolator="@android:anim/accelerate_interpolator" /><objectAnimator android:propertyName="scaleY" android:duration="200" android:valueFrom="1.0" android:valueTo="0.0" android:valueType="floatType" android:interpolator="@android:anim/accelerate_interpolator" /></set>',
  'playverse_pulse.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="scaleX" android:duration="166" android:valueFrom="1.0" android:valueTo="0.9" android:valueType="floatType" /><objectAnimator android:propertyName="scaleY" android:duration="166" android:valueFrom="1.0" android:valueTo="0.9" android:valueType="floatType" /></set>',
  'playverse_slide_left_in.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="translationX" android:duration="200" android:valueFrom="-15" android:valueTo="0" android:valueType="floatType" /><objectAnimator android:propertyName="alpha" android:duration="300" android:valueFrom="0" android:valueTo="1" android:valueType="floatType" /></set>',
  'playverse_slide_right_in.xml': '<?xml version="1.0" encoding="utf-8"?>\n<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="translationX" android:duration="200" android:valueFrom="15" android:valueTo="0" android:valueType="floatType" /><objectAnimator android:propertyName="alpha" android:duration="300" android:valueFrom="0" android:valueTo="1" android:valueType="floatType" /></set>'
};
for (const [name, xml] of Object.entries(animatorResources)) {
  fs.writeFileSync(path.join(animatorDir, name), xml + String.fromCharCode(10));
}

const stateAnimatorResources = {
  'playverse_elevation_states.xml': '<?xml version="1.0" encoding="utf-8"?>\n<selector xmlns:android="http://schemas.android.com/apk/res/android"><item android:state_enabled="true"><objectAnimator android:duration="180" android:valueTo="8dp" android:valueType="floatType" android:propertyName="elevation" /></item><item><objectAnimator android:duration="0" android:valueTo="0dp" android:valueType="floatType" android:propertyName="elevation" /></item></selector>',
  'playverse_elevation_default.xml': '<?xml version="1.0" encoding="utf-8"?>\n<selector xmlns:android="http://schemas.android.com/apk/res/android"><item><objectAnimator android:duration="1" android:valueTo="8dp" android:valueType="floatType" android:propertyName="elevation" /></item></selector>'
};
for (const [name, xml] of Object.entries(stateAnimatorResources)) {
  fs.writeFileSync(path.join(animatorDir, name), xml + String.fromCharCode(10));
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
  '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
  '        <item name="android:background">@drawable/playverse_splash_background</item>',
  '    </style>',
  '</resources>'
].join(String.fromCharCode(10)) + String.fromCharCode(10);
fs.writeFileSync(path.join(v31, 'styles.xml'), splashStyles);

const overlayPermissions = [
  '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
  '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />',
  '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
];
const missingOverlayPermissions = overlayPermissions.filter((entry) => {
  const name = entry.match(/android:name="([^"]+)"/)[1];
  return !manifest.includes('android:name="' + name + '"');
});
if (missingOverlayPermissions.length) {
  const appAt = manifest.indexOf('<application');
  manifest = manifest.slice(0, appAt) + missingOverlayPermissions.join('\n') + '\n    ' + manifest.slice(appAt);
  fs.writeFileSync(manifestPath, manifest);
}

const mainActivityPath = path.join(androidRoot, 'java');
function findMainActivity(directory) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(candidate);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') return candidate;
  }
  return null;
}
const activityPath = findMainActivity(mainActivityPath);
if (!activityPath) throw new Error('Capacitor MainActivity.java was not found; cannot register overlay permission bridge.');
let activity = fs.readFileSync(activityPath, 'utf8');
const packageMatch = activity.match(/^package\s+([\w.]+);/m);
if (!packageMatch) throw new Error('Could not determine Android application package for overlay permission bridge.');
const javaPackage = packageMatch[1];
const pluginPath = path.join(path.dirname(activityPath), 'OverlayPermissionPlugin.java');
const pluginSource = `package ${javaPackage};

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OverlayPermission")
public class OverlayPermissionPlugin extends Plugin {
    @PluginMethod
    public void check(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        result.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext())) {
            JSObject result = new JSObject();
            result.put("opened", false);
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        result.put("granted", false);
        call.resolve(result);
    }

    @PluginMethod
    public void startBubble(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            call.reject("Android todavía no concedió el permiso de ventana flotante.");
            return;
        }
        Intent intent = new Intent(getContext(), FloatingControlsService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
        else getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopBubble(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FloatingControlsService.class));
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("playverse_floating", android.content.Context.MODE_PRIVATE);
        String action = prefs.getString("pending_action", "");
        prefs.edit().remove("pending_action").apply();
        JSObject result = new JSObject();
        result.put("action", action);
        call.resolve(result);
    }
}
`;
fs.writeFileSync(pluginPath, pluginSource);

const serviceSource = `package ${javaPackage};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

public class FloatingControlsService extends Service {
    private static final String CHANNEL = "playverse_floating_controls";
    private WindowManager manager;
    private View bubble;
    private View panel;
    private WindowManager.LayoutParams bubbleParams;
    private WindowManager.LayoutParams panelParams;
    private boolean expanded = false;
    private float downX, downY, startX, startY;
    private int dp(float value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    @Override public void onCreate() {
        super.onCreate();
        manager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
        startForeground(7401, buildNotification());
        showBubble();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Controles flotantes PLAYVERSE", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Mantiene disponibles los controles flotantes mientras jugás.");
            channel.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = PendingIntent.getActivity(this, 7401, open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, CHANNEL).setSmallIcon(getApplicationInfo().icon)
                .setContentTitle("PLAYVERSE está listo").setContentText("Controles flotantes activos · Tocá para volver")
                .setContentIntent(pending).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
        }
        return new Notification.Builder(this).setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("PLAYVERSE está listo").setContentText("Controles flotantes activos")
            .setContentIntent(pending).setOngoing(true).build();
    }

    private GradientDrawable shape(int color, int radius) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius));
        d.setStroke(dp(1), Color.argb(70,255,255,255)); return d;
    }

    private TextView label(String text, int size, int color) {
        TextView v = new TextView(this); v.setText(text); v.setTextSize(size); v.setTextColor(color);
        v.setGravity(Gravity.CENTER); v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); v.setPadding(dp(10),dp(9),dp(10),dp(9));
        return v;
    }

    private WindowManager.LayoutParams params(int width, int height, int gravity) {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        return new WindowManager.LayoutParams(width < 0 ? width : dp(width), height < 0 ? height : dp(height),
            type, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
    }

    private void showBubble() {
        if (bubble != null) return;
        TextView icon = label("🎮", 25, Color.WHITE);
        icon.setBackground(shape(Color.rgb(239,91,72), 28));
        bubble = icon;
        bubbleParams = params(56,56,Gravity.TOP | Gravity.LEFT);
        bubbleParams.x = dp(10); bubbleParams.y = dp(180);
        icon.setOnTouchListener((view,event) -> {
            switch(event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX(); downY = event.getRawY(); startX = bubbleParams.x; startY = bubbleParams.y; return true;
                case MotionEvent.ACTION_MOVE:
                    bubbleParams.x = (int)(startX + event.getRawX() - downX);
                    bubbleParams.y = Math.max(dp(24), (int)(startY + event.getRawY() - downY));
                    manager.updateViewLayout(bubble,bubbleParams); return true;
                case MotionEvent.ACTION_UP:
                    float dx = Math.abs(event.getRawX()-downX), dy = Math.abs(event.getRawY()-downY);
                    if (dx < dp(8) && dy < dp(8)) togglePanel();
                    else {
                        int screen = getResources().getDisplayMetrics().widthPixels;
                        bubbleParams.x = bubbleParams.x + dp(28) < screen/2 ? dp(4) : screen - dp(60);
                        manager.updateViewLayout(bubble,bubbleParams);
                    }
                    return true;
            }
            return false;
        });
        manager.addView(bubble,bubbleParams);
    }

    private void togglePanel() {
        if (expanded) { hidePanel(); return; }
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(8),dp(8),dp(8),dp(8)); box.setBackground(shape(Color.rgb(13,27,52),22));
        TextView title = label("PLAYVERSE  ·  ARCADE",12,Color.WHITE);
        box.addView(title);
        TextView chat = label("  CHAT  ·  Abrir PLAYVERSE",13,Color.WHITE);
        chat.setBackground(shape(Color.rgb(30,64,100),14)); box.addView(chat);
        chat.setOnClickListener(v -> launchApp("chat"));
        TextView live = label("  EN DIRECTO  ·  Abrir PLAYVERSE",13,Color.WHITE);
        live.setBackground(shape(Color.rgb(153,61,65),14)); box.addView(live);
        live.setOnClickListener(v -> launchApp("live"));
        TextView rooms = label("  SALAS  ·  Multijugador",13,Color.WHITE);
        rooms.setBackground(shape(Color.rgb(26,105,83),14)); box.addView(rooms);
        rooms.setOnClickListener(v -> launchApp("lobbies"));
        TextView clubs = label("  COMUNIDAD  ·  Clubs",13,Color.WHITE);
        clubs.setBackground(shape(Color.rgb(94,66,139),14)); box.addView(clubs);
        clubs.setOnClickListener(v -> launchApp("clubs"));
        TextView hide = label("Ocultar burbuja",12,Color.LTGRAY); box.addView(hide);
        hide.setOnClickListener(v -> { hidePanel(); stopSelf(); });
        panel = box;
        panelParams = params(224,-2,Gravity.TOP | Gravity.LEFT);
        panelParams.x = Math.max(dp(8), Math.min(bubbleParams.x - dp(165), getResources().getDisplayMetrics().widthPixels - dp(232)));
        panelParams.y = Math.max(dp(30), Math.min(bubbleParams.y - dp(110), getResources().getDisplayMetrics().heightPixels - dp(260)));
        manager.addView(panel,panelParams);
        android.view.animation.Animation entrance = android.view.animation.AnimationUtils.loadAnimation(this, R.anim.playverse_panel_enter);
        panel.startAnimation(entrance);
        expanded = true;
    }

    private void launchApp(String action) {
        try {
            getSharedPreferences("playverse_floating", MODE_PRIVATE).edit().putString("pending_action", action).apply();
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP); startActivity(intent); }
        } finally { hidePanel(); }
    }

    private void hidePanel() {
        if (panel != null) {
            final View closingPanel = panel;
            android.view.animation.Animation exit = android.view.animation.AnimationUtils.loadAnimation(this, R.anim.playverse_panel_exit);
            exit.setAnimationListener(new android.view.animation.Animation.AnimationListener() {
                @Override public void onAnimationStart(android.view.animation.Animation animation) {}
                @Override public void onAnimationRepeat(android.view.animation.Animation animation) {}
                @Override public void onAnimationEnd(android.view.animation.Animation animation) {
                    try { manager.removeView(closingPanel); } catch (Exception ignored) {}
                }
            });
            closingPanel.startAnimation(exit);
            panel = null;
        }
        expanded = false;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
    @Override public void onDestroy() { hidePanel(); if (bubble != null) { try { manager.removeView(bubble); } catch (Exception ignored) {} bubble = null; } super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
`;
fs.writeFileSync(path.join(path.dirname(activityPath), 'FloatingControlsService.java'), serviceSource);
if (!manifest.includes('FloatingControlsService')) {
  manifest = manifest.replace('</application>', '        <service android:name=".FloatingControlsService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="specialUse">\n            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="User-requested floating in-game controls" />\n        </service>\n    </application>');
  fs.writeFileSync(manifestPath, manifest);
}

if (!activity.includes('OverlayPermissionPlugin.class')) {
  activity = activity.replace(/public class MainActivity extends BridgeActivity\s*\{/, `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(OverlayPermissionPlugin.class);
        super.onCreate(savedInstanceState);
    }
`);
  if (!activity.includes('OverlayPermissionPlugin.class')) throw new Error('Could not safely register OverlayPermissionPlugin in MainActivity.');
  fs.writeFileSync(activityPath, activity);
}

console.log('PLAYVERSE: official icon installed for Android launcher; branded splash and overlay permission bridge configured for Android.');
