package com.teswa.mobile.feature.direct

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
    LaunchedEffect(Unit) { holder.load() }
    holder.composeTarget?.let { DirectFirstMessage(holder, it, dolabBridge, modifier); return }
    holder.selected?.let { DirectThread(holder, it, voiceMediaRepository, dolabBridge, onReport, modifier); return }
    when (val state = holder.state) {
        DirectUiState.Loading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is DirectUiState.Error -> Column(modifier.fillMaxSize(), Arrangement.Center, Alignment.CenterHorizontally) {
            Text(state.message)
            Button(onClick = { scope.launch { holder.load() } }) { Text("حاول تاني") }
        }
        is DirectUiState.Ready -> if (state.items.isEmpty()) {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("طلبات ومحادثات الناس هتظهر هنا.") }
        } else LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
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
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(onClick = holder::close) { Text("رجوع") }
            Spacer(Modifier.width(12.dp))
            NetworkImage(target.avatarUrl, name, Modifier.size(44.dp).clip(CircleShape))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("أول رسالة تبدأ طلب المراسلة", style = MaterialTheme.typography.bodySmall)
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .15f))
        Column(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer) {
                Text("✉", Modifier.padding(18.dp), style = MaterialTheme.typography.headlineMedium)
            }
            Spacer(Modifier.height(14.dp))
            Text("ابدأ برسالة لها معنى", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(7.dp))
            Text(
                "فتح الشاشة لا يرسل طلبًا. الطلب يتسجل فقط لما تضغط إرسال.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            holder.message?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    color = if (holder.messageIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
        }
        Surface(shadowElevation = 8.dp) {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                DolabPickerButton(holder, dolabBridge, Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = holder.composer,
                        onValueChange = holder::compose,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("اكتب أول رسالة…") },
                        minLines = 1,
                        maxLines = 4,
                    )
                    Button(
                        onClick = { scope.launch { holder.sendFirst() } },
                        enabled = holder.composer.isNotBlank() && !holder.working,
                    ) { Text(if (holder.working) "…" else "إرسال") }
                }
            }
        }
    }
}

@Composable
private fun DirectConversationCard(value: DirectConversation, onOpen: () -> Unit) {
    Card(onClick = onOpen, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row {
                Text(
                    value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى",
                    Modifier.weight(1f),
                    fontWeight = if (value.unreadCount > 0) FontWeight.Bold else FontWeight.Medium,
                )
                if (value.requiresAction) Text("محتاج رد", color = MaterialTheme.colorScheme.primary)
            }
            Text(
                value.lastMessageBody ?: if (value.status == "requested") "طلب مراسلة جديد" else "ابدأوا الكلام",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
        }
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
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = holder::close) { Text("رجوع") }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى", fontWeight = FontWeight.Bold)
                Text(if (value.status == "requested") "طلب مراسلة" else "محادثة مباشرة", style = MaterialTheme.typography.bodySmall)
            }
        }
        holder.message?.let {
            Text(
                it,
                Modifier.fillMaxWidth().padding(10.dp),
                color = if (holder.messageIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
        }
        if (value.requiresAction) Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text("الشخص ده طالب يبدأ كلام معاك.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scope.launch { holder.act(true) } }, enabled = !holder.working) { Text("قبول") }
                    OutlinedButton(onClick = { scope.launch { holder.act(false) } }, enabled = !holder.working) { Text("تجاهل") }
                }
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
            OutlinedTextField(
                holder.composer,
                holder::compose,
                Modifier.weight(1f),
                placeholder = { Text("اكتب رسالة…") },
                maxLines = 4,
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = { scope.launch { holder.send() } },
                enabled = holder.composer.isNotBlank() && !holder.working,
            ) { Text("إرسال") }
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
