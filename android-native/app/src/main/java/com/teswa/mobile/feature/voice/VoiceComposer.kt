package com.teswa.mobile.feature.voice

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaIconAction
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaStatePill
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun VoiceComposer(
    enabled: Boolean,
    sending: Boolean,
    uploadProgress: Int?,
    onSend: suspend (VoiceDraft) -> Boolean,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val recorder = remember { AndroidVoiceRecorder(context) }
    val scope = rememberCoroutineScope()
    var recording by remember { mutableStateOf(false) }
    var elapsedMs by remember { mutableIntStateOf(0) }
    var draft by remember { mutableStateOf<VoiceDraft?>(null) }

    fun begin() {
        draft?.discard()
        draft = null
        elapsedMs = 0
        if (recorder.start()) recording = true else onError("تعذر بدء التسجيل. تأكد إن الميكروفون متاح.")
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) begin() else onError("فعّل إذن الميكروفون عشان تبعت رسالة صوتية.")
    }
    LaunchedEffect(recording) {
        while (recording) {
            delay(250)
            elapsedMs = (elapsedMs + 250).coerceAtMost(120_000)
            if (elapsedMs >= 120_000) {
                draft = recorder.stop()
                recording = false
                if (draft == null) onError("التسجيل لم يُحفظ. حاول تاني.")
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            recorder.cancel()
            draft?.discard()
        }
    }

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        when {
            recording -> {
                TeswaStatePill(
                    text = "تسجيل ${formatDuration(elapsedMs)}",
                    icon = TeswaIcons.Voice,
                    emphasis = TeswaEmphasis.Strong,
                )
                OutlinedButton(onClick = {
                    recorder.cancel()
                    recording = false
                    elapsedMs = 0
                }) { Text("إلغاء") }
                Button(onClick = {
                    draft = recorder.stop()
                    recording = false
                    if (draft == null) onError("التسجيل قصير جدًا أو لم يُحفظ.")
                }) { Text("إيقاف") }
            }
            draft != null -> {
                TeswaStatePill(
                    text = "صوت ${formatDuration(requireNotNull(draft).durationMs)}",
                    icon = TeswaIcons.Voice,
                )
                TeswaIconAction(
                    icon = TeswaIcons.Delete,
                    contentDescription = "حذف التسجيل",
                    enabled = !sending,
                    onClick = {
                    draft?.discard()
                    draft = null
                })
                TeswaIconAction(
                    icon = TeswaIcons.Send,
                    contentDescription = if (sending) "جاري إرسال الصوت" else "إرسال الصوت",
                    enabled = !sending,
                    onClick = {
                    val value = draft
                    if (value != null) {
                        scope.launch {
                            if (onSend(value)) {
                                value.discard()
                                if (draft === value) draft = null
                            }
                        }
                    }
                })
                if (sending) Text(uploadProgress?.let { "$it%" } ?: "…")
            }
            else -> {
                TeswaIconAction(
                    icon = TeswaIcons.Voice,
                    contentDescription = "رسالة صوتية",
                    enabled = enabled && !sending,
                    onClick = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) begin()
                        else permission.launch(Manifest.permission.RECORD_AUDIO)
                    },
                )
                Spacer(Modifier.width(2.dp))
            }
        }
    }
}

private fun formatDuration(durationMs: Int): String {
    val seconds = (durationMs / 1000).coerceAtLeast(0)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
