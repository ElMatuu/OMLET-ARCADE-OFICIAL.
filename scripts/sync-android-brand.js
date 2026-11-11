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
  '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
  '        <item name="android:background">@drawable/playverse_splash_background</item>',
  '    </style>',
  '</resources>'
].join(String.fromCharCode(10)) + String.fromCharCode(10);
fs.writeFileSync(path.join(v31, 'styles.xml'), splashStyles);

const overlayPermission = [
  '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
  '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />',\n  '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
].join(String.fromCharCode(10));
if (!manifest.includes('android.permission.SYSTEM_ALERT_WINDOW')) {
  const appAt = manifest.indexOf('<application');
  manifest = manifest.slice(0, appAt) + overlayPermission + '\n    ' + manifest.slice(appAt);
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
        TextView hide = label("Ocultar burbuja",12,Color.LTGRAY); box.addView(hide);
        hide.setOnClickListener(v -> { hidePanel(); stopSelf(); });
        panel = box;
        panelParams = params(224,-2,Gravity.TOP | Gravity.LEFT);
        panelParams.x = Math.max(dp(8), Math.min(bubbleParams.x - dp(165), getResources().getDisplayMetrics().widthPixels - dp(232)));
        panelParams.y = Math.max(dp(30), bubbleParams.y - dp(110));
        manager.addView(panel,panelParams); expanded = true;
    }

    private void launchApp(String action) {
        try {
            getSharedPreferences("playverse_floating", MODE_PRIVATE).edit().putString("pending_action", action).apply();
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP); startActivity(intent); }
        } finally { hidePanel(); }
    }

    private void hidePanel() {
        if (panel != null) { try { manager.removeView(panel); } catch (Exception ignored) {} panel = null; }
        expanded = false;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
    @Override public void onDestroy() { hidePanel(); if (bubble != null) { try { manager.removeView(bubble); } catch (Exception ignored) {} bubble = null; } super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
`;
fs.writeFileSync(path.join(path.dirname(activityPath), 'FloatingControlsService.java'), serviceSource);
if (!manifest.includes('FloatingControlsService')) {
  manifest = manifest.replace('</application>', '        <service android:name=".FloatingControlsService" android:exported="false" android:stopWithTask="false" />\n    </application>');
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
