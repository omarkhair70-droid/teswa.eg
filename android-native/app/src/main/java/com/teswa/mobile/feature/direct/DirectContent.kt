package com.teswa.mobile.feature.direct

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.teswa.mobile.feature.dolab.DolabDirectMessagingBridge
import com.teswa.mobile.feature.dolab.DolabDirectShareable
import com.teswa.mobile.feature.dolab.DolabResult
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
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

    holder.composeTarget?.let {
        DirectFirstMessage(holder, it, dolabBridge, modifier)
        return
    }
    holder.selected?.let {
        DirectThread(holder, it, voiceMediaRepository, dolabBridge, onReport, modifier)
        return
    }

    when (val state = holder.state) {
        DirectUiState.Loading -> TeswaInlineLoading(
            "بنجمع طلبات الكلام والمحادثات…",
            modifier.padding(TeswaLayout.ScreenHorizontal),
        )
        is DirectUiState.Error -> TeswaInlineMessage(
            title = "الكلام المباشر مش متاح",
            body = state.message,
            icon = TeswaIcons.Refresh,
            emphasis = TeswaEmphasis.Strong,
            actionLabel = "حاول تاني",
            onAction = { scope.launch { holder.load() } },
            modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
        )
        is DirectUiState.Ready -> if (state.items.isEmpty()) {
            TeswaEmptyField(
                title = "مفيش كلام مباشر",
                body = "المباشر ما بيبدأش من inbox مفتوح؛ شخص واضح بيطلب الكلام والطرف التاني يقرر.",
                modifier = modifier.padding(TeswaLayout.ScreenHorizontal),
            )
        } else {
            LazyColumn(
                modifier.fillMaxSize(),
                contentPadding = TeswaLayout.RootContentPadding,
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                item {
                    TeswaTraceNote("المباشر مساحة بين شخصين بعد طلب واضح. فتح ملف حد أو رؤيته في اكتشف مش بيفتح قناة تلقائيًا.")
                }
                items(state.items, key = { it.id }) { value ->
                    DirectConversationRow(value) { scope.launch { holder.open(value) } }
                }
            }
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
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(TeswaLayout.FocusedContentPadding),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        ) {
            TeswaArchiveLabel("DIRECT / REQUEST")
            TeswaPersonIdentity(
                name = name,
                avatarUrl = target.avatarUrl,
                supporting = "لسه مفيش قناة بينكم",
            )
            TeswaTraceNote("أول رسالة هي نفسها طلب الدخول للمساحة المباشرة. الطرف التاني يقدر يقبلها أو يقفلها.")
            holder.message?.let {
                TeswaInlineMessage(
                    title = if (holder.messageIsError) "الطلب ما اتبعتش" else "تم",
                    body = it,
                    emphasis = if (holder.messageIsError) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
                )
            }
        }

        Surface(tonalElevation = TeswaSpacing.xxs) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                DolabPickerButton(holder, dolabBridge, Modifier.fillMaxWidth())
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
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
private fun DirectConversationRow(
    value: DirectConversation,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(vertical = TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaPersonIdentity(
            name = value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى",
            avatarUrl = value.otherAvatarUrl,
            supporting = value.lastMessageBody
                ?: if (value.status == "requested") "طلب كلام جديد" else "مساحة مباشرة مفتوحة",
            evidence = if (value.unreadCount > 0) "${value.unreadCount} جديد" else "بدأت بطلب واضح",
            modifier = Modifier.weight(1f),
        )
        TeswaStatePill(
            text = when {
                value.requiresAction -> "محتاج ردك"
                value.status == "accepted" -> "مفتوح"
                else -> "طلب كلام"
            },
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

    LaunchedEffect(value.id) {
        while (isActive) {
            holder.refreshTyping()
            delay(2_500)
        }
    }

    LaunchedEffect(value.id, holder.composer) {
        if (value.status == "accepted") {
            val active = holder.composer.isNotBlank()
            holder.setTyping(active)
            if (active) {
                delay(3_500)
                holder.setTyping(false)
            }
        }
    }

    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(title = "كلام مباشر", onBack = holder::close)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TeswaLayout.ScreenHorizontal),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            TeswaArchiveLabel(if (value.status == "accepted") "DIRECT / OPEN" else "DIRECT / REQUEST")
            TeswaPersonIdentity(
                name = value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى",
                avatarUrl = value.otherAvatarUrl,
                supporting = when {
                    holder.otherTyping -> "بيكتب دلوقتي…"
                    value.status == "requested" -> "طلب كلام"
                    else -> "المساحة المباشرة مفتوحة"
                },
            )
        }

        holder.message?.let { message ->
            TeswaInlineMessage(
                title = if (holder.messageIsError) "الخطوة مكملتش" else "تم",
                body = message,
                emphasis = if (holder.messageIsError) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
                modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
            )
        }

        if (value.requiresAction) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaTraceNote("الطرف التاني طلب يفتح كلام مباشر. القرار هنا يفتح القناة أو يقفل الطلب؛ مفيش التزام بمقايضة.")
                Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    TeswaPrimaryAction(
                        text = "افتح الكلام",
                        icon = TeswaIcons.Conversation,
                        onClick = { scope.launch { holder.act(true) } },
                        enabled = !holder.working,
                        modifier = Modifier.weight(1f),
                    )
                    TeswaSecondaryAction(
                        text = "تجاهل",
                        onClick = { scope.launch { holder.act(false) } },
                        enabled = !holder.working,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(
                horizontal = TeswaLayout.ScreenHorizontal,
                vertical = TeswaSpacing.md,
            ),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
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
    val deleted = message.deletedAt != null
    val canSave = !deleted && (
        (message.messageType == "voice" && !message.audioStoragePath.isNullOrBlank()) ||
            (message.attachments.isEmpty() && message.body.isNotBlank())
        )

    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
            modifier = Modifier.fillMaxWidth(.86f),
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            ) {
                Column(
                    modifier = Modifier.padding(TeswaSpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    message.replyBody?.takeIf { !deleted }?.let { reply ->
                        Surface(
                            color = if (mine) {
                                MaterialTheme.colorScheme.onPrimary.copy(alpha = .12f)
                            } else {
                                MaterialTheme.colorScheme.surface.copy(alpha = .72f)
                            },
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Column(
                                Modifier.padding(TeswaSpacing.xs),
                                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
                            ) {
                                Text(
                                    text = "رد على رسالة",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
                                )
                                Text(
                                    text = reply,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }

                    when {
                        deleted -> Text(
                            text = "تم حذف هذه الرسالة",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (mine) {
                                MaterialTheme.colorScheme.onPrimary.copy(alpha = .72f)
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                        message.messageType == "voice" && message.audioStoragePath != null -> {
                            VoiceMessagePlayer(message.audioDurationMs) {
                                when (
                                    val result = voiceMediaRepository.signedUrl(
                                        holder.session,
                                        "direct_voice",
                                        message.audioStoragePath,
                                    )
                                ) {
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
                        }
                        message.attachments.isNotEmpty() -> {
                            Text(
                                text = directAttachmentSummary(message.attachments),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            message.body
                                .takeIf { it.isNotBlank() && it !in setOf("صورة", "فيديو", "ملف", "رسالة صوتية") }
                                ?.let { Text(it) }
                            Text(
                                text = "المرفقات موجودة في الرسالة — عارض الصور والفيديو والملفات بيتقفل في الـslice الجاية.",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (mine) {
                                    MaterialTheme.colorScheme.onPrimary.copy(alpha = .75f)
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                        else -> Text(message.body)
                    }
                }
            }

            val loveCount = message.reactions.count { it.reaction == "love" }
            val likeCount = message.reactions.count { it.reaction == "thumbs_up" }
            if (!deleted && (loveCount > 0 || likeCount > 0)) {
                Text(
                    text = buildList {
                        if (loveCount > 0) add("❤️ $loveCount")
                        if (likeCount > 0) add("👍 $likeCount")
                    }.joinToString("  "),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (!deleted) {
                Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs)) {
                    TextButton(onClick = { holder.replyTo(message) }) { Text("رد") }
                    TextButton(onClick = { scope.launch { holder.toggleReaction(message, "love") } }) { Text("❤️") }
                    TextButton(onClick = { scope.launch { holder.toggleReaction(message, "thumbs_up") } }) { Text("👍") }

                    if (canSave) {
                        TextButton(
                            enabled = !saving,
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
                        ) { Text(if (saving) "بنحفظ…" else "دولابي") }
                    }

                    if (mine && message.attachments.isEmpty()) {
                        TextButton(onClick = { scope.launch { holder.deleteMessage(message) } }) {
                            Text("حذف")
                        }
                    } else if (!mine) {
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
}

private fun directAttachmentSummary(values: List<DirectAttachment>): String {
    val images = values.count { it.kind == "image" }
    val videos = values.count { it.kind == "video" }
    val files = values.count { it.kind == "file" }
    val audio = values.count { it.kind == "audio" }
    return buildList {
        if (images > 0) add(if (images == 1) "صورة" else "$images صور")
        if (videos > 0) add(if (videos == 1) "فيديو" else "$videos فيديوهات")
        if (files > 0) add(if (files == 1) "ملف" else "$files ملفات")
        if (audio > 0) add(if (audio == 1) "تسجيل" else "$audio تسجيلات")
    }.joinToString(" · ").ifBlank { "مرفق" }
}

@Composable
private fun DirectComposer(
    holder: DirectStateHolder,
    dolabBridge: DolabDirectMessagingBridge,
) {
    val scope = rememberCoroutineScope()
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        holder.replyingTo?.let { target ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f),
                shape = MaterialTheme.shapes.small,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(TeswaSpacing.xs),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "بترد على",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = target.body.ifBlank {
                                if (target.messageType == "voice") "رسالة صوتية" else directAttachmentSummary(target.attachments)
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    TextButton(onClick = holder::clearReply) { Text("إلغاء") }
                }
            }
        }

        DolabPickerButton(holder, dolabBridge, Modifier.fillMaxWidth())

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            VoiceComposer(
                enabled = holder.replyingTo == null && !holder.working,
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
                label = if (holder.replyingTo == null) "رسالة مباشرة" else "ردك",
                placeholder = if (holder.replyingTo == null) "اكتب رسالة…" else "كمّل ردك…",
                singleLine = false,
                maxLines = 4,
            )
            Spacer(Modifier.width(TeswaSpacing.xs))
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Send,
                contentDescription = if (holder.replyingTo == null) "إرسال الرسالة" else "إرسال الرد",
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

    TeswaSecondaryAction(
        text = if (loading) "بنفتح دولابك…" else "هات من دولابي",
        icon = TeswaIcons.Mine,
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
    )

    if (open) {
        TeswaActionSheet(
            title = "هات حاجة أو ملاحظة من دولابك",
            supporting = "إنت اللي بتختار إيه يطلع من مساحتك الخاصة. الاختيار بيتحط في الرسالة ومش بيتبعت غير لما تضغط إرسال.",
            onDismiss = { open = false },
        ) {
            when {
                loading -> TeswaInlineLoading("بنجهّز الحاجات والملاحظات…")
                pickerError != null -> TeswaInlineMessage(
                    title = "الدولاب ما اتفتحش",
                    body = pickerError!!,
                    emphasis = TeswaEmphasis.Strong,
                )
                options.isEmpty() -> TeswaEmptyField(
                    title = "مفيش حاجة مناسبة للمشاركة",
                    body = "حط حاجة أو سيب ملاحظة في دولابك الأول، وبعدها اسحب اللي تحتاجه للكلام من هنا.",
                )
                else -> LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = TeswaLayout.MediaPreviewHeight + TeswaLayout.MediaPreviewHeight),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
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
                                Spacer(Modifier.height(TeswaSpacing.xxs))
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
        }
    }
}
