package com.teswa.mobile.feature.reviews

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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
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

    Card {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (val state = holder.state) {
                ReviewUiState.Loading -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(modifier = Modifier.height(22.dp), strokeWidth = 2.dp)
                    Text("بنراجع حالة تقييم الصفقة…")
                }
                is ReviewUiState.Error -> {
                    Text("التقييم", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { scope.launch { holder.load() } }) { Text("حاول تاني") }
                }
                is ReviewUiState.Ready -> {
                    val existing = state.context.existingReview
                    Text(
                        if (existing == null) "قيّم تجربتك مع ${state.context.reviewee.displayName}" else "تقييمك للتجربة",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    if (existing != null) {
                        ExistingReviewContent(existing)
                    } else {
                        Text("التقييم مرتبط بصفقة مكتملة ومش بيتنشر كنص مجهول.", style = MaterialTheme.typography.bodySmall)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            (1..5).forEach { value ->
                                FilterChip(
                                    selected = holder.draft.rating == value,
                                    onClick = { holder.setRating(value) },
                                    label = { Text("$value★") },
                                    enabled = !holder.submitting,
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            ReviewSignal("وصف واضح", holder.draft.clearDescription, holder::toggleClearDescription, Modifier.weight(1f))
                            ReviewSignal("تواصل جيد", holder.draft.goodCommunication, holder::toggleGoodCommunication, Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            ReviewSignal("ملتزم", holder.draft.onTime, holder::toggleOnTime, Modifier.weight(1f))
                            ReviewSignal("محترم", holder.draft.respectfulSwapper, holder::toggleRespectful, Modifier.weight(1f))
                        }
                        OutlinedTextField(
                            value = holder.draft.comment,
                            onValueChange = holder::setComment,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("تعليق اختياري") },
                            minLines = 2,
                            maxLines = 4,
                            enabled = !holder.submitting,
                            supportingText = { Text("${holder.draft.comment.length} / 1000") },
                        )
                        Button(
                            onClick = { scope.launch { holder.submit() } },
                            enabled = !holder.submitting && holder.draft.rating in 1..5,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (holder.submitting) "جاري إرسال التقييم…" else "إرسال التقييم") }
                    }
                    holder.message?.let {
                        Spacer(Modifier.height(2.dp))
                        Text(it, color = if (existing == null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewSignal(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) }, modifier = modifier)
}

@Composable
private fun ExistingReviewContent(review: ExistingReview) {
    Text("${review.rating} من 5 ★", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
    val signals = buildList {
        if (review.clearDescription) add("وصف واضح")
        if (review.goodCommunication) add("تواصل جيد")
        if (review.onTime) add("ملتزم بالميعاد")
        if (review.respectfulSwapper) add("محترم في التبديل")
    }
    if (signals.isNotEmpty()) Text(signals.joinToString(" • "), style = MaterialTheme.typography.bodySmall)
    review.comment?.let { Text(it) }
}
