package com.teswa.mobile.feature.messages

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.feature.offers.OffersContent
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.offers.OffersStateHolder
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun MessagingScreen(
    initialSession: AuthSession,
    repository: MessagingRepository,
    offersRepository: OffersRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    initialDealId: String? = null,
    initialOffers: Boolean = false,
    onExternalTargetConsumed: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { MessagingStateHolder(initialSession, repository) }
    val offersHolder = remember(initialSession.user.id, offersRepository) { OffersStateHolder(initialSession, offersRepository) }
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(InboxMode.MESSAGES) }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        offersHolder.updateSession(initialSession)
        holder.load()
        offersHolder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(offersHolder.session.accessToken) { onSessionUpdated(offersHolder.session) }
    LaunchedEffect(holder.sessionExpired, offersHolder.sessionExpired) {
        if (holder.sessionExpired || offersHolder.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(initialDealId, initialOffers) {
        when {
            initialDealId != null -> {
                mode = InboxMode.MESSAGES
                holder.openDeal(initialDealId)
                onExternalTargetConsumed()
            }
            initialOffers -> {
                mode = InboxMode.OFFERS
                onExternalTargetConsumed()
            }
        }
    }
    LaunchedEffect(holder.selectedConversation?.dealId) {
        while (isActive) {
            delay(30_000)
            if (holder.selectedConversation == null) holder.load(silent = true) else holder.reloadThread()
        }
    }

    val selected = holder.selectedConversation
    if (selected != null) {
        DealThreadScreen(holder, selected, modifier)
        return
    }

    Column(modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text("الرسائل", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(
                    if (mode == InboxMode.MESSAGES) unreadLabel(holder.inboxState) else offerLabel(offersHolder.state),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = {
                scope.launch {
                    if (mode == InboxMode.MESSAGES) holder.load(silent = true) else offersHolder.load(silent = true)
                }
            }) { Text("تحديث") }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .15f))
        InboxModePicker(mode) { mode = it }
        if (mode == InboxMode.OFFERS) {
            OffersContent(
                holder = offersHolder,
                onOpenDeal = { dealId ->
                    scope.launch {
                        mode = InboxMode.MESSAGES
                        holder.openDeal(dealId)
                    }
                },
                modifier = Modifier.weight(1f),
            )
            return@Column
        }
        holder.banner?.let { OfflineBanner(it) { scope.launch { holder.load(silent = true) } } }

        when (val state = holder.inboxState) {
            InboxUiState.Loading -> CenterState("بنحمّل محادثاتك…", loading = true)
            is InboxUiState.Empty -> CenterState(state.message)
            is InboxUiState.Error -> CenterState(state.message, action = { scope.launch { holder.load() } })
            is InboxUiState.Content -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp),
            ) {
                items(state.items, key = { it.dealId }) { conversation ->
                    ConversationRow(conversation) { scope.launch { holder.open(conversation) } }
                    HorizontalDivider(
                        modifier = Modifier.padding(start = 66.dp),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = .13f),
                    )
                }
                if (state.hasMore) {
                    item {
                        OutlinedButton(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                            enabled = !state.loadingMore,
                            onClick = { scope.launch { holder.loadMore() } },
                        ) { Text(if (state.loadingMore) "جاري التحميل…" else "محادثات أقدم") }
                    }
                }
            }
        }
    }
}

private enum class InboxMode { MESSAGES, OFFERS }

@Composable
private fun InboxModePicker(selected: InboxMode, onSelect: (InboxMode) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        HubModeChip("محادثات الصفقات", selected == InboxMode.MESSAGES, Modifier.weight(1f)) { onSelect(InboxMode.MESSAGES) }
        HubModeChip("العروض", selected == InboxMode.OFFERS, Modifier.weight(1f)) { onSelect(InboxMode.OFFERS) }
    }
}

@Composable
private fun HubModeChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    ) {
        Text(label, Modifier.padding(horizontal = 12.dp, vertical = 11.dp), fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ConversationRow(conversation: DealConversation, onOpen: () -> Unit) {
    val unread = conversation.unreadCount > 0
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .background(
                if (unread) MaterialTheme.colorScheme.primaryContainer.copy(alpha = .24f)
                else MaterialTheme.colorScheme.background,
                MaterialTheme.shapes.medium,
            )
            .padding(horizontal = 10.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(conversation.otherAvatarUrl, conversation.otherDisplayName)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    conversation.otherDisplayName ?: "مستخدم تِسوى",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(shortDate(conversation.lastActivityAt), style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.height(3.dp))
            Text(
                when {
                    conversation.latestMessage == null -> "ابدأوا تنسيق التبديل"
                    conversation.latestMessage.messageType == "voice" -> "رسالة صوتية"
                    else -> conversation.latestMessage.body
                },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (unread) FontWeight.Medium else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${conversation.requestedItemTitle} ↔ ${conversation.offeredItemTitle}",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.primary,
                )
                if (unread) {
                    Spacer(Modifier.width(8.dp))
                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary) {
                        Text(
                            conversation.unreadCount.coerceAtMost(99).toString(),
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DealThreadScreen(holder: MessagingStateHolder, conversation: DealConversation, modifier: Modifier) {
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val messageCount = (holder.threadState as? ThreadUiState.Content)?.messages?.size ?: 0
    LaunchedEffect(messageCount) {
        if (messageCount > 0) listState.animateScrollToItem(messageCount - 1)
    }
    Column(modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(onClick = holder::closeThread) { Text("رجوع") }
            Spacer(Modifier.width(10.dp))
            Avatar(conversation.otherAvatarUrl, conversation.otherDisplayName, 42)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(conversation.otherDisplayName ?: "مستخدم تِسوى", style = MaterialTheme.typography.titleMedium)
                Text(
                    "${conversation.requestedItemTitle} ↔ ${conversation.offeredItemTitle}",
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .15f))
        holder.banner?.let { OfflineBanner(it) { scope.launch { holder.reloadThread() } } }
        when (val state = holder.threadState) {
            ThreadUiState.Idle, ThreadUiState.Loading -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is ThreadUiState.Error -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                CenterState(state.message, action = { scope.launch { holder.reloadThread() } })
            }
            is ThreadUiState.Content -> LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (state.messages.isEmpty()) item { ThreadWelcome(conversation) }
                items(state.messages, key = { it.id }) { message ->
                    MessageBubble(message, mine = message.senderId == holder.session.user.id)
                }
            }
        }
        if (holder.threadState is ThreadUiState.Content) {
            Surface(shadowElevation = 8.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = holder.composer,
                        onValueChange = holder::updateComposer,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("اكتب رسالة واضحة…") },
                        minLines = 1,
                        maxLines = 4,
                    )
                    Button(
                        enabled = holder.composer.isNotBlank() && !holder.sending,
                        onClick = { scope.launch { holder.send() } },
                    ) { Text(if (holder.sending) "…" else "إرسال") }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: DealMessage, mine: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Surface(
            modifier = Modifier.fillMaxWidth(.82f),
            shape = if (mine) MaterialTheme.shapes.medium else MaterialTheme.shapes.small,
            color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
            contentColor = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                Text(if (message.messageType == "voice") "رسالة صوتية" else message.body)
                Spacer(Modifier.height(3.dp))
                Text(shortDate(message.createdAt), style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun ThreadWelcome(conversation: DealConversation) {
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .5f)) {
        Column(Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("اتفقوا بهدوء ووضوح", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(5.dp))
            Text(
                "المحادثة دي مخصصة لتنسيق تبديل ${conversation.requestedItemTitle} مع ${conversation.offeredItemTitle}.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun Avatar(url: String?, name: String?, size: Int = 52) {
    val modifier = Modifier.size(size.dp).clip(CircleShape)
    if (url != null) {
        NetworkImage(url, name, modifier)
    } else {
        Box(modifier.background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
            Text(name?.trim()?.take(1) ?: "ت", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CenterState(message: String, loading: Boolean = false, action: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(14.dp)) }
        Text(message, style = MaterialTheme.typography.bodyLarge)
        if (action != null) { Spacer(Modifier.height(14.dp)); Button(onClick = action) { Text("حاول تاني") } }
    }
}

@Composable
private fun OfflineBanner(message: String, retry: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.error.copy(alpha = .09f)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Text("إعادة", Modifier.clickable(onClick = retry).padding(8.dp), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
    }
}

private fun unreadLabel(state: InboxUiState): String {
    val count = (state as? InboxUiState.Content)?.items?.sumOf { it.unreadCount } ?: 0
    return if (count > 0) "$count غير مقروء" else "تنسيق صفقاتك في مكان واحد"
}

private fun offerLabel(state: com.teswa.mobile.feature.offers.OffersUiState): String {
    val count = (state as? com.teswa.mobile.feature.offers.OffersUiState.Content)?.inbox?.incoming?.size ?: 0
    return if (count > 0) "$count عرض مستني ردك" else "تابع عروض التبديل"
}

private fun shortDate(value: String): String {
    val clean = value.trim()
    val date = clean.substringBefore('T')
    val time = clean.substringAfter('T', "").take(5)
    return if (date.isNotBlank() && time.isNotBlank()) "$date  $time" else clean.take(16)
}
