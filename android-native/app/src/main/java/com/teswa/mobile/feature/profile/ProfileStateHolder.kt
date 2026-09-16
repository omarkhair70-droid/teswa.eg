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
    private val imageRepository: ProfileImageRepository,
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
    var messageIsError by mutableStateOf(true)
        private set
    var imageBusyKind by mutableStateOf<ProfileImageKind?>(null)
        private set
    var imageProgress by mutableStateOf(0)
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
                if (silent && state is ProfileUiState.Ready && !result.unauthorized) {
                    message = result.message
                    messageIsError = true
                }
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
        draft.validate()?.let { message = it; messageIsError = true; return }
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
                messageIsError = true
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
                messageIsError = true
            }
        }
        actingListingId = null
    }

    val currentProfile: MyProfile?
        get() = (state as? ProfileUiState.Ready)?.overview?.profile

    fun showImageError(value: String) {
        message = value
        messageIsError = true
    }

    suspend fun replaceImage(kind: ProfileImageKind, asset: ProfileImageAsset): Boolean {
        if (imageBusyKind != null) return false
        val profile = currentProfile ?: return false
        asset.validate()?.let { showImageError(it); return false }
        imageBusyKind = kind
        imageProgress = 0
        message = null
        val previous = if (kind == ProfileImageKind.AVATAR) profile.avatarUrl else profile.coverUrl
        val result = imageRepository.replace(session, kind, asset, previous) { imageProgress = it }
        val success = applyImageResult(kind, result)
        imageBusyKind = null
        imageProgress = 0
        return success
    }

    suspend fun removeImage(kind: ProfileImageKind) {
        if (imageBusyKind != null) return
        val profile = currentProfile ?: return
        val current = if (kind == ProfileImageKind.AVATAR) profile.avatarUrl else profile.coverUrl
        if (current == null) return
        imageBusyKind = kind
        imageProgress = 0
        message = null
        applyImageResult(kind, imageRepository.remove(session, kind, current))
        imageBusyKind = null
    }

    private fun applyImageResult(kind: ProfileImageKind, result: ProfileResult<ProfileImageMutation>): Boolean {
        return when (result) {
            is ProfileResult.Success -> {
                session = result.session
                val ready = state as? ProfileUiState.Ready
                if (ready != null) {
                    val updated = if (kind == ProfileImageKind.AVATAR) {
                        ready.overview.profile.copy(avatarUrl = result.value.imageUrl)
                    } else {
                        ready.overview.profile.copy(coverUrl = result.value.imageUrl)
                    }
                    state = ProfileUiState.Ready(ready.overview.copy(profile = updated))
                }
                message = result.value.message
                messageIsError = false
                true
            }
            is ProfileResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                message = if (result.unauthorized) null else result.message
                messageIsError = true
                false
            }
        }
    }
}
