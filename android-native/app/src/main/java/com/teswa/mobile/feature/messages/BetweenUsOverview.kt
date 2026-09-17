package com.teswa.mobile.feature.messages

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.feature.contextual.ContextualConversation
import com.teswa.mobile.feature.contextual.ContextualUiState
import com.teswa.mobile.feature.direct.DirectConversation
import com.teswa.mobile.feature.direct.DirectUiState
import com.teswa.mobile.feature.offers.OfferDirection
import com.teswa.mobile.feature.offers.OfferSummary
import com.teswa.mobile.feature.offers.OffersUiState
import com.teswa.mobile.feature.offers.offerStatusLabel
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaExchangeMemoryPair
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill

@Composable
fun BetweenUsOverview(
    dealsState: InboxUiState,
    offersState: OffersUiState,
    directState: DirectUiState,
    contextualState: ContextualUiState,
    onOpenDeal: (DealConversation) -> Unit,
    onOpenOffer: (OfferDirection) -> Unit,
    onOpenDirect: (DirectConversation) -> Unit,
    onOpenContextual: (ContextualConversation) -> Unit,
    modifier: Modifier = Modifier,
) {
    val deals = (dealsState as? InboxUiState.Content)?.items.orEmpty()
    val offers = (offersState as? OffersUiState.Content)?.inbox
    val direct = (directState as? DirectUiState.Ready)?.items.orEmpty()
    val contextual = (contextualState as? ContextualUiState.Ready)?.items.orEmpty()

    val incoming = offers?.incoming.orEmpty()
    val sent = offers?.sent.orEmpty()
    val needsYouOffers = incoming.filter { it.status in actionableOfferStatuses }
    val needsYouDirect = direct.filter { it.requiresAction }
    val waitingOffers = sent.filter { it.status in actionableOfferStatuses }
    val activeDeals = deals.filter { it.status in activeDealStatuses }
    val conversationDirect = direct.filterNot { it.requiresAction || it.status in terminalDirectStatuses }
    val historyDeals = deals.filterNot { it.status in activeDealStatuses }
    val historyOffers = (incoming + sent).filterNot { it.status in actionableOfferStatuses }
    val loading = dealsState is InboxUiState.Loading ||
        offersState is OffersUiState.Loading ||
        directState is DirectUiState.Loading ||
        contextualState is ContextualUiState.Loading
    val hasContent = needsYouOffers.isNotEmpty() || needsYouDirect.isNotEmpty() ||
        waitingOffers.isNotEmpty() || activeDeals.isNotEmpty() ||
        conversationDirect.isNotEmpty() || contextual.isNotEmpty() ||
        historyDeals.isNotEmpty() || historyOffers.isNotEmpty()

    LazyColumn(
        modifier = modifier,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = TeswaSpacing.page,
            vertical = TeswaSpacing.sm,
        ),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
    ) {
        if (loading && !hasContent) {
            item { TeswaInlineLoading("بنجمع اللي بينكم…") }
        }

        if (!loading && !hasContent) {
            item {
                TeswaEmptyField(
                    title = "لسه مفيش حاجة بينكم",
                    body = "أول عرض هيخلّي حاجتين يظهروا هنا كعلاقة واحدة. بعدها القبول يحوّل العلاقة لصفقة حقيقية للتنسيق.",
                )
            }
        }

        if (needsYouOffers.isNotEmpty() || needsYouDirect.isNotEmpty()) {
            item { TeswaSectionHeader("محتاجك") }
            items(needsYouOffers, key = { "needs-offer:${it.id}" }) { offer ->
                OfferActivityMoment(offer, "عرض مستني قرارك") { onOpenOffer(OfferDirection.INCOMING) }
            }
            items(needsYouDirect, key = { "needs-direct:${it.id}" }) { conversation ->
                ConversationActivityRow(
                    title = conversation.otherDisplayName ?: conversation.otherUsername ?: "مستخدم تِسوى",
                    supporting = "طلب كلام مستني ردك",
                    state = directActivityLabel(conversation.status),
                    unreadCount = conversation.unreadCount,
                    strong = true,
                    onClick = { onOpenDirect(conversation) },
                )
            }
        }

        if (waitingOffers.isNotEmpty()) {
            item { TeswaSectionHeader("مستني") }
            items(waitingOffers, key = { "waiting-offer:${it.id}" }) { offer ->
                OfferActivityMoment(offer, "عرضك عند الطرف التاني") { onOpenOffer(OfferDirection.SENT) }
            }
        }

        if (activeDeals.isNotEmpty()) {
            item { TeswaSectionHeader("بينكم دلوقتي") }
            items(activeDeals, key = { "active-deal:${it.dealId}" }) { deal ->
                DealActivityMoment(deal, onClick = { onOpenDeal(deal) })
            }
        }

        if (conversationDirect.isNotEmpty() || contextual.isNotEmpty()) {
            item { TeswaSectionHeader("الكلام") }
            items(conversationDirect, key = { "direct:${it.id}" }) { conversation ->
                ConversationActivityRow(
                    title = conversation.otherDisplayName ?: conversation.otherUsername ?: "مستخدم تِسوى",
                    supporting = conversation.lastMessageBody ?: "محادثة مباشرة",
                    state = directActivityLabel(conversation.status),
                    unreadCount = conversation.unreadCount,
                    onClick = { onOpenDirect(conversation) },
                )
            }
            items(contextual, key = { "contextual:${it.id}" }) { conversation ->
                ConversationActivityRow(
                    title = conversation.other.displayName ?: conversation.other.username ?: "مستخدم تِسوى",
                    supporting = conversation.latestBody ?: "رد بدأ من قصة",
                    state = "رد على قصة",
                    unreadCount = conversation.unreadCount,
                    onClick = { onOpenContextual(conversation) },
                )
            }
        }

        if (historyDeals.isNotEmpty() || historyOffers.isNotEmpty()) {
            item { TeswaSectionHeader("أثر اللي حصل") }
            items(historyDeals.take(4), key = { "history-deal:${it.dealId}" }) { deal ->
                DealActivityMoment(deal, onClick = { onOpenDeal(deal) }, archived = true)
            }
            items(historyOffers.take(4), key = { "history-offer:${it.direction}:${it.id}" }) { offer ->
                OfferActivityMoment(offer, "عرض محفوظ في السجل") { onOpenOffer(offer.direction) }
            }
        }
    }
}

@Composable
private fun OfferActivityMoment(
    offer: OfferSummary,
    supporting: String,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaExchangeMemoryPair(
            requestedTitle = offer.requestedItem.title,
            requestedImageUrl = offer.requestedItem.imageUrl,
            offeredTitle = offer.offeredItem.title,
            offeredImageUrl = offer.offeredItem.imageUrl,
            state = offerStatusLabel(offer.status),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = supporting,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TeswaStatePill(
                text = offerStatusLabel(offer.status),
                emphasis = if (offer.status == "accepted") TeswaEmphasis.Commitment else TeswaEmphasis.Normal,
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
    }
}

@Composable
private fun DealActivityMoment(
    deal: DealConversation,
    onClick: () -> Unit,
    archived: Boolean = false,
) {
    val state = dealActivityLabel(deal.status)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = MaterialTheme.shapes.large,
        color = if (archived) {
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .28f)
        } else {
            MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .28f)
        },
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(TeswaSpacing.md),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TeswaMarkIcon(
                    mark = TeswaMark.BetweenUs,
                    color = if (archived) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.secondary,
                    size = 32.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "${deal.requestedItemTitle}  ↔  ${deal.offeredItemTitle}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = deal.otherDisplayName ?: "صفقة مع مستخدم تِسوى",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                TeswaStatePill(
                    text = state,
                    emphasis = if (deal.status == "completed") TeswaEmphasis.Normal else TeswaEmphasis.Strong,
                )
            }
            if (deal.unreadCount > 0) {
                Text(
                    text = "${deal.unreadCount} جديد · افتح العلاقة نفسها، مش صندوق رسائل منفصل",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                deal.latestMessage?.let { message ->
                    Text(
                        text = if (message.messageType == "voice") "آخر أثر: رسالة صوتية" else "آخر أثر: ${message.body}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun ConversationActivityRow(
    title: String,
    supporting: String,
    state: String,
    unreadCount: Int,
    strong: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = TeswaSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            color = if (strong) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
            shape = MaterialTheme.shapes.medium,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.Me,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(TeswaSpacing.sm),
                size = 24.dp,
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (unreadCount > 0) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                supporting,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            TeswaStatePill(
                text = state,
                emphasis = if (strong) TeswaEmphasis.Strong else TeswaEmphasis.Quiet,
            )
            if (unreadCount > 0) {
                Text(
                    "$unreadCount جديد",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

private val actionableOfferStatuses = setOf("pending", "thinking")
private val activeDealStatuses = setOf("coordinating", "completed_pending_confirmation")
private val terminalDirectStatuses = setOf("ignored", "blocked")

private fun dealActivityLabel(status: String): String = when (status) {
    "coordinating" -> "بينكم دلوقتي"
    "completed_pending_confirmation" -> "مستني تأكيد"
    "completed" -> "اكتمل"
    "cancelled" -> "اتلغى"
    "disputed" -> "قيد المراجعة"
    else -> "صفقة"
}

private fun directActivityLabel(status: String): String = when (status) {
    "requested" -> "طلب كلام"
    "accepted" -> "مباشر"
    "ignored" -> "اتقفل"
    "blocked" -> "محظور"
    else -> "مباشر"
}
