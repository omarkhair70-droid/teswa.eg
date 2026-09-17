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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaBottomCommitBar
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaExchangePair
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectRow
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
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
        is OfferCreationUiState.Ready -> {
            var showSelector by remember { mutableStateOf(false) }
            val selected = state.context.myActiveItems.firstOrNull { it.id == holder.selectedItemId }
            Column(modifier.fillMaxSize()) {
                TeswaFocusedHeader(title = "قدّم عرض", onBack = onBack)
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = TeswaLayout.FocusedContentPadding,
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                ) {
                    item {
                        TeswaExchangePair(
                            requested = state.context.requestedItem.toIdentity(),
                            offered = selected?.toIdentity(),
                            state = "عرض جديد",
                            stateEmphasis = TeswaEmphasis.Strong,
                            emptyOfferedLabel = "اختار حاجة من دولابك",
                            onChooseOffered = if (state.context.myActiveItems.isEmpty()) null else ({ showSelector = true }),
                        )
                    }
                    if (state.context.myActiveItems.isEmpty()) {
                        item {
                            TeswaEmptyField(
                                title = "مفيش حاجة نشطة تقدمها",
                                body = "العرض لازم يربط حاجة واحدة نشطة من دولابك بالحاجة اللي اخترتها.",
                                actionLabel = "روح لدولابي",
                                actionIcon = TeswaIcons.Mine,
                                onAction = onAddItem,
                            )
                        }
                    } else {
                        if (selected != null) {
                            item {
                                androidx.compose.material3.TextButton(onClick = { showSelector = true }) {
                                    Text("غيّر الحاجة اللي هتقدمها")
                                }
                            }
                        }
                        item {
                            TeswaTextField(
                                value = holder.message,
                                onValueChange = holder::updateMessage,
                                label = "سياق إضافي — اختياري",
                                placeholder = "مثلاً: حالتها ممتازة ومتاح أقابلك في…",
                                supportingText = "${holder.message.length} / 500",
                                singleLine = false,
                                minLines = 3,
                                maxLines = 5,
                                enabled = !holder.submitting,
                            )
                        }
                        item {
                            TeswaInlineMessage(
                                title = "إيه اللي هيحصل؟",
                                body = "ده عرض واضح بين حاجتين. القبول بعد كده هيعمل صفقة مستقلة؛ مش معناه إن التبديل حصل.",
                                icon = TeswaIcons.Exchange,
                            )
                        }
                        holder.submitError?.let { error ->
                            item {
                                TeswaInlineMessage(
                                    title = "العرض ما اتبعتش",
                                    body = error,
                                    icon = TeswaIcons.Refresh,
                                    emphasis = TeswaEmphasis.Strong,
                                )
                            }
                        }
                    }
                }
                if (state.context.myActiveItems.isNotEmpty()) {
                    TeswaBottomCommitBar(
                        primaryLabel = "ابعت العرض",
                        primaryIcon = TeswaIcons.Send,
                        primaryEnabled = holder.selectedItemId != null,
                        primaryLoading = holder.submitting,
                        onPrimary = { scope.launch { holder.submit() } },
                    )
                }
            }

            if (showSelector) {
                TeswaActionSheet(
                    title = "اختار حاجة واحدة من دولابك",
                    supporting = "الاختيارات دي هي حاجاتك النشطة المؤهلة للعرض دلوقتي.",
                    onDismiss = { showSelector = false },
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                        state.context.myActiveItems.forEach { item ->
                            TeswaObjectRow(
                                item = item.toIdentity(),
                                state = if (item.id == holder.selectedItemId) "اختيارك" else null,
                                stateEmphasis = TeswaEmphasis.Strong,
                                onClick = {
                                    holder.select(item.id)
                                    showSelector = false
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun OfferItemSummary.toIdentity() = TeswaObjectIdentity(
    title = title,
    imageUrl = imageUrl,
)

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
