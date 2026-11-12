package com.playverse.app.plugins

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@CapacitorPlugin(
    name = "NativeScreenShare",
    permissions = [
        Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO]),
        Permission(alias = "camera", strings = [Manifest.permission.CAMERA])
    ]
)
class NativeScreenSharePlugin : Plugin() {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    @Volatile private var room: Room? = null
    @Volatile private var screenShareActive = false

    @PluginMethod
    fun start(call: PluginCall) {
        val url = call.getString("url")?.trim().orEmpty()
        val token = call.getString("token")?.trim().orEmpty()
        if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
            call.reject("La dirección de LiveKit no es válida.")
            return
        }
        if (token.isBlank()) {
            call.reject("Falta el token temporal de LiveKit.")
            return
        }
        if (room != null && screenShareActive) {
            call.resolve(JSObject().apply { put("active", true) })
            return
        }
        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(call, manager.createScreenCaptureIntent(), "handleScreenCaptureResult")
    }

    @ActivityCallback
    private fun handleScreenCaptureResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Cancelaste el permiso para compartir la pantalla.")
            return
        }
        val url = call.getString("url")?.trim().orEmpty()
        val token = call.getString("token")?.trim().orEmpty()
        val projectionData = result.data!!
        pluginScope.launch {
            var connectedRoom: Room? = null
            var pendingRoom: Room? = null
            try {
                val service = Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAPTURE_START)
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service) else context.startService(service)
                connectedRoom = withContext(Dispatchers.IO) {
                    val created = LiveKit.create(context.applicationContext)
                    pendingRoom = created
                    created.connect(url, token)
                    val published = created.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(projectionData))
                    if (!published) throw IllegalStateException("LiveKit no pudo publicar la captura de pantalla.")
                    created
                }
                room = connectedRoom
                screenShareActive = true
                call.resolve(JSObject().apply { put("active", true); put("screenShare", true) })
            } catch (error: Exception) {
                try { (connectedRoom ?: pendingRoom)?.disconnect() } catch (_: Exception) {}
                context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAPTURE_STOP))
                call.reject("No se pudo iniciar la captura nativa: " + (error.message ?: "error desconocido"))
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        pluginScope.launch {
            var failure: Exception? = null
            try {
                val current = room
                if (current != null) {
                    withContext(Dispatchers.IO) {
                        try {
                            if (screenShareActive) current.localParticipant.setScreenShareEnabled(false)
                        } finally {
                            current.disconnect()
                        }
                    }
                }
            } catch (error: Exception) {
                failure = error
            } finally {
                room = null
                screenShareActive = false
                context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAPTURE_STOP))
                context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_MICROPHONE_STOP))
                context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAMERA_STOP))
            }
            if (failure != null) {
                call.reject("No se pudo detener la captura nativa: " + (failure.message ?: "error desconocido"))
            } else {
                call.resolve(JSObject().apply { put("active", false) })
            }
        }
    }

    @PluginMethod
    fun toggleMicrophone(call: PluginCall) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
            return
        }
        setMicrophone(call)
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Se necesita permiso de micrófono para emitir audio.")
            return
        }
        setMicrophone(call)
    }

    private fun setMicrophone(call: PluginCall) {
        val current = room
        if (current == null) {
            call.reject("Primero iniciá una transmisión con captura nativa.")
            return
        }
        pluginScope.launch {
            try {
                val enabled = !current.localParticipant.isMicrophoneEnabled
                if (enabled) context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_MICROPHONE_START))
                val changed = withContext(Dispatchers.IO) { current.localParticipant.setMicrophoneEnabled(enabled) }
                if (!changed) {
                    if (enabled) context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_MICROPHONE_STOP))
                    throw IllegalStateException("LiveKit no pudo cambiar el micrófono.")
                }
                if (!enabled) context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_MICROPHONE_STOP))
                call.resolve(JSObject().apply { put("enabled", enabled) })
            } catch (error: Exception) {
                call.reject("No se pudo cambiar el micrófono: " + (error.message ?: "error desconocido"))
            }
        }
    }

    @PluginMethod
    fun toggleCamera(call: PluginCall) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback")
            return
        }
        setCamera(call)
    }

    @PermissionCallback
    private fun cameraPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Se necesita permiso de cámara para activar la cámara.")
            return
        }
        setCamera(call)
    }

    private fun setCamera(call: PluginCall) {
        val current = room
        if (current == null) {
            call.reject("Primero iniciá una transmisión con captura nativa.")
            return
        }
        pluginScope.launch {
            try {
                val enabled = !current.localParticipant.isCameraEnabled
                if (enabled) context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAMERA_START))
                val changed = withContext(Dispatchers.IO) { current.localParticipant.setCameraEnabled(enabled) }
                if (!changed) {
                    if (enabled) context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAMERA_STOP))
                    throw IllegalStateException("LiveKit no pudo cambiar la cámara.")
                }
                if (!enabled) context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAMERA_STOP))
                call.resolve(JSObject().apply { put("enabled", enabled) })
            } catch (error: Exception) {
                call.reject("No se pudo cambiar la cámara: " + (error.message ?: "error desconocido"))
            }
        }
    }

}
