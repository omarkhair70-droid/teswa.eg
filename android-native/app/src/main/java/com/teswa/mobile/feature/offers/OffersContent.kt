package com.teswa.mobile.feature.offers

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaExchangePair
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import kotlinx.coroutines.launch

@Composable
fun OffersContent(
    holder: OffersStateHolder,
    onOpenDeal: (String) -> Unit,
    modifier: Modifier = Modifier,
    initialDirection: OfferDirection = OfferDirection.INCOMING,
) {
    val scope = rememberCoroutineScope()
    var direction by remember(initialDirection) { mutableStateOf(initialDirection) }
    var confirmation by remember { mutableStateOf<Pair<String, OfferAction>?>(null) }

    Column(modifier.fillMaxSize()) {
        DirectionPicker(direction) { direction = it }
        holder.message?.let { OfferBanner(it) { scope.launch { holder.load(silent = true) } } }
        when (val state = holder.state) {
            OffersUiState.Loading -> OfferCenterState("بنحمّل العروض…", loading = true)
            is OffersUiState.Empty -> OfferCenterState(state.message)
            is OffersUiState.Error -> OfferCenterState(state.message) { scope.launch { holder.load() } }
            is OffersUiState.Content -> {
                val rows = if (direction == OfferDirection.INCOMING) state.inbox.incoming else state.inbox.sent
                if (rows.isEmpty()) {
                    OfferCenterState(
                        if (direction == OfferDirection.INCOMING) "مفيش عروض مستنية ردك." else "لسه ما بعتش عروض.",
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(rows, key = { "${it.direction}:${it.id}" }) { offer ->
                            OfferCard(
                                offer = offer,
                                working = holder.actingOfferId == offer.id,
                                onAction = { action ->
                                    if (action == OfferAction.THINKING) {
                                        scope.launch { holder.act(offer, action) }
                                    } else {
                                        confirmation = offer.id to action
                                    }
                                },
                                onOpenDeal = { offer.dealId?.let(onOpenDeal) },
                            )
                        }
                    }
                }
            }
        }
    }

    confirmation?.let { (offerId, action) ->
        AlertDialog(
            onDismissRequest = { confirmation = null },
            title = { Text(if (action == OfferAction.ACCEPT) "قبول العرض؟" else "رفض العرض بلطف؟") },
            text = {
                Text(
                    if (action == OfferAction.ACCEPT) "هتتفتح محادثة صفقة عشان تنسقوا التبديل."
                    else "العرض هيتقفل، وممكن الطرف التاني يبعت عرض مختلف بعدين.",
                )
            },
            confirmButton = {
                Button(onClick = {
                    confirmation = null
                    scope.launch {
                        val offer = (holder.state as? OffersUiState.Content)?.inbox?.incoming?.firstOrNull { it.id == offerId }
                        if (offer != null) holder.act(offer, action)
                        holder.consumeAcceptedDeal()?.let(onOpenDeal)
                    }
                }) { Text(if (action == OfferAction.ACCEPT) "اقبل وافتح المحادثة" else "ارفض") }
            },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("رجوع") } },
        )
    }
}

@Composable
private fun DirectionPicker(selected: OfferDirection, onSelect: (OfferDirection) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        TeswaChoiceChip(
            label = "محتاجاني",
            selected = selected == OfferDirection.INCOMING,
            onClick = { onSelect(OfferDirection.INCOMING) },
            modifier = Modifier.weight(1f),
            leadingIcon = TeswaIcons.Exchange,
        )
        TeswaChoiceChip(
            label = "مستني رد",
            selected = selected == OfferDirection.SENT,
            onClick = { onSelect(OfferDirection.SENT) },
            modifier = Modifier.weight(1f),
            leadingIcon = TeswaIcons.Waiting,
        )
    }
}

@Composable
private fun OfferCard(
    offer: OfferSummary,
    working: Boolean,
    onAction: (OfferAction) -> Unit,
    onOpenDeal: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
        TeswaExchangePair(
            requested = offer.requestedItem.toIdentity(),
            offered = offer.offeredItem.toIdentity(),
            state = offerStatusLabel(offer.status),
            stateEmphasis = when (offer.status) {
                "accepted" -> TeswaEmphasis.Commitment
                "thinking" -> TeswaEmphasis.Normal
                "soft_rejected", "withdrawn", "expired", "cancelled_after_accept" -> TeswaEmphasis.Quiet
                else -> TeswaEmphasis.Strong
            },
        )
        offer.message?.takeIf { it.isNotBlank() }?.let { message ->
            TeswaInlineMessage(
                title = if (offer.direction == OfferDirection.INCOMING) "رسالة مع العرض" else "رسالتك مع العرض",
                body = message,
                icon = TeswaIcons.Conversation,
            )
        }
        when {
            working -> TeswaInlineLoading("بنحدّث حالة العرض…")
            offer.direction == OfferDirection.INCOMING && offer.status in setOf("pending", "thinking") -> {
                TeswaPrimaryAction(
                    text = "موافق — ابدأوا صفقة",
                    icon = TeswaIcons.Accepted,
                    onClick = { onAction(OfferAction.ACCEPT) },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    TeswaSecondaryAction(
                        text = "هفكر",
                        icon = TeswaIcons.Waiting,
                        onClick = { onAction(OfferAction.THINKING) },
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(
                        onClick = { onAction(OfferAction.SOFT_REJECT) },
                        modifier = Modifier.weight(1f),
                    ) { Text("مش مناسب") }
                }
            }
            offer.dealId != null -> TeswaSecondaryAction(
                text = "افتح الصفقة",
                icon = TeswaIcons.Accepted,
                onClick = onOpenDeal,
            )
        }
    }
}

private fun OfferItemSummary.toIdentity() = TeswaObjectIdentity(
    title = title,
    imageUrl = imageUrl,
)

@Composable
private fun OfferCenterState(message: String, loading: Boolean = false, action: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(12.dp)) }
        Text(message)
        if (action != null) { Spacer(Modifier.height(12.dp)); Button(onClick = action) { Text("حاول تاني") } }
    }
}

@Composable
private fun OfferBanner(message: String, retry: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.error.copy(alpha = .09f)).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        Text("إعادة", Modifier.clickable(onClick = retry).padding(8.dp), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
    }
}
