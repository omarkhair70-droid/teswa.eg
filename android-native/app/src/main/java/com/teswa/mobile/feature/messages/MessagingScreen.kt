package com.teswa.mobile.feature.messages

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.teswa.mobile.feature.dolab.AndroidDolabDirectMessagingBridge
import com.teswa.mobile.feature.dolab.DolabRepository
import com.teswa.mobile.feature.offers.OffersContent
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.offers.OffersStateHolder
import com.teswa.mobile.feature.reviews.DealReviewCard
import com.teswa.mobile.feature.reviews.ReviewRepository
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEvidenceLine
import com.teswa.mobile.ui.system.TeswaExchangePair
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMotion
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaScreenHeading
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
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
    BackHandler(enabled = focusedState) {
        when {
            holder.selectedConversation != null -> holder.closeThread()
            directHolder.selected != null || directHolder.composeTarget != null -> directHolder.close()
            contextualHolder.thread != null -> contextualHolder.close()
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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            TeswaScreenHeading(
                title = "بيننا",
                modifier = Modifier.weight(1f),
                eyebrow = "BETWEEN US",
                supporting = when (mode) {
                    InboxMode.OVERVIEW -> "العروض والصفقات والكلام، حسب اللي محتاج يحصل دلوقتي"
                    InboxMode.MESSAGES -> unreadLabel(holder.inboxState)
                    InboxMode.OFFERS -> offerLabel(offersHolder.state)
                    InboxMode.DIRECT -> "كلام مباشر بدأ بطلب واضح"
                    InboxMode.CONTEXTUAL -> "ردود لسه محتفظة بالقصة اللي بدأت منها"
                },
            )
            com.teswa.mobile.ui.system.TeswaIconAction(
                icon = TeswaIcons.Refresh,
                contentDescription = "تحديث بيننا",
                onClick = {
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
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .15f))
        InboxModePicker(mode) { mode = it }
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

private enum class InboxMode { OVERVIEW, MESSAGES, OFFERS, DIRECT, CONTEXTUAL }

@Composable
private fun InboxModePicker(selected: InboxMode, onSelect: (InboxMode) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TeswaChoiceChip("النشاط", selected == InboxMode.OVERVIEW, { onSelect(InboxMode.OVERVIEW) })
        TeswaChoiceChip("العروض", selected == InboxMode.OFFERS, { onSelect(InboxMode.OFFERS) }, leadingIcon = TeswaIcons.Exchange)
        TeswaChoiceChip("الصفقات", selected == InboxMode.MESSAGES, { onSelect(InboxMode.MESSAGES) }, leadingIcon = TeswaIcons.Accepted)
        TeswaChoiceChip("مباشر", selected == InboxMode.DIRECT, { onSelect(InboxMode.DIRECT) }, leadingIcon = TeswaIcons.Conversation)
        TeswaChoiceChip("ردود", selected == InboxMode.CONTEXTUAL, { onSelect(InboxMode.CONTEXTUAL) }, leadingIcon = TeswaIcons.Conversation)
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
                    "${conversation.requestedItemTitle} مقابل ${conversation.offeredItemTitle}",
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
                item {
                    TeswaPersonIdentity(
                        name = conversation.otherDisplayName ?: "مستخدم تِسوى",
                        avatarUrl = conversation.otherAvatarUrl,
                        supporting = "الطرف التاني في الصفقة",
                    )
                }
                item {
                    TeswaExchangePair(
                        requested = TeswaObjectIdentity(conversation.requestedItemTitle),
                        offered = TeswaObjectIdentity(conversation.offeredItemTitle),
                        state = dealStatusPill(conversation.status),
                        stateEmphasis = when (conversation.status) {
                            "completed" -> TeswaEmphasis.Commitment
                            "cancelled", "disputed" -> TeswaEmphasis.Quiet
                            else -> TeswaEmphasis.Strong
                        },
                    )
                }
                item { DealCompletionCard(holder, conversation) }
                if (conversation.status == "completed") {
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
        if (holder.threadState is ThreadUiState.Content && conversation.status in setOf("coordinating", "completed_pending_confirmation")) {
            Surface(tonalElevation = 2.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
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
                        placeholder = "اكتب رسالة واضحة…",
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
            TeswaEvidenceLine(
                icon = if (mine) TeswaIcons.Accepted else TeswaIcons.Waiting,
                text = if (mine) "تأكيدك متسجل" else "لسه محتاج تأكيدك",
                supporting = "التأكيد معناه إن التبديل حصل فعلاً على أرض الواقع.",
            )
            TeswaEvidenceLine(
                icon = if (other) TeswaIcons.Accepted else TeswaIcons.Waiting,
                text = if (other) "الطرف التاني أكد" else "مستنيين تأكيد الطرف التاني",
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
    "coordinating" -> "الصفقة قيد التنسيق"
    "completed_pending_confirmation" -> "مستنيين تأكيد الطرفين"
    "completed" -> "المقايضة تمت"
    "cancelled" -> "الصفقة اتلغت"
    "disputed" -> "الصفقة محل مراجعة"
    else -> "حالة الصفقة"
}

private fun dealStatusDescription(status: String) = when (status) {
    "coordinating" -> "اتفقوا على التسليم، وبعد التنفيذ كل طرف يأكد من هنا."
    "completed_pending_confirmation" -> "طرف أكد الإتمام، ومستنيين التأكيد التاني."
    "completed" -> "الطرفين أكدوا التبديل وتم إغلاق الصفقة بنجاح."
    "cancelled" -> "المحادثة محفوظة كسجل، لكن الصفقة لم تعد نشطة."
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
                Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    if (message.messageType == "voice" && message.audioStoragePath != null) {
                        VoiceMessagePlayer(message.audioDurationMs) {
                            when (val result = voiceMediaRepository.signedUrl(holder.session, "deal_voice", message.audioStoragePath)) {
                                is VoiceMediaResult.Success -> { holder.updateSession(result.session); result.value }
                                is VoiceMediaResult.Failure -> { result.session?.let(holder::updateSession); holder.showBanner(result.message); null }
                            }
                        }
                    } else Text(message.body)
                    Spacer(Modifier.height(3.dp))
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
        title = "اتفقوا بهدوء ووضوح",
        body = "المحادثة دي لتنسيق تبديل ${conversation.requestedItemTitle} مع ${conversation.offeredItemTitle}. الاتفاق هنا مش تأكيد للإتمام.",
        icon = TeswaIcons.Conversation,
    )
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
