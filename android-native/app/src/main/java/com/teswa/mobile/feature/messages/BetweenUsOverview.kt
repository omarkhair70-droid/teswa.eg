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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
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
                    body = "العروض والصفقات وطلبات الكلام وردود القصص هتظهر هنا حسب اللي محتاج يحصل بعدها.",
                )
            }
        }

        if (needsYouOffers.isNotEmpty() || needsYouDirect.isNotEmpty()) {
            item { TeswaSectionHeader("محتاجك") }
            items(needsYouOffers, key = { "needs-offer:${it.id}" }) { offer ->
                OfferActivityRow(offer, "عرض مستني قرارك") { onOpenOffer(OfferDirection.INCOMING) }
            }
            items(needsYouDirect, key = { "needs-direct:${it.id}" }) { conversation ->
                DirectActivityRow(conversation, "طلب كلام مستني ردك") { onOpenDirect(conversation) }
            }
        }

        if (waitingOffers.isNotEmpty()) {
            item { TeswaSectionHeader("مستني") }
            items(waitingOffers, key = { "waiting-offer:${it.id}" }) { offer ->
                OfferActivityRow(offer, "عرضك عند الطرف التاني") { onOpenOffer(OfferDirection.SENT) }
            }
        }

        if (activeDeals.isNotEmpty()) {
            item { TeswaSectionHeader("بينكم دلوقتي") }
            items(activeDeals, key = { "active-deal:${it.dealId}" }) { deal ->
                DealActivityRow(deal, onClick = { onOpenDeal(deal) })
            }
        }

        if (conversationDirect.isNotEmpty() || contextual.isNotEmpty()) {
            item { TeswaSectionHeader("رسائل") }
            items(conversationDirect, key = { "direct:${it.id}" }) { conversation ->
                DirectActivityRow(conversation, conversation.lastMessageBody ?: "محادثة مباشرة") {
                    onOpenDirect(conversation)
                }
            }
            items(contextual, key = { "contextual:${it.id}" }) { conversation ->
                ContextualActivityRow(conversation) { onOpenContextual(conversation) }
            }
        }

        if (historyDeals.isNotEmpty() || historyOffers.isNotEmpty()) {
            item { TeswaSectionHeader("السجل") }
            items(historyDeals.take(4), key = { "history-deal:${it.dealId}" }) { deal ->
                DealActivityRow(deal, onClick = { onOpenDeal(deal) })
            }
            items(historyOffers.take(4), key = { "history-offer:${it.direction}:${it.id}" }) { offer ->
                OfferActivityRow(offer, "عرض محفوظ في السجل") { onOpenOffer(offer.direction) }
            }
        }
    }
}

@Composable
private fun OfferActivityRow(offer: OfferSummary, supporting: String, onClick: () -> Unit) {
    BetweenUsActivityRow(
        icon = TeswaIcons.Exchange,
        title = "${offer.requestedItem.title} مقابل ${offer.offeredItem.title}",
        supporting = supporting,
        state = offerStatusLabel(offer.status),
        stateEmphasis = if (offer.status == "accepted") TeswaEmphasis.Strong else TeswaEmphasis.Normal,
        onClick = onClick,
    )
}

@Composable
private fun DealActivityRow(deal: DealConversation, onClick: () -> Unit) {
    BetweenUsActivityRow(
        icon = TeswaIcons.Accepted,
        title = "${deal.requestedItemTitle} مقابل ${deal.offeredItemTitle}",
        supporting = deal.otherDisplayName ?: "صفقة مع مستخدم تِسوى",
        state = dealActivityLabel(deal.status),
        stateEmphasis = if (deal.status == "completed") TeswaEmphasis.Normal else TeswaEmphasis.Strong,
        unreadCount = deal.unreadCount,
        onClick = onClick,
    )
}

@Composable
private fun DirectActivityRow(conversation: DirectConversation, supporting: String, onClick: () -> Unit) {
    BetweenUsActivityRow(
        icon = TeswaIcons.Conversation,
        title = conversation.otherDisplayName ?: conversation.otherUsername ?: "مستخدم تِسوى",
        supporting = supporting,
        state = directActivityLabel(conversation.status),
        stateEmphasis = if (conversation.requiresAction) TeswaEmphasis.Strong else TeswaEmphasis.Quiet,
        unreadCount = conversation.unreadCount,
        onClick = onClick,
    )
}

@Composable
private fun ContextualActivityRow(conversation: ContextualConversation, onClick: () -> Unit) {
    BetweenUsActivityRow(
        icon = TeswaIcons.Conversation,
        title = conversation.other.displayName ?: conversation.other.username ?: "مستخدم تِسوى",
        supporting = conversation.latestBody ?: "رد بدأ من قصة",
        state = "رد على قصة",
        unreadCount = conversation.unreadCount,
        onClick = onClick,
    )
}

@Composable
private fun BetweenUsActivityRow(
    icon: ImageVector,
    title: String,
    supporting: String,
    state: String,
    stateEmphasis: TeswaEmphasis = TeswaEmphasis.Quiet,
    unreadCount: Int = 0,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = TeswaSpacing.xs),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.medium,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.padding(TeswaSpacing.sm),
                    tint = MaterialTheme.colorScheme.primary,
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
                    maxLines = 2,
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
                TeswaStatePill(state, emphasis = stateEmphasis)
                if (unreadCount > 0) {
                    Text(
                        "$unreadCount جديد",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
