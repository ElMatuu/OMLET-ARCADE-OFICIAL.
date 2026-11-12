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
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class ArcadeHudService extends Service {
    public static final String ACTION_SHOW = "com.playverse.app.hud.SHOW";
    public static final String ACTION_STOP = "com.playverse.app.hud.STOP";
    private static final String CHANNEL_ID = "playverse_hud";
    private static final int NOTIFICATION_ID = 7411;

    private WindowManager windowManager;
    private View bubble;
    private View panel;
    private WindowManager.LayoutParams bubbleParams;
    private WindowManager.LayoutParams panelParams;

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("PLAYVERSE HUD activo")
            .setContentText("Controles flotantes disponibles. La transmisión no se inicia automáticamente.")
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        showBubble();
        return START_STICKY;
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
            windowManager.removeView(panel);
            panel = null;
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
        status.setText("HUD activo · transmisión no iniciada");
        status.setTextColor(Color.LTGRAY);
        status.setTextSize(12);
        status.setPadding(0, 8, 0, 12);
        card.addView(status);

        Button returnButton = new Button(this);
        returnButton.setText("Abrir PLAYVERSE");
        returnButton.setOnClickListener(v -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
            }
        });
        card.addView(returnButton);

        Button closeButton = new Button(this);
        closeButton.setText("Cerrar HUD");
        closeButton.setOnClickListener(v -> stopSelf());
        card.addView(closeButton);

        panel = card;
        panelParams = baseParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT);
        panelParams.gravity = Gravity.TOP | Gravity.START;
        panelParams.x = bubbleParams.x;
        panelParams.y = bubbleParams.y + 64;
        windowManager.addView(panel, panelParams);
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
