package com.playverse.app.plugins;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ArcadeHud")
public class ArcadeHudPlugin extends Plugin {
    @PluginMethod
    public void hasOverlayPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void startHud(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("Falta el permiso de superposición. Concedelo en Ajustes y volvé a intentar.");
            return;
        }
        Intent intent = new Intent(getContext(), ArcadeHudService.class);
        intent.setAction(ArcadeHudService.ACTION_SHOW);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        android.content.SharedPreferences preferences = getContext().getSharedPreferences("arcade_hud", android.content.Context.MODE_PRIVATE);
        String action = preferences.getString("pending_action", "");
        preferences.edit().remove("pending_action").apply();
        JSObject result = new JSObject();
        result.put("action", action);
        call.resolve(result);
    }

    @PluginMethod
    public void updateHudChat(PluginCall call) {
        android.content.SharedPreferences preferences = getContext().getSharedPreferences("arcade_hud", android.content.Context.MODE_PRIVATE);
        if (!preferences.getBoolean("hud_enabled", false)) {
            JSObject result = new JSObject();
            result.put("updated", false);
            call.resolve(result);
            return;
        }
        String messages = call.getString("messages");
        if (messages == null) messages = "[]";
        Intent intent = new Intent(getContext(), ArcadeHudService.class);
        intent.setAction(ArcadeHudService.ACTION_CHAT_UPDATE);
        intent.putExtra("messages", messages);
        getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("updated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopHud(PluginCall call) {
        Intent intent = new Intent(getContext(), ArcadeHudService.class);
        intent.setAction(ArcadeHudService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }
}
