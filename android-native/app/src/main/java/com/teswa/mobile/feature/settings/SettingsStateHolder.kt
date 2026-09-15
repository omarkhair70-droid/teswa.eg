package com.teswa.mobile.feature.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface SettingsUiState {
    data object Loading : SettingsUiState
    data class Ready(val overview: SettingsOverview) : SettingsUiState
    data class Error(val message: String) : SettingsUiState
}

class SettingsStateHolder(
    initialSession: AuthSession,
    private val repository: SettingsRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<SettingsUiState>(SettingsUiState.Loading)
        private set
    var savingPrivacy by mutableStateOf<DirectMessagePrivacy?>(null)
        private set
    var savingNotification by mutableStateOf<NotificationToggle?>(null)
        private set
    var unblockingUserId by mutableStateOf<String?>(null)
        private set
    var deletingAccount by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load() {
        state = SettingsUiState.Loading
        sessionExpired = false
        when (val result = repository.load(session)) {
            is SettingsResult.Success -> {
                session = result.session
                state = SettingsUiState.Ready(result.value)
                message = null
            }
            is SettingsResult.Failure -> handleFailure(result, replaceState = true)
        }
    }

    suspend fun setPrivacy(value: DirectMessagePrivacy) {
        val ready = state as? SettingsUiState.Ready ?: return
        if (savingPrivacy != null || value == ready.overview.privacy) return
        savingPrivacy = value
        message = null
        when (val result = repository.updatePrivacy(session, value)) {
            is SettingsResult.Success -> {
                session = result.session
                state = SettingsUiState.Ready(ready.overview.copy(privacy = result.value))
                message = "اتحفظ اختيار خصوصية الرسائل."
            }
            is SettingsResult.Failure -> handleFailure(result)
        }
        savingPrivacy = null
    }

    suspend fun setNotification(toggle: NotificationToggle, enabled: Boolean) {
        val ready = state as? SettingsUiState.Ready ?: return
        if (savingNotification != null) return
        savingNotification = toggle
        message = null
        when (val result = repository.updateNotification(session, toggle, enabled)) {
            is SettingsResult.Success -> {
                session = result.session
                state = SettingsUiState.Ready(ready.overview.copy(notifications = result.value))
            }
            is SettingsResult.Failure -> handleFailure(result)
        }
        savingNotification = null
    }

    suspend fun unblock(user: BlockedUser) {
        val ready = state as? SettingsUiState.Ready ?: return
        if (unblockingUserId != null) return
        unblockingUserId = user.id
        message = null
        when (val result = repository.unblock(session, user.id)) {
            is SettingsResult.Success -> {
                session = result.session
                state = SettingsUiState.Ready(
                    ready.overview.copy(blockedUsers = ready.overview.blockedUsers.filterNot { it.id == user.id }),
                )
                message = "تم إلغاء الحظر."
            }
            is SettingsResult.Failure -> handleFailure(result)
        }
        unblockingUserId = null
    }

    suspend fun deleteAccount(): Boolean {
        if (deletingAccount) return false
        deletingAccount = true
        message = null
        val deleted = when (val result = repository.deleteAccount(session)) {
            is SettingsResult.Success -> {
                session = result.session
                true
            }
            is SettingsResult.Failure -> {
                handleFailure(result)
                false
            }
        }
        deletingAccount = false
        return deleted
    }

    private fun handleFailure(failure: SettingsResult.Failure, replaceState: Boolean = false) {
        failure.session?.let { session = it }
        sessionExpired = failure.unauthorized
        if (replaceState || failure.unauthorized) state = SettingsUiState.Error(failure.message)
        else message = failure.message
    }
}
