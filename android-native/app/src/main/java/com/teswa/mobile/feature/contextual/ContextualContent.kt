package com.teswa.mobile.feature.contextual

import android.content.Intent
import android.net.Uri

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun ContextualContent(
    holder: ContextualStateHolder,
    voiceMediaRepository: VoiceMediaRepository,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(holder.thread?.conversation?.id) {
        while (isActive) {
            delay(30_000)
            val current = holder.thread
            if (current == null) holder.load(silent = true) else holder.reloadThread()
        }
    }

    holder.thread?.let {
        ContextualThreadContent(holder, it, voiceMediaRepository, modifier)
        return
    }

    when (val state = holder.state) {
        ContextualUiState.Loading -> TeswaInlineLoading(
            "بنرجّع الردود لسياقها…",
            modifier.padding(TeswaLayout.ScreenHorizontal),
        )
        is ContextualUiState.Error -> TeswaInlineMessage(
            title = "ردود القصص مش متاحة",
            body = state.message,
            icon = TeswaIcons.Refresh,
            emphasis = TeswaEmphasis.Strong,
            actionLabel = "حاول تاني",
            onAction = { scope.launch { holder.load() } },
            modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
        )
        is ContextualUiState.Ready -> if (state.items.isEmpty()) {
            TeswaEmptyField(
                title = "مفيش كلام بدأ من قصة",
                body = "لما رد يفتح كلام، السبب اللي بدأه يفضل محفوظ هنا بدل ما يتحول لشات بلا سياق.",
                modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
            )
        } else {
            LazyColumn(
                modifier.fillMaxSize(),
                contentPadding = TeswaLayout.RootContentPadding,
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                item {
                    TeswaTraceNote("كل سطر هنا بدأ من لحظة محددة. السياق يفضل مع الكلام عشان ما يبقاش مجرد inbox تاني.")
                }
                items(state.items, key = { it.id }) { value ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { scope.launch { holder.open(value) } }
                            .padding(vertical = TeswaSpacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                    ) {
                        TeswaPersonIdentity(
                            name = value.other.displayName ?: value.other.username ?: "مستخدم تِسوى",
                            avatarUrl = value.other.avatarUrl,
                            supporting = value.latestBody
                                ?: value.context.caption
                                ?: if (value.context.mediaType == "video") "الكلام بدأ من فيديو" else "الكلام بدأ من قصة",
                            evidence = if (value.unreadCount > 0) {
                                "${value.unreadCount} جديد"
                            } else {
                                contextualOriginLabel(value.context)
                            },
                            modifier = Modifier.weight(1f),
                        )
                        TeswaStatePill("من قصة", emphasis = TeswaEmphasis.Quiet)
                    }
                }
            }
        }
    }
}

private fun contextualOriginLabel(value: ContextualStoryContext): String = when {
    !value.caption.isNullOrBlank() -> "من قصة: ${value.caption.take(42)}"
    value.mediaType == "video" -> "بدأت من فيديو"
    value.mediaType == "image" -> "بدأت من صورة"
    else -> "سياق القصة محفوظ"
}

@Composable
private fun ContextualOriginCard(
    holder: ContextualStateHolder,
    context: ContextualStoryContext,
    mediaRepository: VoiceMediaRepository,
) {
    val androidContext = LocalContext.current
    var signedUrl by remember(context.mediaStoragePath) { mutableStateOf<String?>(null) }
    var mediaMissing by remember(context.mediaStoragePath) { mutableStateOf(false) }
    var fullScreen by remember(context.storyId) { mutableStateOf(false) }

    LaunchedEffect(context.mediaStoragePath) {
        val path = context.mediaStoragePath
        if (path.isNullOrBlank()) {
            mediaMissing = true
        } else {
            when (val result = mediaRepository.signedUrl(holder.session, "story_media", path)) {
                is VoiceMediaResult.Success -> {
                    holder.updateSession(result.session)
                    signedUrl = result.value
                    mediaMissing = false
                }
                is VoiceMediaResult.Failure -> {
                    result.session?.let(holder::updateSession)
                    signedUrl = null
                    mediaMissing = true
                }
            }
        }
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .28f),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(
            modifier = Modifier.padding(TeswaSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            Text(
                text = "اللحظة اللي بدأت الكلام",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.secondary,
                fontWeight = FontWeight.Bold,
            )

            if (context.mediaType == "image" && signedUrl != null) {
                NetworkImage(
                    url = signedUrl,
                    contentDescription = context.caption ?: "القصة الأصلية",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(150.dp)
                        .clickable { fullScreen = true },
                    contentScale = ContentScale.Crop,
                )
            } else if (context.mediaType == "video" && signedUrl != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            runCatching {
                                androidContext.startActivity(
                                    Intent(Intent.ACTION_VIEW).apply {
                                        setDataAndType(Uri.parse(signedUrl), "video/*")
                                    },
                                )
                            }.onFailure {
                                holder.showMessage("مفيش تطبيق على الجهاز يفتح الفيديو ده.")
                            }
                        },
                    color = MaterialTheme.colorScheme.surface.copy(alpha = .72f),
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Column(
                        modifier = Modifier.padding(TeswaSpacing.md),
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        Text("فيديو من القصة", fontWeight = FontWeight.SemiBold)
                        Text(
                            "افتح الفيديو الأصلي",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Text(
                text = context.caption?.takeIf(String::isNotBlank)
                    ?: when (context.mediaType) {
                        "video" -> "القصة كانت فيديو"
                        "image" -> "القصة كانت صورة"
                        else -> "القصة الأصلية"
                    },
                style = MaterialTheme.typography.bodyMedium,
            )

            val trace = buildList {
                context.createdAt?.take(10)?.takeIf(String::isNotBlank)?.let(::add)
                if (mediaMissing && context.mediaStoragePath != null) add("الميديا نفسها لم تعد متاحة")
            }.joinToString(" · ")
            if (trace.isNotBlank()) {
                Text(
                    text = trace,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    if (fullScreen && signedUrl != null) {
        Dialog(
            onDismissRequest = { fullScreen = false },
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
            ) {
                NetworkImage(
                    url = signedUrl,
                    contentDescription = context.caption ?: "القصة الأصلية",
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(vertical = 64.dp),
                    contentScale = ContentScale.Fit,
                )
                TextButton(
                    onClick = { fullScreen = false },
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(TeswaSpacing.lg),
                ) {
                    Text("إغلاق", color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun ContextualThreadContent(
    holder: ContextualStateHolder,
    thread: ContextualThread,
    voiceMediaRepository: VoiceMediaRepository,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(title = "كلام بدأ من قصة", onBack = holder::close)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TeswaLayout.ScreenHorizontal),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            TeswaArchiveLabel("CONTEXT / STORY")
            ContextualOriginCard(
                holder = holder,
                context = thread.conversation.context,
                mediaRepository = voiceMediaRepository,
            )
            TeswaPersonIdentity(
                name = thread.conversation.other.displayName ?: thread.conversation.other.username ?: "مستخدم تِسوى",
                avatarUrl = thread.conversation.other.avatarUrl,
                supporting = "الشخص اللي دخل الكلام من اللحظة دي",
            )
        }

        holder.message?.let { message ->
            TeswaInlineMessage(
                title = "الرد مكملش",
                body = message,
                emphasis = TeswaEmphasis.Strong,
                modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
            )
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(
                horizontal = TeswaLayout.ScreenHorizontal,
                vertical = TeswaSpacing.md,
            ),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            items(thread.messages, key = { it.id }) { value ->
                val mine = value.senderId == holder.session.user.id
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                ) {
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    ) {
                        if (value.kind == "voice" && value.mediaStoragePath != null) {
                            VoiceMessagePlayer(value.durationMs) {
                                when (val result = voiceMediaRepository.signedUrl(holder.session, "contextual_voice", value.mediaStoragePath)) {
                                    is VoiceMediaResult.Success -> {
                                        holder.updateSession(result.session)
                                        result.value
                                    }
                                    is VoiceMediaResult.Failure -> {
                                        result.session?.let(holder::updateSession)
                                        holder.showMessage(result.message)
                                        null
                                    }
                                }
                            }
                        } else {
                            Text(
                                value.body,
                                Modifier.padding(TeswaSpacing.md),
                                color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
            verticalAlignment = Alignment.Bottom,
        ) {
            VoiceComposer(
                enabled = true,
                sending = holder.working,
                uploadProgress = holder.voiceUploadProgress,
                onSend = holder::sendVoice,
                onError = holder::showMessage,
            )
            Spacer(Modifier.width(TeswaSpacing.xs))
            TeswaTextField(
                value = holder.composer,
                onValueChange = holder::compose,
                modifier = Modifier.weight(1f),
                label = "رد في نفس السياق",
                placeholder = "كمّل من اللحظة اللي بدأت الكلام…",
                singleLine = false,
                maxLines = 4,
            )
            Spacer(Modifier.width(TeswaSpacing.xs))
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Send,
                contentDescription = "إرسال الرد",
                onClick = { scope.launch { holder.send() } },
                enabled = holder.composer.isNotBlank() && !holder.working,
            )
        }
    }
}
