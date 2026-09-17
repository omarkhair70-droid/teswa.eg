package com.teswa.mobile.feature.offers

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaExchangeMemoryPair
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaMotion
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTraceNote
import com.teswa.mobile.ui.system.performTeswa
import kotlinx.coroutines.launch

@Composable
fun OffersContent(
    holder: OffersStateHolder,
    onOpenDeal: (String) -> Unit,
    modifier: Modifier = Modifier,
    initialDirection: OfferDirection = OfferDirection.INCOMING,
) {
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var direction by remember(initialDirection) { mutableStateOf(initialDirection) }
    var confirmation by remember { mutableStateOf<Pair<String, OfferAction>?>(null) }

    Column(modifier.fillMaxSize()) {
        OfferLaneHeader(direction)
        DirectionPicker(direction) { direction = it }
        holder.message?.let { message ->
            TeswaInlineMessage(
                title = "العروض ما اتحدثتش",
                body = message,
                emphasis = TeswaEmphasis.Quiet,
                actionLabel = "حاول تاني",
                onAction = { scope.launch { holder.load(silent = true) } },
                modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
            )
        }
        when (val state = holder.state) {
            OffersUiState.Loading -> OfferCenterState("بنجمع العروض اللي بين الحاجات…", loading = true)
            is OffersUiState.Empty -> OfferCenterState(state.message)
            is OffersUiState.Error -> OfferCenterState(state.message) { scope.launch { holder.load() } }
            is OffersUiState.Content -> {
                val rows = if (direction == OfferDirection.INCOMING) state.inbox.incoming else state.inbox.sent
                if (rows.isEmpty()) {
                    OfferCenterState(
                        if (direction == OfferDirection.INCOMING) {
                            "مفيش علاقات مستنية قرارك دلوقتي."
                        } else {
                            "لسه ما بعتش عرض يربط حاجتين."
                        },
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            horizontal = TeswaLayout.ScreenHorizontal,
                            vertical = TeswaSpacing.md,
                        ),
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
                    ) {
                        items(rows, key = { "${it.direction}:${it.id}" }) { offer ->
                            OfferMoment(
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
        TeswaActionSheet(
            title = if (action == OfferAction.ACCEPT) "تثبّت العلاقة دي كصفقة؟" else "تقفل العرض؟",
            supporting = if (action == OfferAction.ACCEPT) {
                "الحاجتين هيفضلوا مرتبطين في صفقة مشتركة عشان تنسقوا التبديل. القبول مش تأكيد إن التبديل حصل في الواقع."
            } else {
                "العرض هيتقفل كجزء من السجل، وممكن يبدأ عرض مختلف بعدين."
            },
            onDismiss = { confirmation = null },
        ) {
            TeswaPrimaryAction(
                text = if (action == OfferAction.ACCEPT) "موافق — افتح الصفقة" else "مش مناسب",
                icon = if (action == OfferAction.ACCEPT) TeswaIcons.Accepted else TeswaIcons.Clear,
                onClick = {
                    confirmation = null
                    scope.launch {
                        val offer = (holder.state as? OffersUiState.Content)
                            ?.inbox
                            ?.incoming
                            ?.firstOrNull { it.id == offerId }
                        if (offer != null) {
                            holder.act(offer, action)
                            val dealId = holder.consumeAcceptedDeal()
                            when {
                                dealId != null -> haptics.performTeswa(TeswaHapticEvent.Success)
                                holder.message == null && action == OfferAction.SOFT_REJECT -> {
                                    haptics.performTeswa(TeswaHapticEvent.Reject)
                                }
                            }
                            dealId?.let(onOpenDeal)
                        }
                    }
                },
            )
            TextButton(
                onClick = { confirmation = null },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("رجوع") }
        }
    }
}

@Composable
private fun OfferLaneHeader(direction: OfferDirection) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TeswaMarkIcon(
            mark = TeswaMark.BetweenUs,
            color = MaterialTheme.colorScheme.primary,
            size = 28.dp,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (direction == OfferDirection.INCOMING) "علاقات محتاجة قرارك" else "علاقات مستنية الطرف التاني",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "كل عرض هنا حاجتين اتقابلوا لأول مرة.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DirectionPicker(selected: OfferDirection, onSelect: (OfferDirection) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        TeswaChoiceChip(
            label = "محتاجاني",
            selected = selected == OfferDirection.INCOMING,
            onClick = { onSelect(OfferDirection.INCOMING) },
            modifier = Modifier.weight(1f),
        )
        TeswaChoiceChip(
            label = "مستني رد",
            selected = selected == OfferDirection.SENT,
            onClick = { onSelect(OfferDirection.SENT) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun OfferMoment(
    offer: OfferSummary,
    working: Boolean,
    onAction: (OfferAction) -> Unit,
    onOpenDeal: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md)) {
        AnimatedContent(
            targetState = offer.status,
            transitionSpec = {
                fadeIn(TeswaMotion.standard()) togetherWith fadeOut(TeswaMotion.standard())
            },
            label = "offer-state",
        ) { status ->
            Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
                TeswaExchangeMemoryPair(
                    requestedTitle = offer.requestedItem.title,
                    requestedImageUrl = offer.requestedItem.imageUrl,
                    offeredTitle = offer.offeredItem.title,
                    offeredImageUrl = offer.offeredItem.imageUrl,
                    state = offerStatusLabel(status),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TeswaStatePill(
                        text = offerStatusLabel(status),
                        emphasis = when (status) {
                            "accepted" -> TeswaEmphasis.Commitment
                            "thinking" -> TeswaEmphasis.Normal
                            "soft_rejected", "withdrawn", "expired", "cancelled_after_accept" -> TeswaEmphasis.Quiet
                            else -> TeswaEmphasis.Strong
                        },
                    )
                }
            }
        }
        offer.message?.takeIf { it.isNotBlank() }?.let { message ->
            TeswaTraceNote(message)
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
                text = "افتح العلاقة كصفقة",
                icon = TeswaIcons.Accepted,
                onClick = onOpenDeal,
            )
        }
    }
}

@Composable
private fun OfferCenterState(
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
                title = "مفيش عرض هنا دلوقتي",
                body = message,
                actionLabel = if (action != null) "حاول تاني" else null,
                onAction = action,
            )
        }
    }
}
