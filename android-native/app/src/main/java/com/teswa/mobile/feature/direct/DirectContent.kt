package com.teswa.mobile.feature.direct

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.teswa.mobile.feature.dolab.DolabDirectMessagingBridge
import com.teswa.mobile.ui.NetworkImage
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
    attachmentMediaRepository: DirectAttachmentMediaRepository,
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
        DirectThread(
            holder,
            it,
            voiceMediaRepository,
            attachmentMediaRepository,
            dolabBridge,
            onReport,
            modifier,
        )
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
    attachmentMediaRepository: DirectAttachmentMediaRepository,
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
                    attachmentMediaRepository = attachmentMediaRepository,
                    dolabBridge = dolabBridge,
                    onReport = onReport,
                )
            }
        }

        if (value.status == "accepted") {
            DirectComposer(holder, attachmentMediaRepository, dolabBridge)
        }
    }
}

@Composable
private fun DirectMessageBubble(
    message: DirectMessage,
    mine: Boolean,
    conversation: DirectConversation,
    holder: DirectStateHolder,
    voiceMediaRepository: VoiceMediaRepository,
    attachmentMediaRepository: DirectAttachmentMediaRepository,
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
                        message.attachments.any { it.kind != "audio" } -> {
                            DirectAttachmentGallery(
                                holder = holder,
                                mediaRepository = attachmentMediaRepository,
                                attachments = message.attachments.filter { it.kind != "audio" },
                                mine = mine,
                            )
                            message.body
                                .takeIf { it.isNotBlank() && it !in setOf("صورة", "فيديو", "ملف", "رسالة صوتية") }
                                ?.let { Text(it) }
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
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
                ) {
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

                    if (mine && message.messageType != "voice") {
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

@Composable
private fun DirectAttachmentGallery(
    holder: DirectStateHolder,
    mediaRepository: DirectAttachmentMediaRepository,
    attachments: List<DirectAttachment>,
    mine: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
        attachments.forEach { attachment ->
            when (attachment.kind) {
                "image" -> DirectImageAttachment(
                    holder = holder,
                    mediaRepository = mediaRepository,
                    attachment = attachment,
                )
                "video", "file" -> DirectOpenAttachment(
                    holder = holder,
                    mediaRepository = mediaRepository,
                    attachment = attachment,
                    mine = mine,
                )
            }
        }
    }
}

@Composable
private fun DirectImageAttachment(
    holder: DirectStateHolder,
    mediaRepository: DirectAttachmentMediaRepository,
    attachment: DirectAttachment,
) {
    var url by remember(attachment.storagePath) { mutableStateOf<String?>(null) }
    var fullScreen by remember(attachment.storagePath) { mutableStateOf(false) }

    LaunchedEffect(attachment.storagePath) {
        when (val result = mediaRepository.signedUrl(holder.session, attachment)) {
            is DirectMediaResult.Success -> {
                holder.updateSession(result.session)
                url = result.value
            }
            is DirectMediaResult.Failure -> {
                result.session?.let(holder::updateSession)
                holder.showMessage(result.message)
            }
        }
    }

    NetworkImage(
        url = url,
        contentDescription = attachment.fileName ?: "صورة في المحادثة",
        modifier = Modifier
            .fillMaxWidth()
            .height(210.dp)
            .clickable(enabled = url != null) { fullScreen = true },
        contentScale = ContentScale.Crop,
    )

    if (fullScreen && url != null) {
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
                    url = url,
                    contentDescription = attachment.fileName ?: "صورة في المحادثة",
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
private fun DirectOpenAttachment(
    holder: DirectStateHolder,
    mediaRepository: DirectAttachmentMediaRepository,
    attachment: DirectAttachment,
    mine: Boolean,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    Surface(
        color = if (mine) {
            MaterialTheme.colorScheme.onPrimary.copy(alpha = .10f)
        } else {
            MaterialTheme.colorScheme.surface.copy(alpha = .72f)
        },
        shape = MaterialTheme.shapes.small,
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                scope.launch {
                    when (val result = mediaRepository.signedUrl(holder.session, attachment)) {
                        is DirectMediaResult.Success -> {
                            holder.updateSession(result.session)
                            runCatching {
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW).apply {
                                        setDataAndType(
                                            Uri.parse(result.value),
                                            attachment.mimeType ?: if (attachment.kind == "video") "video/*" else "*/*",
                                        )
                                    },
                                )
                            }.onFailure {
                                holder.showMessage("مفيش تطبيق على الجهاز يفتح المرفق ده.")
                            }
                        }
                        is DirectMediaResult.Failure -> {
                            result.session?.let(holder::updateSession)
                            holder.showMessage(result.message)
                        }
                    }
                }
            },
    ) {
        Row(
            modifier = Modifier.padding(TeswaSpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            com.teswa.mobile.ui.system.TeswaMarkIcon(
                mark = com.teswa.mobile.ui.system.TeswaMark.BetweenUs,
                color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
                size = 30.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = attachment.fileName ?: if (attachment.kind == "video") "فيديو" else "ملف",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (attachment.kind == "video") "افتح الفيديو" else "افتح الملف",
                    style = MaterialTheme.typography.bodySmall,
                )
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
    attachmentMediaRepository: DirectAttachmentMediaRepository,
    dolabBridge: DolabDirectMessagingBridge,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val resolver = remember(context) { AndroidDirectAttachmentResolver(context.contentResolver) }
    val attachmentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        val resolved = uris.take(5).mapNotNull { uri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            resolver.resolve(uri)
        }
        holder.queueAttachments(resolved)
        if (uris.isNotEmpty() && resolved.isEmpty()) {
            holder.showMessage("المرفقات دي مش صالحة أو أكبر من الحد المسموح.")
        }
    }

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

        if (holder.pendingAttachments.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                contentPadding = PaddingValues(horizontal = TeswaSpacing.xxs),
            ) {
                items(holder.pendingAttachments, key = { it.uri }) { pending ->
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f),
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Row(
                            modifier = Modifier.padding(TeswaSpacing.xs),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                        ) {
                            Column {
                                Text(
                                    text = pending.displayName,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.labelMedium,
                                )
                                Text(
                                    text = directPendingLabel(pending),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            TextButton(
                                onClick = { holder.removePendingAttachment(pending.uri) },
                                enabled = !holder.working,
                            ) { Text("شيل") }
                        }
                    }
                }
            }
        }

        holder.attachmentUploadProgress?.let { progress ->
            TeswaInlineLoading("بنرفع المرفقات… $progress%")
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DolabPickerButton(holder, dolabBridge, Modifier.weight(1f))
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Gallery,
                contentDescription = "إضافة صورة أو فيديو أو ملف",
                enabled = !holder.working && holder.pendingAttachments.size < 5,
                onClick = { attachmentPicker.launch(arrayOf("*/*")) },
            )
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            VoiceComposer(
                enabled = holder.replyingTo == null &&
                    holder.pendingAttachments.isEmpty() &&
                    !holder.working,
                sending = holder.working && holder.voiceUploadProgress != null,
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
                enabled = (holder.composer.isNotBlank() || holder.pendingAttachments.isNotEmpty()) &&
                    !holder.working,
            )
        }
    }
}

private fun directPendingLabel(value: DirectPendingAttachment): String {
    val kind = when (value.kind) {
        "image" -> "صورة"
        "video" -> "فيديو"
        else -> "ملف"
    }
    val megabytes = value.sizeBytes / (1024.0 * 1024.0)
    return "$kind · " + String.format(java.util.Locale.US, "%.1f MB", megabytes)
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
