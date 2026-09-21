package com.teswa.mobile.feature.offers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaBottomCommitBar
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaExchangeMemoryPair
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectRow
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import com.teswa.mobile.ui.system.performTeswa
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
    val haptics = LocalHapticFeedback.current

    LaunchedEffect(requestedItemId, initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    when (val state = holder.state) {
        OfferCreationUiState.Loading -> CreationCenter(
            message = "بنجيب الحاجتين اللي هيبدأ بينهم العرض…",
            loading = true,
            modifier = modifier,
        )
        is OfferCreationUiState.Error -> CreationCenter(
            message = state.message,
            modifier = modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع" to onBack,
        )
        is OfferCreationUiState.Sent -> {
            LaunchedEffect(state) { haptics.performTeswa(TeswaHapticEvent.Success) }
            OfferSentState(modifier, onOfferSent)
        }
        is OfferCreationUiState.Ready -> {
            var showSelector by remember { mutableStateOf(false) }
            val selected = state.context.myActiveItems.firstOrNull { it.id == holder.selectedItemId }
            Column(modifier.fillMaxSize()) {
                TeswaFocusedHeader(title = "قدّم عرض", onBack = onBack)
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = TeswaLayout.FocusedContentPadding,
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
                ) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md)) {
                            TeswaExchangeMemoryPair(
                                requestedTitle = state.context.requestedItem.title,
                                requestedImageUrl = state.context.requestedItem.imageUrl,
                                offeredTitle = selected?.title,
                                offeredImageUrl = selected?.imageUrl,
                                state = "عرض جديد",
                                emptyOfferedLabel = "اختار حاجة من دولابك",
                            )
                            if (state.context.myActiveItems.isNotEmpty()) {
                                TextButton(onClick = { showSelector = true }) {
                                    Text(if (selected == null) "اختار الحاجة التانية" else "غيّر الحاجة اللي هتقدمها")
                                }
                            }
                        }
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
                        item {
                            TeswaTraceNote("العرض هنا علاقة بين حاجتين، مش سعر ولا تقييم عدالة. كل حاجة تفضل محتفظة بهويتها.")
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
                                body = "القبول هيحوّل العلاقة دي لصفقة مشتركة للتنسيق. مش معناه إن التبديل حصل في الواقع.",
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
                        onPrimary = {
                            haptics.performTeswa(TeswaHapticEvent.Commit)
                            scope.launch { holder.submit() }
                        },
                    )
                }
            }

            if (showSelector) {
                TeswaActionSheet(
                    title = "اختار حاجة واحدة من دولابك",
                    supporting = "دي حاجاتك النشطة المؤهلة تدخل العلاقة دلوقتي.",
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
                                    haptics.performTeswa(TeswaHapticEvent.Selection)
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
private fun OfferSentState(
    modifier: Modifier,
    onOfferSent: () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TeswaMarkIcon(
            mark = TeswaMark.BetweenUs,
            color = MaterialTheme.colorScheme.primary,
            size = TeswaSpacing.xxl + TeswaSpacing.xxl,
        )
        Spacer(Modifier.height(TeswaSpacing.lg))
        TeswaArchiveLabel("العرض خرج من عندك")
        Spacer(Modifier.height(TeswaSpacing.lg))
        Text(
            text = "بقت فيه علاقة مستنية قرار الطرف التاني",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(TeswaSpacing.sm))
        TeswaTraceNote("العرض هيفضل في «بيننا». القبول بس هو اللي ينقله لصفقة؛ لسه مفيش تبديل حصل في الواقع.")
        Spacer(Modifier.height(TeswaSpacing.xl))
        TeswaPrimaryAction(
            text = "روح للعلاقة",
            icon = TeswaIcons.Exchange,
            onClick = onOfferSent,
        )
    }
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
        modifier = modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) {
            TeswaInlineLoading(message)
        } else {
            TeswaInlineMessage(
                title = "العرض وقف هنا",
                body = message,
                emphasis = TeswaEmphasis.Strong,
                actionLabel = primary?.first,
                onAction = primary?.second,
            )
            secondary?.let {
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(
                    text = it.first,
                    onClick = it.second,
                )
            }
        }
    }
}
