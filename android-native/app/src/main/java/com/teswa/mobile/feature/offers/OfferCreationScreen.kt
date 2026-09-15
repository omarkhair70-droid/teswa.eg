package com.teswa.mobile.feature.offers

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun OfferCreationScreen(
    requestedItemId: String,
    initialSession: AuthSession,
    repository: OffersRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onAddItem: () -> Unit,
    onOfferSent: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(requestedItemId, initialSession.user.id, repository) {
        OfferCreationStateHolder(initialSession, requestedItemId, repository)
    }
    val scope = rememberCoroutineScope()

    LaunchedEffect(requestedItemId, initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    when (val state = holder.state) {
        OfferCreationUiState.Loading -> CreationCenter("بنجهز عرض التبديل…", loading = true, modifier = modifier)
        is OfferCreationUiState.Error -> CreationCenter(
            state.message,
            modifier = modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع" to onBack,
        )
        is OfferCreationUiState.Sent -> OfferSentState(modifier, onOfferSent)
        is OfferCreationUiState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = onBack) { Text("رجوع") }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("قدّم عرض تبديل", style = MaterialTheme.typography.headlineSmall)
                        Text("اختار حاجة واحدة من عندك", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            item { RequestedItemCard(state.context.requestedItem) }
            if (state.context.myActiveItems.isEmpty()) {
                item {
                    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .5f)) {
                        Column(Modifier.padding(18.dp)) {
                            Text("محتاج تعرض حاجة الأول", style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.height(6.dp))
                            Text("عرض التبديل لازم يربط بين عنصر نشط من عندك والعنصر اللي اخترته.")
                            Spacer(Modifier.height(14.dp))
                            Button(onClick = onAddItem, modifier = Modifier.fillMaxWidth()) { Text("اعرض عنصر جديد") }
                        }
                    }
                }
            } else {
                item {
                    Text("هتقدم إيه؟", style = MaterialTheme.typography.titleLarge)
                    Text("اختيارك مش نهائي غير بعد الضغط على إرسال.", style = MaterialTheme.typography.bodySmall)
                }
                items(state.context.myActiveItems, key = { it.id }) { item ->
                    SelectableOfferItem(item, selected = holder.selectedItemId == item.id) { holder.select(item.id) }
                }
                item {
                    OutlinedTextField(
                        value = holder.message,
                        onValueChange = holder::updateMessage,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("رسالة قصيرة — اختياري") },
                        placeholder = { Text("مثلاً: حالته ممتازة ومتاح أقابلك في…") },
                        minLines = 3,
                        maxLines = 5,
                        supportingText = { Text("${holder.message.length} / 500") },
                    )
                }
                holder.submitError?.let { error ->
                    item {
                        Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.error.copy(alpha = .1f)) {
                            Text(error, Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
                item {
                    Button(
                        onClick = { scope.launch { holder.submit() } },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = holder.selectedItemId != null && !holder.submitting,
                    ) {
                        if (holder.submitting) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(if (holder.submitting) "جاري الإرسال…" else "إرسال عرض التبديل")
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "العرض رسمي لكنه مش قبول تلقائي؛ صاحب العنصر يقدر يقبل أو يطلب وقت أو يرفض.",
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun RequestedItemCard(item: OfferItemSummary) {
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .55f)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            NetworkImage(
                item.imageUrl,
                item.title,
                Modifier.size(82.dp).clip(MaterialTheme.shapes.medium),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("الحاجة اللي عجبتك", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(4.dp))
                Text(item.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun SelectableOfferItem(item: OfferItemSummary, selected: Boolean, onSelect: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onSelect),
        border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = .25f)),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            NetworkImage(item.imageUrl, item.title, Modifier.size(68.dp).clip(MaterialTheme.shapes.small))
            Spacer(Modifier.width(12.dp))
            Text(item.title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.width(8.dp))
            Surface(shape = CircleShape, color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {
                Text(if (selected) "✓" else "○", Modifier.padding(horizontal = 9.dp, vertical = 5.dp), color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun OfferSentState(modifier: Modifier, onOfferSent: () -> Unit) {
    CreationCenter(
        "عرضك اتبعت. هتلاقي حالته في مركز الرسائل والعروض.",
        modifier = modifier,
        primary = "متابعة العرض" to onOfferSent,
    )
}

@Composable
private fun CreationCenter(
    message: String,
    loading: Boolean = false,
    modifier: Modifier,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
) {
    Column(
        modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(14.dp)) }
        Text(message, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
        primary?.let { (label, action) -> Spacer(Modifier.height(18.dp)); Button(onClick = action, modifier = Modifier.fillMaxWidth()) { Text(label) } }
        secondary?.let { (label, action) -> Spacer(Modifier.height(8.dp)); OutlinedButton(onClick = action, modifier = Modifier.fillMaxWidth()) { Text(label) } }
    }
}
