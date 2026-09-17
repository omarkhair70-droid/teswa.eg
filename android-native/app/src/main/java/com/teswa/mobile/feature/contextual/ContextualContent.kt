package com.teswa.mobile.feature.contextual

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
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

@Composable
fun ContextualContent(holder: ContextualStateHolder, voiceMediaRepository: VoiceMediaRepository, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(holder.thread?.conversation?.id) {
        while (isActive) {
            delay(30_000)
            val current = holder.thread
            if (current == null) holder.load(silent = true) else holder.reloadThread()
        }
    }
    holder.thread?.let { ContextualThreadContent(holder, it, voiceMediaRepository, modifier); return }
    when (val state = holder.state) {
        ContextualUiState.Loading -> TeswaInlineLoading("بنحمّل ردود القصص…", modifier.padding(TeswaLayout.ScreenHorizontal))
        is ContextualUiState.Error -> TeswaInlineMessage(
            title = "ردود القصص مش متاحة",
            body = state.message,
            icon = TeswaIcons.Refresh,
            actionLabel = "حاول تاني",
            onAction = { scope.launch { holder.load() } },
            modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
        )
        is ContextualUiState.Ready -> if (state.items.isEmpty()) {
            TeswaEmptyField(
                title = "مفيش ردود على قصص",
                body = "أي كلام يبدأ من قصة هيفضل محتفظ بالسياق هنا.",
                modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
            )
        } else LazyColumn(modifier.fillMaxSize(), contentPadding = TeswaLayout.RootContentPadding) {
            items(state.items, key = { it.id }) { value ->
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { scope.launch { holder.open(value) } }.padding(vertical = TeswaSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                ) {
                    TeswaPersonIdentity(
                        name = value.other.displayName ?: value.other.username ?: "مستخدم تِسوى",
                        avatarUrl = value.other.avatarUrl,
                        supporting = value.latestBody ?: "الكلام بدأ من قصة",
                        evidence = if (value.unreadCount > 0) "${value.unreadCount} جديد" else "سياق القصة محفوظ",
                        modifier = Modifier.weight(1f),
                    )
                    TeswaStatePill("رد قصة", emphasis = TeswaEmphasis.Quiet)
                }
            }
        }
    }
}

@Composable
private fun ContextualThreadContent(holder: ContextualStateHolder, thread: ContextualThread, voiceMediaRepository: VoiceMediaRepository, modifier: Modifier) {
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(title = "رد على قصة", onBack = holder::close)
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = TeswaLayout.ScreenHorizontal),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            TeswaPersonIdentity(
                name = thread.conversation.other.displayName ?: thread.conversation.other.username ?: "مستخدم تِسوى",
                avatarUrl = thread.conversation.other.avatarUrl,
                supporting = "المحادثة بدأت من قصة",
            )
            TeswaInlineMessage(
                title = "سياق القصة محفوظ",
                body = "الرسائل دي مرتبطة بالقصة الأصلية، وده سبب إن المحادثة موجودة بينكم.",
                icon = TeswaIcons.Conversation,
            )
        }
        holder.message?.let { Text(it, Modifier.fillMaxWidth().padding(10.dp), color = MaterialTheme.colorScheme.error) }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(thread.messages, key = { it.id }) { value ->
                val mine = value.senderId == holder.session.user.id
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Surface(shape = MaterialTheme.shapes.medium, color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {
                        if (value.kind == "voice" && value.mediaStoragePath != null) {
                            VoiceMessagePlayer(value.durationMs) {
                                when (val result = voiceMediaRepository.signedUrl(holder.session, "contextual_voice", value.mediaStoragePath)) {
                                    is VoiceMediaResult.Success -> { holder.updateSession(result.session); result.value }
                                    is VoiceMediaResult.Failure -> { result.session?.let(holder::updateSession); holder.showMessage(result.message); null }
                                }
                            }
                        } else Text(value.body, Modifier.padding(12.dp), color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom) {
            VoiceComposer(
                enabled = true,
                sending = holder.working,
                uploadProgress = holder.voiceUploadProgress,
                onSend = holder::sendVoice,
                onError = holder::showMessage,
            )
            Spacer(Modifier.width(8.dp))
            TeswaTextField(
                value = holder.composer,
                onValueChange = holder::compose,
                modifier = Modifier.weight(1f),
                label = "رد على القصة",
                placeholder = "رد في نفس السياق…",
                singleLine = false,
                maxLines = 4,
            )
            Spacer(Modifier.width(8.dp))
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Send,
                contentDescription = "إرسال الرد",
                onClick = { scope.launch { holder.send() } },
                enabled = holder.composer.isNotBlank() && !holder.working,
            )
        }
    }
}
