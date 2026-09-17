package com.teswa.mobile.feature.direct

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.feature.dolab.DolabDirectMessagingBridge
import com.teswa.mobile.feature.dolab.DolabDirectShareable
import com.teswa.mobile.feature.dolab.DolabResult
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
import kotlinx.coroutines.launch

@Composable
fun DirectContent(
    holder: DirectStateHolder,
    voiceMediaRepository: VoiceMediaRepository,
    dolabBridge: DolabDirectMessagingBridge,
    onReport: (ReportTarget) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    holder.composeTarget?.let { DirectFirstMessage(holder, it, dolabBridge, modifier); return }
    holder.selected?.let { DirectThread(holder, it, voiceMediaRepository, dolabBridge, onReport, modifier); return }
    when (val state = holder.state) {
        DirectUiState.Loading -> TeswaInlineLoading("بنحمّل الكلام المباشر…", modifier.padding(TeswaLayout.ScreenHorizontal))
        is DirectUiState.Error -> TeswaInlineMessage(
            title = "الكلام المباشر مش متاح",
            body = state.message,
            icon = TeswaIcons.Refresh,
            actionLabel = "حاول تاني",
            onAction = { scope.launch { holder.load() } },
            modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
        )
        is DirectUiState.Ready -> if (state.items.isEmpty()) {
            TeswaEmptyField(
                title = "مفيش كلام مباشر",
                body = "طلب الكلام بيبدأ من شخص واضح، والطرف التاني يختار يقبله أو يتجاهله.",
                modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
            )
        } else LazyColumn(modifier.fillMaxSize(), contentPadding = TeswaLayout.RootContentPadding) {
            items(state.items, key = { it.id }) { value -> DirectConversationCard(value) { scope.launch { holder.open(value) } } }
        }
    }
}

@Composable
private fun DirectFirstMessage(
    holder: DirectStateHolder,
    target: DirectComposeTarget,
    dolabBridge: DolabDirectMessagingBridge,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    val name = target.displayName ?: target.username ?: "مستخدم تِسوى"
    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(title = "طلب كلام", onBack = holder::close)
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .15f))
        Column(
            Modifier.weight(1f).fillMaxWidth().padding(TeswaLayout.ScreenHorizontal),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        ) {
            TeswaPersonIdentity(
                name = name,
                avatarUrl = target.avatarUrl,
                supporting = "أول رسالة هتبدأ طلب الكلام",
            )
            TeswaInlineMessage(
                title = "ابدأ برسالة لها معنى",
                body = "فتح الشاشة لوحده مش بيبعت حاجة. الطلب بيتسجل بس لما تضغط إرسال.",
                icon = TeswaIcons.Conversation,
            )
            holder.message?.let {
                TeswaInlineMessage(
                    title = if (holder.messageIsError) "الطلب ما اتبعتش" else "تم",
                    body = it,
                    emphasis = if (holder.messageIsError) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
                )
            }
        }
        Surface(tonalElevation = 2.dp) {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                DolabPickerButton(holder, dolabBridge, Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    TeswaTextField(
                        value = holder.composer,
                        onValueChange = holder::compose,
                        modifier = Modifier.weight(1f),
                        label = "أول رسالة",
                        placeholder = "قول ليه حابب تبدأ كلام…",
                        singleLine = false,
                        minLines = 1,
                        maxLines = 3,
                    )
                    com.teswa.mobile.ui.system.TeswaIconAction(
                        icon = TeswaIcons.Send,
                        contentDescription = "إرسال طلب الكلام",
                        onClick = { scope.launch { holder.sendFirst() } },
                        enabled = holder.composer.isNotBlank() && !holder.working,
                    )
                }
            }
        }
    }
}

@Composable
private fun DirectConversationCard(value: DirectConversation, onOpen: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(vertical = TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaPersonIdentity(
            name = value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى",
            avatarUrl = value.otherAvatarUrl,
            supporting = value.lastMessageBody ?: if (value.status == "requested") "طلب كلام جديد" else "محادثة مباشرة",
            evidence = if (value.unreadCount > 0) "${value.unreadCount} جديد" else null,
            modifier = Modifier.weight(1f),
        )
        TeswaStatePill(
            text = if (value.requiresAction) "محتاج ردك" else if (value.status == "accepted") "مباشر" else "طلب كلام",
            emphasis = if (value.requiresAction) TeswaEmphasis.Strong else TeswaEmphasis.Quiet,
        )
    }
}

@Composable
private fun DirectThread(
    holder: DirectStateHolder,
    value: DirectConversation,
    voiceMediaRepository: VoiceMediaRepository,
    dolabBridge: DolabDirectMessagingBridge,
    onReport: (ReportTarget) -> Unit,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(title = "كلام مباشر", onBack = holder::close)
        TeswaPersonIdentity(
            name = value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى",
            avatarUrl = value.otherAvatarUrl,
            supporting = if (value.status == "requested") "طلب كلام" else "محادثة مباشرة",
            modifier = Modifier.fillMaxWidth().padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.xs),
        )
        holder.message?.let {
            Text(
                it,
                Modifier.fillMaxWidth().padding(10.dp),
                color = if (holder.messageIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
        }
        if (value.requiresAction) Column(
            Modifier.fillMaxWidth().padding(horizontal = TeswaLayout.ScreenHorizontal),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            TeswaInlineMessage(
                title = "طلب كلام مستنيك",
                body = "اقبل لو حابب تفتح محادثة مباشرة. التجاهل يقفل الطلب من غير فتح الرسائل.",
                icon = TeswaIcons.Conversation,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                TeswaPrimaryAction(
                    text = "اقبل الطلب",
                    onClick = { scope.launch { holder.act(true) } },
                    enabled = !holder.working,
                    modifier = Modifier.weight(1f),
                )
                OutlinedButton(
                    onClick = { scope.launch { holder.act(false) } },
                    enabled = !holder.working,
                    modifier = Modifier.weight(1f),
                ) { Text("تجاهل") }
            }
        }
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(holder.messages, key = { it.id }) { message ->
                DirectMessageBubble(
                    message = message,
                    mine = message.senderId == holder.session.user.id,
                    conversation = value,
                    holder = holder,
                    voiceMediaRepository = voiceMediaRepository,
                    dolabBridge = dolabBridge,
                    onReport = onReport,
                )
            }
        }
        if (value.status == "accepted") DirectComposer(holder, dolabBridge)
    }
}

@Composable
private fun DirectMessageBubble(
    message: DirectMessage,
    mine: Boolean,
    conversation: DirectConversation,
    holder: DirectStateHolder,
    voiceMediaRepository: VoiceMediaRepository,
    dolabBridge: DolabDirectMessagingBridge,
    onReport: (ReportTarget) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var saving by remember(message.id) { mutableStateOf(false) }
    val canSave = message.body.isNotBlank() || (message.messageType == "voice" && !message.audioStoragePath.isNullOrBlank())
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
            ) {
                if (message.messageType == "voice" && message.audioStoragePath != null) {
                    VoiceMessagePlayer(message.audioDurationMs) {
                        when (val result = voiceMediaRepository.signedUrl(holder.session, "direct_voice", message.audioStoragePath)) {
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
                        message.body,
                        Modifier.padding(12.dp),
                        color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(
                    enabled = canSave && !saving,
                    onClick = {
                        scope.launch {
                            saving = true
                            when (val result = dolabBridge.saveMessage(holder.session, conversation, message)) {
                                is DolabResult.Success -> holder.applyExternalSuccess(result.session, "اتحفظت في دولابك.")
                                is DolabResult.Failure -> holder.applyExternalFailure(
                                    result.session,
                                    result.message,
                                    result.unauthorized,
                                )
                            }
                            saving = false
                        }
                    },
                ) { Text(if (saving) "بنحفظ…" else "حفظ في دولابي") }
                if (!mine) {
                    TextButton(
                        onClick = {
                            onReport(
                                ReportTarget.DirectMessage(
                                    conversationId = conversation.id,
                                    messageId = message.id,
                                    reportedUserId = message.senderId,
                                    fallbackSubject = "رسالة من ${conversation.otherDisplayName ?: conversation.otherUsername ?: "مستخدم تِسوى"}",
                                ),
                            )
                        },
                    ) { Text("بلاغ") }
                }
            }
        }
    }
}

@Composable
private fun DirectComposer(holder: DirectStateHolder, dolabBridge: DolabDirectMessagingBridge) {
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth().padding(10.dp)) {
        DolabPickerButton(holder, dolabBridge, Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
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
                label = "رسالة مباشرة",
                placeholder = "اكتب رسالة…",
                singleLine = false,
                maxLines = 4,
            )
            Spacer(Modifier.width(8.dp))
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Send,
                contentDescription = "إرسال الرسالة",
                onClick = { scope.launch { holder.send() } },
                enabled = holder.composer.isNotBlank() && !holder.working,
            )
        }
    }
}

@Composable
private fun DolabPickerButton(
    holder: DirectStateHolder,
    dolabBridge: DolabDirectMessagingBridge,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var options by remember { mutableStateOf<List<DolabDirectShareable>>(emptyList()) }
    var pickerError by remember { mutableStateOf<String?>(null) }

    OutlinedButton(
        modifier = modifier,
        enabled = !loading,
        onClick = {
            open = true
            loading = true
            options = emptyList()
            pickerError = null
            scope.launch {
                when (val result = dolabBridge.loadShareables(holder.session)) {
                    is DolabResult.Success -> {
                        holder.updateSession(result.session)
                        options = result.value
                    }
                    is DolabResult.Failure -> {
                        holder.applyExternalFailure(result.session, result.message, result.unauthorized)
                        pickerError = result.message
                    }
                }
                loading = false
            }
        },
    ) { Text(if (loading) "بنفتح دولابك…" else "من دولابي") }

    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("اختار من دولابك") },
            text = {
                when {
                    loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("بنجهّز الحاجات والملاحظات…")
                    }
                    pickerError != null -> Text(pickerError!!, color = MaterialTheme.colorScheme.error)
                    options.isEmpty() -> Text("دولابك لسه مفيهوش حاجة مناسبة تبعتها هنا.")
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(options, key = { it.id }) { option ->
                            TextButton(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    holder.compose(option.text)
                                    open = false
                                },
                            ) {
                                Column(Modifier.fillMaxWidth()) {
                                    Text(option.title, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        option.text,
                                        maxLines = 3,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text("إغلاق") } },
        )
    }
}
