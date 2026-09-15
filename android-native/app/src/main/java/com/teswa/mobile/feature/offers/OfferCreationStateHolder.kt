package com.teswa.mobile.feature.offers

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface OfferCreationUiState {
    data object Loading : OfferCreationUiState
    data class Ready(val context: OfferCreationContext) : OfferCreationUiState
    data class Sent(val offer: CreatedOffer) : OfferCreationUiState
    data class Error(val message: String) : OfferCreationUiState
}

class OfferCreationStateHolder(
    initialSession: AuthSession,
    private val requestedItemId: String,
    private val repository: OffersRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<OfferCreationUiState>(OfferCreationUiState.Loading)
        private set
    var selectedItemId by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf("")
        private set
    var submitting by mutableStateOf(false)
        private set
    var submitError by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load() {
        state = OfferCreationUiState.Loading
        submitError = null
        sessionExpired = false
        when (val result = repository.loadCreation(session, requestedItemId)) {
            is OffersResult.Success -> {
                session = result.session
                state = OfferCreationUiState.Ready(result.value)
                if (result.value.myActiveItems.none { it.id == selectedItemId }) selectedItemId = null
            }
            is OffersResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                state = OfferCreationUiState.Error(result.message)
            }
        }
    }

    fun select(itemId: String) {
        if (!submitting) selectedItemId = itemId
    }

    fun updateMessage(value: String) {
        if (!submitting) message = value.take(500)
    }

    suspend fun submit() {
        val context = (state as? OfferCreationUiState.Ready)?.context ?: return
        val offeredId = selectedItemId ?: run {
            submitError = "اختار الحاجة اللي هتقدمها."
            return
        }
        submitting = true
        submitError = null
        when (val result = repository.create(
            session,
            requestedItemId,
            offeredId,
            context.receiverId,
            message,
        )) {
            is OffersResult.Success -> {
                session = result.session
                state = OfferCreationUiState.Sent(result.value)
            }
            is OffersResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                submitError = if (result.unauthorized) null else result.message
            }
        }
        submitting = false
    }
}
