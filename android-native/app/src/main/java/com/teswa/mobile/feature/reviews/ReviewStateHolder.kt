package com.teswa.mobile.feature.reviews

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface ReviewUiState {
    data object Loading : ReviewUiState
    data class Ready(val context: DealReviewContext) : ReviewUiState
    data class Error(val message: String) : ReviewUiState
}

class ReviewStateHolder(
    initialSession: AuthSession,
    private val dealId: String,
    private val repository: ReviewRepository,
) {
    var session by mutableStateOf(initialSession); private set
    var state by mutableStateOf<ReviewUiState>(ReviewUiState.Loading); private set
    var draft by mutableStateOf(ReviewDraft()); private set
    var submitting by mutableStateOf(false); private set
    var message by mutableStateOf<String?>(null); private set
    var sessionExpired by mutableStateOf(false); private set

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    suspend fun load() {
        state = ReviewUiState.Loading
        sessionExpired = false
        when (val result = repository.load(session, dealId)) {
            is ReviewResult.Success -> { session = result.session; state = ReviewUiState.Ready(result.value); message = null }
            is ReviewResult.Failure -> fail(result, fullState = true)
        }
    }

    fun setRating(value: Int) { if (!submitting) draft = draft.copy(rating = value.coerceIn(1, 5)) }
    fun setComment(value: String) { if (!submitting) draft = draft.copy(comment = value.take(1_000)) }
    fun toggleClearDescription() { if (!submitting) draft = draft.copy(clearDescription = !draft.clearDescription) }
    fun toggleGoodCommunication() { if (!submitting) draft = draft.copy(goodCommunication = !draft.goodCommunication) }
    fun toggleOnTime() { if (!submitting) draft = draft.copy(onTime = !draft.onTime) }
    fun toggleRespectful() { if (!submitting) draft = draft.copy(respectfulSwapper = !draft.respectfulSwapper) }

    suspend fun submit() {
        val ready = state as? ReviewUiState.Ready ?: return
        if (ready.context.existingReview != null || submitting) return
        draft.validate()?.let { message = it; return }
        submitting = true
        message = null
        when (val result = repository.submit(session, ready.context, draft)) {
            is ReviewResult.Success -> {
                session = result.session
                state = ReviewUiState.Ready(ready.context.copy(existingReview = result.value))
                message = "شكرًا—تقييمك اتحفظ وبيساهم في ثقة المجتمع."
            }
            is ReviewResult.Failure -> fail(result, fullState = false)
        }
        submitting = false
    }

    private fun fail(result: ReviewResult.Failure, fullState: Boolean) {
        result.session?.let { session = it }
        sessionExpired = result.unauthorized
        if (fullState) state = ReviewUiState.Error(result.message)
        else message = if (result.unauthorized) null else result.message
    }
}
