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
import kotlinx.coroutines.launch

@Composable
fun OffersContent(
    holder: OffersStateHolder,
    onOpenDeal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var direction by remember { mutableStateOf(OfferDirection.INCOMING) }
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
                                        scope.launch { holder.act(offer.id, action) }
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
                        holder.act(offerId, action)
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
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DirectionChip("مستنية ردّي", selected == OfferDirection.INCOMING, Modifier.weight(1f)) {
            onSelect(OfferDirection.INCOMING)
        }
        DirectionChip("عروض بعتها", selected == OfferDirection.SENT, Modifier.weight(1f)) {
            onSelect(OfferDirection.SENT)
        }
    }
}

@Composable
private fun DirectionChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = CircleShape,
        color = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
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
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OfferItem(offer.requestedItem, "المطلوب", Modifier.weight(1f))
                Text("↔", modifier = Modifier.padding(horizontal = 10.dp), color = MaterialTheme.colorScheme.primary)
                OfferItem(offer.offeredItem, "المعروض", Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Surface(
                    shape = CircleShape,
                    color = if (offer.status == "accepted") MaterialTheme.colorScheme.secondaryContainer
                    else MaterialTheme.colorScheme.primaryContainer,
                ) {
                    Text(
                        offerStatusLabel(offer.status),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
                Text(if (offer.direction == OfferDirection.INCOMING) "عرض وارد" else "عرض مرسل", style = MaterialTheme.typography.labelMedium)
            }
            offer.message?.let { message ->
                Spacer(Modifier.height(10.dp))
                Text(message, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            if (working) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.width(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp)); Text("جاري تحديث العرض…", style = MaterialTheme.typography.bodySmall)
                }
            } else if (offer.direction == OfferDirection.INCOMING && offer.status in setOf("pending", "thinking")) {
                Spacer(Modifier.height(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onAction(OfferAction.ACCEPT) }, modifier = Modifier.fillMaxWidth()) { Text("قبول وبدء التنسيق") }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { onAction(OfferAction.THINKING) }, modifier = Modifier.weight(1f)) { Text("محتاج أفكر") }
                        TextButton(onClick = { onAction(OfferAction.SOFT_REJECT) }, modifier = Modifier.weight(1f)) { Text("مش مناسب") }
                    }
                }
            } else if (offer.dealId != null) {
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onOpenDeal, modifier = Modifier.fillMaxWidth()) { Text("افتح محادثة الصفقة") }
            }
        }
    }
}

@Composable
private fun OfferItem(item: OfferItemSummary, label: String, modifier: Modifier) {
    Column(modifier) {
        NetworkImage(
            url = item.imageUrl,
            contentDescription = item.title,
            modifier = Modifier.fillMaxWidth().aspectRatio(1.25f).clip(MaterialTheme.shapes.small),
        )
        Spacer(Modifier.height(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        Text(item.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

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
