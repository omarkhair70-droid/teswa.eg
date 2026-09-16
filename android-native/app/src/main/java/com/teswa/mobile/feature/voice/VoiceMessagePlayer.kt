package com.teswa.mobile.feature.voice

import android.media.MediaPlayer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun VoiceMessagePlayer(
    durationMs: Int?,
    loadUrl: suspend () -> String?,
) {
    val scope = rememberCoroutineScope()
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var loading by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    DisposableEffect(Unit) {
        onDispose { player?.let(VoicePlaybackCoordinator::release) }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(enabled = !loading, onClick = {
            val current = player
            if (current != null) {
                if (playing) current.pause() else current.start()
                playing = !playing
                return@TextButton
            }
            scope.launch {
                loading = true
                failed = false
                val url = loadUrl()
                if (url == null) {
                    failed = true
                    loading = false
                    return@launch
                }
                val value = MediaPlayer()
                runCatching {
                    value.setDataSource(url)
                    VoicePlaybackCoordinator.acquire(value) {
                        if (player === value) player = null
                        loading = false
                        playing = false
                    }
                    value.setOnPreparedListener {
                        loading = false
                        playing = true
                        it.start()
                    }
                    value.setOnCompletionListener {
                        playing = false
                        if (player === value) player = null
                        VoicePlaybackCoordinator.release(value)
                    }
                    value.setOnErrorListener { _, _, _ ->
                        loading = false
                        playing = false
                        failed = true
                        true
                    }
                    value.prepareAsync()
                    player = value
                }.onFailure {
                    VoicePlaybackCoordinator.release(value)
                    loading = false
                    failed = true
                }
            }
        }) { Text(if (loading) "…" else if (playing) "إيقاف" else "تشغيل") }
        Text(if (failed) "غير متاح" else formatVoiceDuration(durationMs))
    }
}

private object VoicePlaybackCoordinator {
    private var current: MediaPlayer? = null
    private var stopped: (() -> Unit)? = null

    fun acquire(player: MediaPlayer, onStopped: () -> Unit) {
        current?.let { runCatching { it.stop() }; runCatching { it.release() } }
        stopped?.invoke()
        current = player
        stopped = onStopped
    }

    fun release(player: MediaPlayer) {
        if (current === player) {
            runCatching { player.stop() }
            runCatching { player.release() }
            current = null
            stopped = null
        } else {
            runCatching { player.release() }
        }
    }
}

private fun formatVoiceDuration(value: Int?): String {
    val seconds = ((value ?: 0) / 1000).coerceAtLeast(0)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
