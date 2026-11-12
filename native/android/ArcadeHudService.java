package com.playverse.app.plugins;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class ArcadeHudService extends Service {
    public static final String ACTION_SHOW = "com.playverse.app.hud.SHOW";
    public static final String ACTION_STOP = "com.playverse.app.hud.STOP";
    public static final String ACTION_CAPTURE_START = "com.playverse.app.hud.CAPTURE_START";
    public static final String ACTION_CAPTURE_STOP = "com.playverse.app.hud.CAPTURE_STOP";
    public static final String ACTION_MICROPHONE_START = "com.playverse.app.hud.MICROPHONE_START";
    public static final String ACTION_MICROPHONE_STOP = "com.playverse.app.hud.MICROPHONE_STOP";
    public static final String ACTION_CAMERA_START = "com.playverse.app.hud.CAMERA_START";
    public static final String ACTION_CAMERA_STOP = "com.playverse.app.hud.CAMERA_STOP";
    public static final String ACTION_CHAT_UPDATE = "com.playverse.app.hud.CHAT_UPDATE";
    private static final String CHANNEL_ID = "playverse_hud";
    private static final int NOTIFICATION_ID = 7411;

    private Notification foregroundNotification;
    private boolean captureActive;
    private boolean microphoneActive;
    private boolean cameraActive;
    private WindowManager windowManager;
    private View bubble;
    private View panel;
    private TextView chatPreview;
    private String chatPreviewText = "El chat del directo aparecerá acá cuando haya mensajes.";
    private WindowManager.LayoutParams bubbleParams;
    private WindowManager.LayoutParams panelParams;

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
        Notification.Builder notificationBuilder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        foregroundNotification = notificationBuilder
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("PLAYVERSE HUD activo")
            .setContentText("Controles flotantes disponibles. La transmisión no se inicia automáticamente.")
            .setOngoing(true)
            .build();
        refreshForegroundTypes();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_SHOW.equals(action)) getSharedPreferences("arcade_hud", MODE_PRIVATE).edit().putBoolean("hud_hidden", false).putBoolean("hud_enabled", true).apply();
        if (ACTION_STOP.equals(action)) {
            hideHud();
            if (captureActive || microphoneActive || cameraActive) {
                refreshForegroundTypes();
                return START_STICKY;
            }
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_CAPTURE_START.equals(action)) captureActive = true;
        if (ACTION_CAPTURE_STOP.equals(action)) captureActive = false;
        if (ACTION_MICROPHONE_START.equals(action)) microphoneActive = true;
        if (ACTION_MICROPHONE_STOP.equals(action)) microphoneActive = false;
        if (ACTION_CAMERA_START.equals(action)) cameraActive = true;
        if (ACTION_CAMERA_STOP.equals(action)) cameraActive = false;
        if (ACTION_CHAT_UPDATE.equals(action) && intent != null) {
            chatPreviewText = formatChatPreview(intent.getStringExtra("messages"));
            if (chatPreview != null) chatPreview.setText(chatPreviewText);
        }
        refreshForegroundTypes();
        if (!Settings.canDrawOverlays(this)) {
            hideHud();
            if (!captureActive && !microphoneActive && !cameraActive) {
                stopSelf();
                return START_NOT_STICKY;
            }
        } else if (!getSharedPreferences("arcade_hud", MODE_PRIVATE).getBoolean("hud_hidden", false)) {
            showBubble();
        }
        return START_STICKY;
    }

    private void refreshForegroundTypes() {
        if (foregroundNotification == null) return;
        if (Build.VERSION.SDK_INT >= 34) {
            int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            if (captureActive) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
            if (microphoneActive) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (cameraActive) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            startForeground(NOTIFICATION_ID, foregroundNotification, types);
        } else {
            startForeground(NOTIFICATION_ID, foregroundNotification);
        }
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private WindowManager.LayoutParams baseParams(int width, int height) {
        return new WindowManager.LayoutParams(width, height, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
    }

    private void showBubble() {
        if (bubble != null) return;
        TextView view = new TextView(this);
        view.setText("PV");
        view.setTextColor(Color.WHITE);
        view.setTextSize(15);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(null, 1);
        view.setBackground(makeBackground(Color.rgb(245, 104, 68), 48));
        bubble = view;
        bubbleParams = baseParams(56, 56);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = 16;
        bubbleParams.y = 180;
        view.setOnTouchListener(new View.OnTouchListener() {
            private int startX, startY;
            private float downX, downY;
            private boolean dragged;
            @Override public boolean onTouch(View v, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_DOWN) {
                    startX = bubbleParams.x; startY = bubbleParams.y;
                    downX = event.getRawX(); downY = event.getRawY(); dragged = false;
                    return true;
                }
                if (event.getAction() == MotionEvent.ACTION_MOVE) {
                    int dx = (int) (event.getRawX() - downX);
                    int dy = (int) (event.getRawY() - downY);
                    if (Math.abs(dx) + Math.abs(dy) > 8) dragged = true;
                    bubbleParams.x = Math.max(0, startX + dx);
                    bubbleParams.y = Math.max(0, startY + dy);
                    windowManager.updateViewLayout(bubble, bubbleParams);
                    return true;
                }
                if (event.getAction() == MotionEvent.ACTION_UP) {
                    if (!dragged) togglePanel();
                    return true;
                }
                return true;
            }
        });
        windowManager.addView(bubble, bubbleParams);
    }

    private android.graphics.drawable.GradientDrawable makeBackground(int color, int radius) {
        android.graphics.drawable.GradientDrawable shape = new android.graphics.drawable.GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        shape.setStroke(2, Color.WHITE);
        return shape;
    }

    private void togglePanel() {
        if (panel != null) {
            removePanelAnimated();
            return;
        }
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(22, 18, 22, 18);
        card.setBackground(makeBackground(Color.rgb(15, 23, 42), 24));

        TextView title = new TextView(this);
        title.setText("PLAYVERSE · HUD");
        title.setTextColor(Color.WHITE);
        title.setTextSize(16);
        title.setTypeface(null, 1);
        card.addView(title);

        TextView status = new TextView(this);
        status.setText("Controles de directo y comunidad");
        status.setTextColor(Color.LTGRAY);
        status.setTextSize(12);
        status.setPadding(0, 8, 0, 12);
        card.addView(status);

        TextView chatHeading = new TextView(this);
        chatHeading.setText("CHAT DEL DIRECTO");
        chatHeading.setTextColor(Color.rgb(251, 146, 60));
        chatHeading.setTextSize(10);
        chatHeading.setTypeface(null, 1);
        chatHeading.setPadding(0, 10, 0, 4);
        card.addView(chatHeading);

        chatPreview = new TextView(this);
        chatPreview.setText(chatPreviewText);
        chatPreview.setTextColor(Color.WHITE);
        chatPreview.setTextSize(11);
        chatPreview.setMaxLines(6);
        chatPreview.setPadding(10, 8, 10, 8);
        chatPreview.setBackground(makeBackground(Color.rgb(30, 41, 59), 12));
        card.addView(chatPreview);

        Button returnButton = new Button(this);
        returnButton.setText("Abrir PLAYVERSE");
        returnButton.setOnClickListener(v -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
            }
        });
        card.addView(returnButton);
        addActionButton(card, "Capturar juego", "screen_share_toggle");
        addActionButton(card, "Micrófono", "microphone_toggle");
        addActionButton(card, "Cámara", "camera_toggle");
        addActionButton(card, "Finalizar directo", "end_stream");
        addActionButton(card, "Responder en PLAYVERSE", "stream_chat");
        addActionButton(card, "Chat", "chat");
        addActionButton(card, "Directos", "live");
        addActionButton(card, "Salas", "lobbies");
        addActionButton(card, "Clubes", "clubs");

        Button closeButton = new Button(this);
        closeButton.setText("Ocultar HUD");
        closeButton.setOnClickListener(v -> {
            hideHud();
            if (!captureActive && !microphoneActive && !cameraActive) stopSelf();
        });
        card.addView(closeButton);

        panel = card;
        panelParams = baseParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT);
        panelParams.gravity = Gravity.TOP | Gravity.START;
        panelParams.x = bubbleParams.x;
        panelParams.y = bubbleParams.y + 64;
        windowManager.addView(panel, panelParams);
        panel.startAnimation(AnimationUtils.loadAnimation(this, R.anim.playverse_panel_enter));
    }

    private void removePanelAnimated() {
        if (panel == null) return;
        final View closingPanel = panel;
        panel = null;
        Animation exit = AnimationUtils.loadAnimation(this, R.anim.playverse_panel_exit);
        exit.setAnimationListener(new Animation.AnimationListener() {
            @Override public void onAnimationStart(Animation animation) {}
            @Override public void onAnimationRepeat(Animation animation) {}
            @Override public void onAnimationEnd(Animation animation) {
                try { windowManager.removeView(closingPanel); }
                catch (IllegalArgumentException ignored) {}
            }
        });
        closingPanel.startAnimation(exit);
    }

    private String formatChatPreview(String rawMessages) {
        if (rawMessages == null || rawMessages.trim().isEmpty()) return "El chat del directo aparecerá acá cuando haya mensajes.";
        try {
            org.json.JSONArray messages = new org.json.JSONArray(rawMessages);
            StringBuilder preview = new StringBuilder();
            int start = Math.max(0, messages.length() - 6);
            for (int i = start; i < messages.length(); i++) {
                org.json.JSONObject item = messages.optJSONObject(i);
                if (item == null) continue;
                String username = item.optString("username", "Jugador");
                String message = item.optString("message", "");
                if (message.trim().isEmpty()) continue;
                if (preview.length() > 0) preview.append("\n");
                preview.append("@").append(username).append(": ").append(message);
            }
            return preview.length() == 0 ? "Todavía no hay mensajes." : preview.toString();
        } catch (org.json.JSONException error) {
            return "No se pudo actualizar la vista previa del chat.";
        }
    }

    private void hideHud() {
        getSharedPreferences("arcade_hud", MODE_PRIVATE).edit().putBoolean("hud_hidden", true).putBoolean("hud_enabled", false).apply();
        removePanelAnimated();
        if (bubble != null) {
            try { windowManager.removeView(bubble); } catch (IllegalArgumentException ignored) {}
            bubble = null;
        }
    }

    private void addActionButton(LinearLayout card, String label, String action) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(v -> openApp(action));
        card.addView(button);
    }

    private void openApp(String action) {
        getSharedPreferences("arcade_hud", MODE_PRIVATE).edit().putString("pending_action", action).apply();
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(launch);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "Controles flotantes PLAYVERSE", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Notifica cuando el HUD flotante está activo.");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (panel != null) { windowManager.removeView(panel); panel = null; }
        if (bubble != null) { windowManager.removeView(bubble); bubble = null; }
        stopForeground(true);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
