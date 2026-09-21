package com.teswa.mobile.feature.messages

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.contextual.ContextualContent
import com.teswa.mobile.feature.contextual.ContextualRepository
import com.teswa.mobile.feature.contextual.ContextualStateHolder
import com.teswa.mobile.feature.direct.DirectComposeTarget
import com.teswa.mobile.feature.direct.DirectContent
import com.teswa.mobile.feature.direct.DirectRepository
import com.teswa.mobile.feature.direct.DirectStateHolder
import com.teswa.mobile.feature.direct.DirectUiState
import com.teswa.mobile.feature.dolab.AndroidDolabDirectMessagingBridge
import com.teswa.mobile.feature.dolab.DolabRepository
import com.teswa.mobile.feature.offers.OffersContent
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.offers.OffersStateHolder
import com.teswa.mobile.feature.offers.OffersUiState
import com.teswa.mobile.feature.reviews.DealReviewCard
import com.teswa.mobile.feature.reviews.ReviewRepository
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaExchangeMemoryPair
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaMotion
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import com.teswa.mobile.ui.system.performTeswa
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun MessagingScreen(
    initialSession: AuthSession,
    repository: MessagingRepository,
    offersRepository: OffersRepository,
    directRepository: DirectRepository,
    contextualRepository: ContextualRepository,
    dolabRepository: DolabRepository,
    voiceMediaRepository: VoiceMediaRepository,
    reviewRepository: ReviewRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    modifier: Modifier = Modifier,
    initialDealId: String? = null,
    initialOffers: Boolean = false,
    initialDirectId: String? = null,
    initialDirectTarget: DirectComposeTarget? = null,
    initialContextualId: String? = null,
    onExternalTargetConsumed: () -> Unit = {},
    onReport: (ReportTarget) -> Unit = {},
    onFocusedStateChanged: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    val holder = remember(initialSession.user.id, repository) { MessagingStateHolder(initialSession, repository) }
    val offersHolder = remember(initialSession.user.id, offersRepository) { OffersStateHolder(initialSession, offersRepository) }
    val directHolder = remember(initialSession.user.id, directRepository) { DirectStateHolder(initialSession, directRepository) }
    val contextualHolder = remember(initialSession.user.id, contextualRepository) { ContextualStateHolder(initialSession, contextualRepository) }
    val dolabDirectBridge = remember(dolabRepository, voiceMediaRepository, context.applicationContext) {
        AndroidDolabDirectMessagingBridge(context.applicationContext, dolabRepository, voiceMediaRepository)
    }
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(InboxMode.OVERVIEW) }
    var offerDirection by remember { mutableStateOf(com.teswa.mobile.feature.offers.OfferDirection.INCOMING) }
    val focusedState = holder.selectedConversation != null ||
        directHolder.selected != null ||
        directHolder.composeTarget != null ||
        contextualHolder.thread != null

    LaunchedEffect(focusedState) { onFocusedStateChanged(focusedState) }
    BackHandler(enabled = focusedState || mode != InboxMode.OVERVIEW) {
        when {
            holder.selectedConversation != null -> holder.closeThread()
            directHolder.selected != null || directHolder.composeTarget != null -> directHolder.close()
            contextualHolder.thread != null -> contextualHolder.close()
            mode != InboxMode.OVERVIEW -> mode = InboxMode.OVERVIEW
        }
    }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        offersHolder.updateSession(initialSession)
        directHolder.updateSession(initialSession)
        contextualHolder.updateSession(initialSession)
        kotlinx.coroutines.coroutineScope {
            launch { holder.load() }
            launch { offersHolder.load() }
            launch { directHolder.load() }
            launch { contextualHolder.load() }
        }
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(offersHolder.session.accessToken) { onSessionUpdated(offersHolder.session) }
    LaunchedEffect(directHolder.session.accessToken) { onSessionUpdated(directHolder.session) }
    LaunchedEffect(contextualHolder.session.accessToken) { onSessionUpdated(contextualHolder.session) }
    LaunchedEffect(
        holder.sessionExpired,
        offersHolder.sessionExpired,
        directHolder.sessionExpired,
        contextualHolder.sessionExpired,
    ) {
        if (holder.sessionExpired || offersHolder.sessionExpired || directHolder.sessionExpired || contextualHolder.sessionExpired) {
            onSessionExpired()
        }
    }
    LaunchedEffect(initialDealId, initialOffers, initialDirectId, initialDirectTarget, initialContextualId) {
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
            initialDirectId != null -> {
                mode = InboxMode.DIRECT
                directHolder.openById(initialDirectId)
                onExternalTargetConsumed()
            }
            initialDirectTarget != null -> {
                mode = InboxMode.DIRECT
                directHolder.startCompose(initialDirectTarget)
                onExternalTargetConsumed()
            }
            initialContextualId != null -> {
                mode = InboxMode.CONTEXTUAL
                contextualHolder.openById(initialContextualId)
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
        DealThreadScreen(
            holder = holder,
            conversation = selected,
            voiceMediaRepository = voiceMediaRepository,
            reviewRepository = reviewRepository,
            onSessionUpdated = onSessionUpdated,
            onSessionExpired = onSessionExpired,
            onReport = onReport,
            modifier = modifier,
        )
        return
    }

    Column(modifier.fillMaxSize()) {
        BetweenUsMasthead(
            mode = mode,
            supporting = when (mode) {
                InboxMode.OVERVIEW -> betweenUsRootSummary(
                    holder.inboxState,
                    offersHolder.state,
                    directHolder.state,
                )
                InboxMode.MESSAGES -> unreadLabel(holder.inboxState)
                InboxMode.OFFERS -> offerLabel(offersHolder.state)
                InboxMode.DIRECT -> "كلام مباشر بدأ بطلب واضح، مش صندوق رسائل مفتوح."
                InboxMode.CONTEXTUAL -> "ردود شايلة معاها السبب اللي بدأ الكلام."
            },
            onRefresh = {
                scope.launch {
                    when (mode) {
                        InboxMode.OVERVIEW -> kotlinx.coroutines.coroutineScope {
                            launch { holder.load(silent = true) }
                            launch { offersHolder.load(silent = true) }
                            launch { directHolder.load() }
                            launch { contextualHolder.load(silent = true) }
                        }
                        InboxMode.MESSAGES -> holder.load(silent = true)
                        InboxMode.OFFERS -> offersHolder.load(silent = true)
                        InboxMode.DIRECT -> directHolder.load()
                        InboxMode.CONTEXTUAL -> contextualHolder.load()
                    }
                }
            },
        )
        if (mode != InboxMode.OVERVIEW) {
            BetweenUsDrillDownBack(
                mode = mode,
                onBack = { mode = InboxMode.OVERVIEW },
            )
        }

        if (mode == InboxMode.OVERVIEW) {
            BetweenUsOverview(
                dealsState = holder.inboxState,
                offersState = offersHolder.state,
                directState = directHolder.state,
                contextualState = contextualHolder.state,
                onOpenDeal = { conversation -> scope.launch { holder.open(conversation) } },
                onOpenOffer = { direction -> offerDirection = direction; mode = InboxMode.OFFERS },
                onOpenDirect = { conversation -> mode = InboxMode.DIRECT; scope.launch { directHolder.open(conversation) } },
                onOpenContextual = { conversation -> mode = InboxMode.CONTEXTUAL; scope.launch { contextualHolder.open(conversation) } },
                modifier = Modifier.weight(1f),
            )
            return@Column
        }
        if (mode == InboxMode.OFFERS) {
            OffersContent(
                holder = offersHolder,
                initialDirection = offerDirection,
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
        if (mode == InboxMode.DIRECT) {
            DirectContent(
                holder = directHolder,
                voiceMediaRepository = voiceMediaRepository,
                dolabBridge = dolabDirectBridge,
                onReport = onReport,
                modifier = Modifier.weight(1f),
            )
            return@Column
        }
        if (mode == InboxMode.CONTEXTUAL) {
            ContextualContent(contextualHolder, voiceMediaRepository, Modifier.weight(1f))
            return@Column
        }

        holder.banner?.let { message ->
            TeswaInlineMessage(
                title = "الاتصال اتقطع",
                body = message,
                emphasis = TeswaEmphasis.Quiet,
                actionLabel = "حاول تاني",
                onAction = { scope.launch { holder.load(silent = true) } },
                modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
            )
        }

        when (val state = holder.inboxState) {
            InboxUiState.Loading -> CenterState("بنجمع الصفقات اللي بينكم…", loading = true)
            is InboxUiState.Empty -> CenterState(state.message)
            is InboxUiState.Error -> CenterState(state.message, action = { scope.launch { holder.load() } })
            is InboxUiState.Content -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    horizontal = TeswaLayout.ScreenHorizontal,
                    vertical = TeswaSpacing.sm,
                ),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
            ) {
                items(state.items, key = { it.dealId }) { conversation ->
                    DealConversationRow(conversation) { scope.launch { holder.open(conversation) } }
                }
                if (state.hasMore) {
                    item {
                        TeswaSecondaryAction(
                            text = if (state.loadingMore) "بنفتح أثر أقدم…" else "صفقات أقدم",
                            enabled = !state.loadingMore,
                            onClick = { scope.launch { holder.loadMore() } },
                        )
                    }
                }
            }
        }
    }
}

private enum class InboxMode { OVERVIEW, MESSAGES, OFFERS, DIRECT, CONTEXTUAL }

@Composable
private fun BetweenUsMasthead(
    mode: InboxMode,
    supporting: String,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .45f),
                shape = MaterialTheme.shapes.large,
            ) {
                TeswaMarkIcon(
                    mark = TeswaMark.BetweenUs,
                    color = MaterialTheme.colorScheme.secondary,
                    size = 42.dp,
                    modifier = Modifier.padding(TeswaSpacing.sm),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Text(
                    text = "بيننا",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = supporting,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Refresh,
                contentDescription = "تحديث بيننا",
                onClick = onRefresh,
            )
        }
    }
}

@Composable
private fun BetweenUsDrillDownBack(
    mode: InboxMode,
    onBack: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onBack) {
            Text("رجوع لبيننا")
        }
        Text(
            text = when (mode) {
                InboxMode.MESSAGES -> "الصفقات"
                InboxMode.OFFERS -> "العروض"
                InboxMode.DIRECT -> "مباشر"
                InboxMode.CONTEXTUAL -> "ردود"
                InboxMode.OVERVIEW -> "بيننا"
            },
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun betweenUsRootSummary(
    dealsState: InboxUiState,
    offersState: OffersUiState,
    directState: DirectUiState,
): String {
    val deals = (dealsState as? InboxUiState.Content)?.items.orEmpty()
    val offers = (offersState as? OffersUiState.Content)?.inbox
    val direct = (directState as? DirectUiState.Ready)?.items.orEmpty()

    val needsYou = offers?.incoming.orEmpty().count { it.status in setOf("pending", "thinking") } +
        direct.count { it.requiresAction }
    val active = deals.count { it.status in setOf("coordinating", "completed_pending_confirmation") }
    val waiting = offers?.sent.orEmpty().count { it.status in setOf("pending", "thinking") }

    return when {
        needsYou == 1 -> "حاجة واحدة محتاجاك"
        needsYou > 1 -> "$needsYou حاجات محتاجينك"
        active == 1 -> "علاقة شغالة بينكم دلوقتي"
        active > 1 -> "$active علاقات شغالة بينكم"
        waiting == 1 -> "علاقة واحدة مستنية رد"
        waiting > 1 -> "$waiting علاقات مستنية رد"
        else -> "العلاقات اللي بتتكوّن بينك وبين الناس"
    }
}

@Composable
private fun DealConversationRow(conversation: DealConversation, onOpen: () -> Unit) {
    val unread = conversation.unreadCount > 0
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(vertical = TeswaSpacing.xs),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.BetweenUs,
                color = if (conversation.status == "completed") {
                    MaterialTheme.colorScheme.secondary
                } else {
                    MaterialTheme.colorScheme.primary
                },
                size = 34.dp,
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Text(
                    text = "${conversation.requestedItemTitle} ↔ ${conversation.offeredItemTitle}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = buildString {
                        append(conversation.otherDisplayName ?: "مستخدم تِسوى")
                        append(" · ")
                        append(
                            when {
                                conversation.latestMessage == null -> "لسه مفيش تنسيق"
                                conversation.latestMessage.messageType == "voice" -> "آخر أثر رسالة صوتية"
                                else -> conversation.latestMessage.body
                            },
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TeswaStatePill(
                text = dealStatusPill(conversation.status),
                emphasis = when (conversation.status) {
                    "completed" -> TeswaEmphasis.Commitment
                    "cancelled", "disputed" -> TeswaEmphasis.Quiet
                    else -> TeswaEmphasis.Strong
                },
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = shortDate(conversation.lastActivityAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (unread) {
                TeswaArchiveLabel("${conversation.unreadCount.coerceAtMost(99)} جديد")
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
    }
}

@Composable
private fun DealThreadScreen(
    holder: MessagingStateHolder,
    conversation: DealConversation,
    voiceMediaRepository: VoiceMediaRepository,
    reviewRepository: ReviewRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onReport: (ReportTarget) -> Unit,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val messageCount = (holder.threadState as? ThreadUiState.Content)?.messages?.size ?: 0
    LaunchedEffect(messageCount) {
        if (messageCount > 0) listState.animateScrollToItem(messageCount - 1)
    }

    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(
            title = "الصفقة",
            onBack = holder::closeThread,
            actionIcon = TeswaIcons.Report,
            actionDescription = "الإبلاغ عن الصفقة",
            onAction = {
                onReport(
                    ReportTarget.Deal(
                        conversation.dealId,
                        "صفقة مع ${conversation.otherDisplayName ?: "الطرف الآخر"}",
                    ),
                )
            },
        )

        holder.banner?.let { message ->
            TeswaInlineMessage(
                title = "الاتصال وقف",
                body = message,
                emphasis = TeswaEmphasis.Quiet,
                actionLabel = "حاول تاني",
                onAction = { scope.launch { holder.reloadThread() } },
                modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
            )
        }

        when (val state = holder.threadState) {
            ThreadUiState.Idle, ThreadUiState.Loading -> Box(
                Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                TeswaInlineLoading("بنفتح العلاقة بين الحاجتين…")
            }

            is ThreadUiState.Error -> Box(
                Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                CenterState(state.message, action = { scope.launch { holder.reloadThread() } })
            }

            is ThreadUiState.Content -> {
                DealRelationshipHeader(
                    conversation = conversation,
                    holder = holder,
                )
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(
                        horizontal = TeswaLayout.ScreenHorizontal,
                        vertical = TeswaSpacing.md,
                    ),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                ) {
                    item { DealCompletionCard(holder, conversation) }
                if (conversation.status == "completed") {
                    item {
                        TeswaTraceNote("العلاقة دي خرجت من الشاشة، حصلت في الواقع، واتقفلت بتأكيد الطرفين. من هنا بقت جزء من الدليل.")
                    }
                    item {
                        DealReviewCard(
                            dealId = conversation.dealId,
                            initialSession = holder.session,
                            repository = reviewRepository,
                            onSessionUpdated = { updated -> holder.updateSession(updated); onSessionUpdated(updated) },
                            onSessionExpired = onSessionExpired,
                        )
                    }
                }
                if (state.messages.isEmpty()) item { ThreadWelcome(conversation) }
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(
                            message = message,
                            mine = message.senderId == holder.session.user.id,
                            holder = holder,
                            voiceMediaRepository = voiceMediaRepository,
                            dealId = conversation.dealId,
                            otherDisplayName = conversation.otherDisplayName,
                            onReport = onReport,
                        )
                    }
                }
            }
        }

        if (holder.threadState is ThreadUiState.Content && conversation.status in setOf("coordinating", "completed_pending_confirmation")) {
            Surface(tonalElevation = 2.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    VoiceComposer(
                        enabled = true,
                        sending = holder.sending,
                        uploadProgress = holder.voiceUploadProgress,
                        onSend = holder::sendVoice,
                        onError = holder::showBanner,
                    )
                    TeswaTextField(
                        value = holder.composer,
                        onValueChange = holder::updateComposer,
                        modifier = Modifier.weight(1f),
                        label = "رسالة تنسيق",
                        placeholder = "اتفقوا على المكان أو الوقت…",
                        singleLine = false,
                        minLines = 1,
                        maxLines = 3,
                    )
                    com.teswa.mobile.ui.system.TeswaIconAction(
                        icon = TeswaIcons.Send,
                        contentDescription = "إرسال الرسالة",
                        enabled = holder.composer.isNotBlank() && !holder.sending,
                        onClick = { scope.launch { holder.send() } },
                    )
                }
            }
        }
    }
}

@Composable
private fun DealRelationshipHeader(
    conversation: DealConversation,
    holder: MessagingStateHolder,
) {
    val mine = holder.session.user.id in holder.confirmationUserIds
    val other = conversation.otherParticipantId in holder.confirmationUserIds
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = TeswaSpacing.xxs,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            TeswaExchangeMemoryPair(
                requestedTitle = conversation.requestedItemTitle,
                requestedImageUrl = conversation.requestedItemImageUrl,
                offeredTitle = conversation.offeredItemTitle,
                offeredImageUrl = conversation.offeredItemImageUrl,
                state = dealStatusPill(conversation.status),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TeswaPersonIdentity(
                    name = conversation.otherDisplayName ?: "مستخدم تِسوى",
                    avatarUrl = conversation.otherAvatarUrl,
                    supporting = dealRoomNextAction(conversation.status, mine, other),
                    modifier = Modifier.weight(1f),
                )
                TeswaStatePill(
                    text = dealStatusPill(conversation.status),
                    emphasis = when (conversation.status) {
                        "completed" -> TeswaEmphasis.Commitment
                        "cancelled", "disputed" -> TeswaEmphasis.Quiet
                        else -> TeswaEmphasis.Strong
                    },
                )
            }
        }
    }
}

private fun dealRoomNextAction(status: String, mine: Boolean, other: Boolean): String = when (status) {
    "coordinating" -> "اتفقوا على المكان والوقت، وبعد التنفيذ كل طرف يأكد"
    "completed_pending_confirmation" -> when {
        mine && !other -> "إنت أكدت · مستنيين الطرف التاني"
        !mine && other -> "الطرف التاني أكد · محتاجين تأكيدك"
        else -> "مستنيين التأكيدين"
    }
    "completed" -> "التبديل اتأكد من الطرفين وبقى جزء من السجل"
    "cancelled" -> "العلاقة اتقفلت"
    "disputed" -> "التنسيق متوقف لحين المراجعة"
    else -> "شوف الخطوة الجاية في العلاقة"
}

@Composable
private fun DealConfirmationBridge(
    mineConfirmed: Boolean,
    otherConfirmed: Boolean,
    otherName: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.weight(1f),
            color = if (mineConfirmed) {
                MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .55f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)
            },
            shape = MaterialTheme.shapes.medium,
        ) {
            Column(
                modifier = Modifier.padding(TeswaSpacing.sm),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Text("إنت", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Text(
                    if (mineConfirmed) "أكدت" else "لسه",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        TeswaMarkIcon(
            mark = TeswaMark.BetweenUs,
            color = if (mineConfirmed && otherConfirmed) {
                MaterialTheme.colorScheme.secondary
            } else {
                MaterialTheme.colorScheme.primary
            },
            size = 30.dp,
        )
        Surface(
            modifier = Modifier.weight(1f),
            color = if (otherConfirmed) {
                MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .55f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)
            },
            shape = MaterialTheme.shapes.medium,
        ) {
            Column(
                modifier = Modifier.padding(TeswaSpacing.sm),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Text(otherName, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(
                    if (otherConfirmed) "أكد" else "لسه",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DealCompletionCard(holder: MessagingStateHolder, conversation: DealConversation) {
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val mine = holder.session.user.id in holder.confirmationUserIds
    val other = conversation.otherParticipantId in holder.confirmationUserIds

    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
        AnimatedContent(
            targetState = conversation.status,
            transitionSpec = { fadeIn(TeswaMotion.emphasized()) togetherWith fadeOut(TeswaMotion.standard()) },
            label = "deal-completion-state",
        ) { status ->
            TeswaInlineMessage(
                title = dealStatusTitle(status),
                body = dealStatusDescription(status),
                icon = when (status) {
                    "completed" -> TeswaIcons.Accepted
                    "cancelled", "disputed" -> TeswaIcons.Safety
                    else -> TeswaIcons.Waiting
                },
                emphasis = if (status == "completed") TeswaEmphasis.Normal else TeswaEmphasis.Quiet,
            )
        }
        if (conversation.status in setOf("coordinating", "completed_pending_confirmation")) {
            DealConfirmationBridge(
                mineConfirmed = mine,
                otherConfirmed = other,
                otherName = conversation.otherDisplayName ?: "الطرف التاني",
            )
            TeswaPrimaryAction(
                text = if (mine) "تم تسجيل تأكيدك" else "أكد إن التبديل تم",
                icon = TeswaIcons.Accepted,
                onClick = {
                    scope.launch {
                        if (holder.confirmCompletion()) haptics.performTeswa(TeswaHapticEvent.Success)
                    }
                },
                enabled = !mine,
                loading = holder.confirmingCompletion,
            )
        }
    }
}

private fun dealStatusPill(status: String) = when (status) {
    "coordinating" -> "بينكم دلوقتي"
    "completed_pending_confirmation" -> "مستني تأكيد"
    "completed" -> "اكتمل"
    "cancelled" -> "اتلغى"
    "disputed" -> "قيد المراجعة"
    else -> "صفقة"
}

private fun dealStatusTitle(status: String) = when (status) {
    "coordinating" -> "العلاقة دخلت مرحلة التنفيذ"
    "completed_pending_confirmation" -> "الواقع محتاج التأكيد التاني"
    "completed" -> "التبديل بقى دليل"
    "cancelled" -> "الصفقة اتلغت"
    "disputed" -> "الصفقة محل مراجعة"
    else -> "حالة الصفقة"
}

private fun dealStatusDescription(status: String) = when (status) {
    "coordinating" -> "القبول عمل التزام بينكم. اتفقوا على التسليم، وبعد التنفيذ كل طرف يأكد من هنا."
    "completed_pending_confirmation" -> "طرف أكد إن التبديل حصل فعلًا، ولسه محتاجين التأكيد التاني."
    "completed" -> "الطرفين أكدوا اللي حصل في الواقع، فالعلاقة اتقفلت كنتيجة مكتملة."
    "cancelled" -> "الكلام محفوظ كسجل، لكن العلاقة لم تعد نشطة."
    "disputed" -> "التنسيق متوقف لحين مراجعة الحالة."
    else -> status
}

@Composable
private fun MessageBubble(
    message: DealMessage,
    mine: Boolean,
    holder: MessagingStateHolder,
    voiceMediaRepository: VoiceMediaRepository,
    dealId: String,
    otherDisplayName: String?,
    onReport: (ReportTarget) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
            Surface(
                modifier = Modifier.fillMaxWidth(.82f),
                shape = if (mine) MaterialTheme.shapes.medium else MaterialTheme.shapes.small,
                color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            ) {
                Column(Modifier.padding(horizontal = TeswaSpacing.md, vertical = TeswaSpacing.sm)) {
                    if (message.messageType == "voice" && message.audioStoragePath != null) {
                        VoiceMessagePlayer(message.audioDurationMs) {
                            when (val result = voiceMediaRepository.signedUrl(holder.session, "deal_voice", message.audioStoragePath)) {
                                is VoiceMediaResult.Success -> {
                                    holder.updateSession(result.session)
                                    result.value
                                }
                                is VoiceMediaResult.Failure -> {
                                    result.session?.let(holder::updateSession)
                                    holder.showBanner(result.message)
                                    null
                                }
                            }
                        }
                    } else {
                        Text(message.body)
                    }
                    Spacer(Modifier.height(TeswaSpacing.xxs))
                    Text(shortDate(message.createdAt), style = MaterialTheme.typography.labelMedium)
                }
            }
            if (!mine) {
                TextButton(
                    onClick = {
                        onReport(
                            ReportTarget.DealMessage(
                                dealId = dealId,
                                messageId = message.id,
                                fallbackSubject = "رسالة من ${otherDisplayName ?: "الطرف الآخر"}",
                            ),
                        )
                    },
                ) { Text("الإبلاغ عن الرسالة") }
            }
        }
    }
}

@Composable
private fun ThreadWelcome(conversation: DealConversation) {
    TeswaInlineMessage(
        title = "الكلام هنا لخدمة العلاقة",
        body = "نسّقوا تبديل ${conversation.requestedItemTitle} مع ${conversation.offeredItemTitle}. أي اتفاق في الرسائل ما يعتبرش تأكيد إن التبديل حصل.",
        icon = TeswaIcons.Conversation,
    )
}

@Composable
private fun CenterState(
    message: String,
    loading: Boolean = false,
    action: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) {
            TeswaInlineLoading(message)
        } else {
            TeswaInlineMessage(
                title = "مفيش علاقة مفتوحة هنا دلوقتي",
                body = message,
                actionLabel = if (action != null) "حاول تاني" else null,
                onAction = action,
            )
        }
    }
}

private fun unreadLabel(state: InboxUiState): String {
    val count = (state as? InboxUiState.Content)?.items?.sumOf { it.unreadCount } ?: 0
    return if (count > 0) "$count رسالة جديدة جوه صفقاتك" else "الصفقة تفضل علاقة بين حاجتين، مش شات منفصل"
}

private fun offerLabel(state: com.teswa.mobile.feature.offers.OffersUiState): String {
    val count = (state as? com.teswa.mobile.feature.offers.OffersUiState.Content)?.inbox?.incoming?.size ?: 0
    return if (count > 0) "$count عرض مستني قرارك" else "العرض هو أول التزام واضح بين حاجتين"
}

private fun shortDate(value: String): String {
    val clean = value.trim()
    val date = clean.substringBefore('T')
    val time = clean.substringAfter('T', "").take(5)
    return if (date.isNotBlank() && time.isNotBlank()) "$date · $time" else clean.take(16)
}
