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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.teswa.mobile.auth.AuthSession
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
    val resolver = remember(context) { StoryMediaResolver(context) }
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(StoryDraft()) }
    var publishing by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf<StoryPublishProgress?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var session by remember(initialSession.user.id) { mutableStateOf(initialSession) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val media = resolver.resolve(uri)
            if (media == null) message = "تعذر قراءة الملف أو نوعه وحجمه غير مدعومين."
            else {
                draft = draft.copy(media = media)
                message = null
            }
        }
    }
    BackHandler(enabled = !publishing, onBack = onBack)

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text("قصة جديدة", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("لحظة خفيفة تختفي تلقائيًا بعد 24 ساعة.", style = MaterialTheme.typography.bodyMedium)
            }
            OutlinedButton(onClick = onBack, enabled = !publishing) { Text("رجوع") }
        }
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .45f),
        ) {
            Column(
                Modifier.fillMaxWidth().padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("الصورة أو الفيديو", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                val media = draft.media
                if (media != null) {
                    StoryLocalPreview(media, Modifier.fillMaxWidth().height(360.dp))
                    Text(
                        if (media.mediaType == "video") "فيديو • حتى دقيقتين" else "صورة",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Surface(
                        Modifier.fillMaxWidth().height(180.dp),
                        shape = RoundedCornerShape(24.dp),
                        color = MaterialTheme.colorScheme.surface,
                    ) {
                        Column(
                            Modifier.padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("اختار لحظة تستاهل تتشاف", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(6.dp))
                            Text("JPG، PNG، WebP، MP4 أو MOV", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Button(
                    onClick = { picker.launch(arrayOf("image/*", "video/*")) },
                    enabled = !publishing,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (media == null) "اختيار من الجهاز" else "تغيير الملف") }
            }
        }
        Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
            Column(Modifier.fillMaxWidth().padding(18.dp)) {
                Text("تعليق بسيط", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = draft.caption,
                    onValueChange = { draft = draft.copy(caption = it.take(220)) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("إيه الحكاية؟") },
                    minLines = 3,
                    maxLines = 5,
                    enabled = !publishing,
                )
                Text("${draft.caption.length}/220", style = MaterialTheme.typography.labelSmall)
            }
        }
        message?.let {
            Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.errorContainer) {
                Text(it, Modifier.fillMaxWidth().padding(13.dp), color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
        progress?.let {
            val percent = (it as? StoryPublishProgress.Uploading)?.percent
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                if (percent != null) LinearProgressIndicator(
                    progress = { percent / 100f },
                    modifier = Modifier.fillMaxWidth(),
                ) else LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Text(progressLabel(it), style = MaterialTheme.typography.bodySmall)
            }
        }
        Button(
            onClick = {
                draft.validate()?.let { message = it } ?: scope.launch {
                    publishing = true
                    message = null
                    when (val result = repository.publish(session, draft) { progress = it }) {
                        is StoryResult.Success -> {
                            session = result.session
                            onSessionUpdated(session)
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
            enabled = !publishing && draft.media != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (publishing) {
                CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.padding(horizontal = 5.dp))
            }
            Text(if (publishing) "جاري النشر…" else "نشر القصة")
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
    StoryPublishProgress.Saving -> "بنثبت القصة…"
    StoryPublishProgress.CleaningUp -> "بننظف محاولة غير مكتملة…"
}
