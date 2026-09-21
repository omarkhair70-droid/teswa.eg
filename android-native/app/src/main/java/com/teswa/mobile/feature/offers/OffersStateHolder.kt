package com.teswa.mobile.feature.offers

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface OffersUiState {
    data object Loading : OffersUiState
    data class Empty(val message: String) : OffersUiState
    data class Content(val inbox: OffersInbox) : OffersUiState
    data class Error(val message: String) : OffersUiState
}

class OffersStateHolder(
    initialSession: AuthSession,
    private val repository: OffersRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<OffersUiState>(OffersUiState.Loading)
        private set
    var actingOfferId by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set
    var acceptedDealId by mutableStateOf<String?>(null)
        private set

    internal fun stateForTest(inbox: OffersInbox) {
        state = OffersUiState.Content(inbox)
    }

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load(silent: Boolean = false) {
        if (!silent || state !is OffersUiState.Content) state = OffersUiState.Loading
        sessionExpired = false
        when (val result = repository.load(session)) {
            is OffersResult.Success -> {
                session = result.session
                message = null
                state = if (result.value.incoming.isEmpty() && result.value.sent.isEmpty()) {
                    OffersUiState.Empty("أي عرض تبادل تبعته أو يستنى ردك هيظهر هنا.")
                } else {
                    OffersUiState.Content(result.value)
                }
            }
            is OffersResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (silent && state is OffersUiState.Content && !result.unauthorized) message = result.message
                else state = OffersUiState.Error(result.message)
            }
        }
    }

    suspend fun act(offer: OfferSummary, action: OfferAction) {
        if (actingOfferId != null) return
        actingOfferId = offer.id
        message = null
        when (val result = repository.act(session, offer, action)) {
            is OffersResult.Success -> {
                session = result.session
                val dealId = result.value.dealId
                acceptedDealId = dealId
                if (action == OfferAction.ACCEPT && dealId != null) {
                    val current = state as? OffersUiState.Content
                    if (current != null) {
                        fun settle(rows: List<OfferSummary>) = rows.map { row ->
                            if (row.id == offer.id) row.copy(status = "accepted", dealId = dealId) else row
                        }
                        state = OffersUiState.Content(
                            current.inbox.copy(
                                incoming = settle(current.inbox.incoming),
                                sent = settle(current.inbox.sent),
                            ),
                        )
                    } else {
                        load(silent = false)
                    }
                } else {
                    load(silent = false)
                }
            }
            is OffersResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                message = if (result.unauthorized) null else result.message
            }
        }
        actingOfferId = null
    }

    fun consumeAcceptedDeal(): String? = acceptedDealId.also { acceptedDealId = null }
}
