package com.playverse.app.plugins

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
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@CapacitorPlugin(name = "NativeScreenShare")
class NativeScreenSharePlugin : Plugin() {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile private var room: Room? = null
    @Volatile private var screenShareActive = false
    @Volatile private var startPending = false
    @Volatile private var captureGeneration = 0L
    @Volatile private var pendingGeneration = 0L

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

        synchronized(this) {
            if (room != null && screenShareActive) {
                call.resolve(JSObject().apply { put("active", true) })
                return
            }
            if (startPending) {
                call.reject("Ya hay una solicitud de captura en curso.")
                return
            }
            startPending = true
            pendingGeneration = ++captureGeneration
        }

        try {
            val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            startActivityForResult(call, manager.createScreenCaptureIntent(), "handleScreenCaptureResult")
        } catch (error: Exception) {
            synchronized(this) {
                if (pendingGeneration == captureGeneration) {
                    startPending = false
                    pendingGeneration = 0L
                }
            }
            call.reject("No se pudo abrir el permiso de captura de Android: " + (error.message ?: "error desconocido"))
        }
    }

    @ActivityCallback
    private fun handleScreenCaptureResult(call: PluginCall, result: ActivityResult) {
        val requestGeneration = pendingGeneration
        if (!startPending || requestGeneration == 0L || requestGeneration != captureGeneration) {
            call.reject("La solicitud de captura fue cancelada.")
            return
        }
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            synchronized(this) {
                if (requestGeneration == captureGeneration) {
                    startPending = false
                    pendingGeneration = 0L
                }
            }
            call.reject("Cancelaste el permiso para compartir la pantalla.")
            return
        }

        val projectionData = result.data!!
        pluginScope.launch {
            var pendingRoom: Room? = null
            try {
                val service = Intent(context, ArcadeHudService::class.java)
                    .setAction(ArcadeHudService.ACTION_CAPTURE_START)
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service) else context.startService(service)

                val connectedRoom = withContext(Dispatchers.IO) {
                    if (requestGeneration != captureGeneration) throw CancellationException("Solicitud de captura cancelada.")
                    val candidate = LiveKit.create(context.applicationContext)
                    pendingRoom = candidate
                    candidate.connect(call.getString("url")!!.trim(), call.getString("token")!!.trim())
                    if (requestGeneration != captureGeneration) throw CancellationException("Solicitud de captura cancelada.")
                    val published = candidate.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(projectionData))
                    if (!published) throw IllegalStateException("LiveKit no pudo publicar la captura de pantalla.")
                    candidate
                }

                if (requestGeneration != captureGeneration) {
                    withContext(Dispatchers.IO) { connectedRoom.disconnect() }
                    throw CancellationException("La transmisión se cerró durante el inicio de la captura.")
                }

                synchronized(this@NativeScreenSharePlugin) {
                    room = connectedRoom
                    screenShareActive = true
                    startPending = false
                    pendingGeneration = 0L
                }
                call.resolve(JSObject().apply { put("active", true); put("screenShare", true) })
            } catch (error: Exception) {
                try { withContext(Dispatchers.IO) { pendingRoom?.disconnect() } } catch (_: Exception) {}
                context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAPTURE_STOP))
                synchronized(this@NativeScreenSharePlugin) {
                    if (requestGeneration == captureGeneration) {
                        startPending = false
                        pendingGeneration = 0L
                    }
                }
                call.reject("No se pudo iniciar la captura nativa: " + (error.message ?: "error desconocido"))
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val currentRoom: Room?
        synchronized(this) {
            captureGeneration += 1
            pendingGeneration = 0L
            startPending = false
            currentRoom = room
            room = null
            screenShareActive = false
        }

        pluginScope.launch {
            var failure: Exception? = null
            try {
                if (currentRoom != null) {
                    withContext(Dispatchers.IO) {
                        try {
                            currentRoom.localParticipant.setScreenShareEnabled(false)
                        } finally {
                            currentRoom.disconnect()
                        }
                    }
                }
            } catch (error: Exception) {
                failure = error
            } finally {
                try {
                    context.startService(Intent(context, ArcadeHudService::class.java).setAction(ArcadeHudService.ACTION_CAPTURE_STOP))
                } catch (error: Exception) {
                    if (failure == null) failure = error
                }
            }

            if (failure != null) {
                call.reject("No se pudo detener la captura nativa: " + (failure.message ?: "error desconocido"))
            } else {
                call.resolve(JSObject().apply { put("active", false) })
            }
        }
    }
}
