package com.teswa.mobile.feature.stories

import android.content.Intent
import android.net.Uri
import android.widget.ImageView
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.performTeswa
import kotlinx.coroutines.launch

@Composable
fun StoryCreateScreen(
    initialSession: AuthSession,
    repository: StoryRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onPublished: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val resolver = remember(context) { StoryMediaResolver(context) }
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(StoryDraft()) }
    var publishing by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf<StoryPublishProgress?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var session by remember(initialSession.user.id) { mutableStateOf(initialSession) }
    var cameraTarget by remember { mutableStateOf<StoryCameraTarget?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            resolver.resolve(uri)?.let { media ->
                draft = draft.copy(media = media)
                message = null
            } ?: run { message = "تعذر قراءة الملف أو نوعه وحجمه غير مدعومين." }
        }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val target = cameraTarget
        cameraTarget = null
        if (captured && target != null) {
            resolver.resolve(target.uri)?.let { media ->
                draft = draft.copy(media = media)
                message = null
            } ?: run {
                target.discard()
                message = "تعذر قراءة الصورة الملتقطة."
            }
        } else {
            target?.discard()
        }
    }
    BackHandler(enabled = !publishing, onBack = onBack)

    Column(modifier.fillMaxSize().imePadding()) {
        TeswaFocusedHeader(title = "حكاية جديدة", onBack = onBack)
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(TeswaLayout.FocusedContentPadding),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                Text("لحظة خفيفة", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(
                    "صورة أو فيديو يختفي تلقائيًا بعد 24 ساعة ويضيف سياق للناس.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Surface(
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f),
            ) {
                Column(
                    Modifier.fillMaxWidth().padding(TeswaSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                ) {
                    val media = draft.media
                    if (media != null) {
                        StoryLocalPreview(media, Modifier.fillMaxWidth().height(360.dp))
                        Text(
                            if (media.mediaType == "video") "فيديو · حتى دقيقتين" else "صورة جاهزة",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    } else {
                        Column(
                            Modifier.fillMaxWidth().height(180.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("اختار لحظة تستاهل تتشاف", style = MaterialTheme.typography.titleMedium)
                            Text("JPG، PNG، WebP، MP4 أو MOV", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        TeswaPrimaryAction(
                            text = if (media == null) "اختار من الجهاز" else "غيّر الملف",
                            icon = TeswaIcons.Gallery,
                            enabled = !publishing,
                            modifier = Modifier.weight(1f),
                            onClick = { picker.launch(arrayOf("image/*", "video/*")) },
                        )
                        TeswaSecondaryAction(
                            text = "الكاميرا",
                            icon = TeswaIcons.Camera,
                            enabled = !publishing,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                resolver.createCameraTarget().also {
                                    cameraTarget = it
                                    camera.launch(it.uri)
                                }
                            },
                        )
                    }
                }
            }

            TeswaTextField(
                value = draft.caption,
                onValueChange = { draft = draft.copy(caption = it.take(220)) },
                label = "تعليق بسيط",
                placeholder = "إيه الحكاية؟",
                supportingText = "${draft.caption.length}/220",
                singleLine = false,
                minLines = 3,
                maxLines = 5,
                enabled = !publishing,
            )

            message?.let {
                TeswaInlineMessage(
                    title = "الحكاية محتاجة مراجعة",
                    body = it,
                    emphasis = TeswaEmphasis.Strong,
                )
            }
            progress?.let {
                val percent = (it as? StoryPublishProgress.Uploading)?.percent
                Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    if (percent != null) {
                        LinearProgressIndicator(progress = { percent / 100f }, modifier = Modifier.fillMaxWidth())
                    } else {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    Text(progressLabel(it), style = MaterialTheme.typography.bodySmall)
                }
            }

            TeswaPrimaryAction(
                text = if (publishing) "جاري النشر…" else "انشر الحكاية",
                icon = TeswaIcons.PutIntoPlay,
                loading = publishing,
                enabled = draft.media != null,
                onClick = {
                    draft.validate()?.let { message = it } ?: scope.launch {
                        haptics.performTeswa(TeswaHapticEvent.Commit)
                        publishing = true
                        message = null
                        when (val result = repository.publish(session, draft) { progress = it }) {
                            is StoryResult.Success -> {
                                session = result.session
                                onSessionUpdated(session)
                                haptics.performTeswa(TeswaHapticEvent.Success)
                                onPublished()
                            }
                            is StoryResult.Failure -> {
                                result.session?.let {
                                    session = it
                                    onSessionUpdated(it)
                                }
                                if (result.unauthorized) onSessionExpired() else message = result.message
                            }
                        }
                        publishing = false
                        progress = null
                    }
                },
            )
        }
    }
}

@Composable
private fun StoryLocalPreview(media: StoryMediaSelection, modifier: Modifier) {
    val uri = remember(media.uri) { Uri.parse(media.uri) }
    if (media.mediaType == "video") {
        AndroidView(
            modifier = modifier,
            factory = { context ->
                VideoView(context).apply {
                    setVideoURI(uri)
                    setOnPreparedListener {
                        it.isLooping = true
                        start()
                    }
                }
            },
            onRelease = { it.stopPlayback() },
        )
    } else {
        AndroidView(
            modifier = modifier,
            factory = { context ->
                ImageView(context).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    setImageURI(uri)
                }
            },
            update = { it.setImageURI(uri) },
        )
    }
}

private fun progressLabel(progress: StoryPublishProgress) = when (progress) {
    is StoryPublishProgress.Uploading -> "رفع الوسائط — ${progress.percent}%"
    StoryPublishProgress.Saving -> "بنثبت الحكاية…"
    StoryPublishProgress.CleaningUp -> "بننظف محاولة غير مكتملة…"
}
