package com.teswa.mobile.feature.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface ProfileUiState {
    data object Loading : ProfileUiState
    data class Ready(val overview: ProfileOverview) : ProfileUiState
    data class Error(val message: String) : ProfileUiState
}

class ProfileStateHolder(
    initialSession: AuthSession,
    private val repository: ProfileRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<ProfileUiState>(ProfileUiState.Loading)
        private set
    var editDraft by mutableStateOf<ProfileEditDraft?>(null)
        private set
    var savingProfile by mutableStateOf(false)
        private set
    var actingListingId by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load(silent: Boolean = false) {
        if (!silent || state !is ProfileUiState.Ready) state = ProfileUiState.Loading
        sessionExpired = false
        when (val result = repository.load(session)) {
            is ProfileResult.Success -> {
                session = result.session
                state = ProfileUiState.Ready(result.value)
                message = null
            }
            is ProfileResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (silent && state is ProfileUiState.Ready && !result.unauthorized) message = result.message
                else state = ProfileUiState.Error(result.message)
            }
        }
    }

    fun beginEdit() {
        val profile = (state as? ProfileUiState.Ready)?.overview?.profile ?: return
        editDraft = ProfileEditDraft(
            displayName = profile.displayName,
            username = profile.username,
            profileTagline = profile.profileTagline.orEmpty(),
            bio = profile.bio.orEmpty(),
            city = profile.city.orEmpty(),
            area = profile.area.orEmpty(),
        )
        message = null
    }

    fun cancelEdit() {
        if (!savingProfile) editDraft = null
    }

    fun updateDraft(value: ProfileEditDraft) {
        if (!savingProfile) editDraft = value
    }

    suspend fun saveProfile() {
        val draft = editDraft ?: return
        draft.validate()?.let { message = it; return }
        savingProfile = true
        message = null
        when (val result = repository.update(session, draft)) {
            is ProfileResult.Success -> {
                session = result.session
                val current = state as? ProfileUiState.Ready
                if (current != null) state = ProfileUiState.Ready(current.overview.copy(profile = result.value))
                editDraft = null
            }
            is ProfileResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                message = if (result.unauthorized) null else result.message
            }
        }
        savingProfile = false
    }

    suspend fun actOnListing(listing: MyListing, action: ListingAction) {
        if (actingListingId != null) return
        actingListingId = listing.id
        message = null
        when (val result = repository.updateListing(session, listing.id, action)) {
            is ProfileResult.Success -> {
                session = result.session
                val current = state as? ProfileUiState.Ready
                if (current != null) {
                    val updated = when (action) {
                        ListingAction.ARCHIVE -> current.overview.listings.map { if (it.id == listing.id) it.copy(status = "archived") else it }
                        ListingAction.REACTIVATE -> current.overview.listings.map { if (it.id == listing.id) it.copy(status = "active") else it }
                        ListingAction.DELETE_ARCHIVED -> current.overview.listings.filterNot { it.id == listing.id }
                    }
                    state = ProfileUiState.Ready(current.overview.copy(listings = updated))
                }
            }
            is ProfileResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                message = if (result.unauthorized) null else result.message
            }
        }
        actingListingId = null
    }
}
