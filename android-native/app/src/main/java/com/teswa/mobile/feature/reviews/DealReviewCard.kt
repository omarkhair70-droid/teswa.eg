package com.teswa.mobile.feature.reviews

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEvidenceLine
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import kotlinx.coroutines.launch

@Composable
fun DealReviewCard(
    dealId: String,
    initialSession: AuthSession,
    repository: ReviewRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
) {
    val holder = remember(dealId, repository) { ReviewStateHolder(initialSession, dealId, repository) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(initialSession.accessToken) { holder.updateSession(initialSession); holder.load() }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
        when (val state = holder.state) {
            ReviewUiState.Loading -> TeswaInlineLoading("بنراجع حالة التقييم…")
            is ReviewUiState.Error -> TeswaInlineMessage(
                title = "التقييم مش متاح دلوقتي",
                body = state.message,
                icon = TeswaIcons.Refresh,
                actionLabel = "حاول تاني",
                onAction = { scope.launch { holder.load() } },
            )
            is ReviewUiState.Ready -> {
                val existing = state.context.existingReview
                TeswaSectionHeader(
                    if (existing == null) "قيّم تجربتك مع ${state.context.reviewee.displayName}" else "تقييمك للتجربة",
                )
                if (existing != null) {
                    ExistingReviewContent(existing)
                } else {
                    TeswaInlineMessage(
                        title = "دليل من صفقة حقيقية",
                        body = "التقييم متاح لأن الطرفين أكدوا إن التبديل تم، ومش بيتنشر كتفاعل مجهول.",
                        icon = TeswaIcons.Trust,
                        emphasis = TeswaEmphasis.Normal,
                    )
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        (1..5).forEach { value ->
                            TeswaChoiceChip(
                                label = value.toString(),
                                selected = holder.draft.rating == value,
                                onClick = { holder.setRating(value) },
                                leadingIcon = TeswaIcons.Review,
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                        ReviewSignal("وصف واضح", holder.draft.clearDescription, holder::toggleClearDescription, Modifier.weight(1f))
                        ReviewSignal("تواصل جيد", holder.draft.goodCommunication, holder::toggleGoodCommunication, Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                        ReviewSignal("ملتزم", holder.draft.onTime, holder::toggleOnTime, Modifier.weight(1f))
                        ReviewSignal("محترم", holder.draft.respectfulSwapper, holder::toggleRespectful, Modifier.weight(1f))
                    }
                    TeswaTextField(
                        value = holder.draft.comment,
                        onValueChange = holder::setComment,
                        label = "تعليق اختياري",
                        supportingText = "${holder.draft.comment.length} / 1000",
                        singleLine = false,
                        minLines = 2,
                        maxLines = 4,
                        enabled = !holder.submitting,
                    )
                    TeswaPrimaryAction(
                        text = "إرسال التقييم",
                        icon = TeswaIcons.Review,
                        onClick = { scope.launch { holder.submit() } },
                        enabled = holder.draft.rating in 1..5,
                        loading = holder.submitting,
                    )
                }
                holder.message?.let { message ->
                    TeswaInlineMessage(
                        title = if (existing == null) "التقييم ما اتبعتش" else "تم",
                        body = message,
                        emphasis = if (existing == null) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
                    )
                }
            }
        }
    }
}

@Composable
private fun ReviewSignal(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    TeswaChoiceChip(label = label, selected = selected, onClick = onClick, modifier = modifier)
}

@Composable
private fun ExistingReviewContent(review: ExistingReview) {
    TeswaEvidenceLine(
        icon = TeswaIcons.Review,
        text = "${review.rating} من 5",
        supporting = "تقييمك محفوظ على الصفقة المكتملة",
    )
    val signals = buildList {
        if (review.clearDescription) add("وصف واضح")
        if (review.goodCommunication) add("تواصل جيد")
        if (review.onTime) add("ملتزم بالميعاد")
        if (review.respectfulSwapper) add("محترم في التبديل")
    }
    if (signals.isNotEmpty()) Text(signals.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
    review.comment?.let { Text(it) }
}
