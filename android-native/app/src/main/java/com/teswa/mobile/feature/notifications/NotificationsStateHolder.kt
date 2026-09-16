package com.teswa.mobile.feature.notifications

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface NotificationsUiState {
    data object Loading : NotificationsUiState
    data object Empty : NotificationsUiState
    data class Content(val items: List<AppNotification>) : NotificationsUiState
    data class Error(val message: String) : NotificationsUiState
}

class NotificationsStateHolder(
    initialSession: AuthSession,
    private val repository: NotificationsRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<NotificationsUiState>(NotificationsUiState.Loading)
        private set
    var working by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    val unreadCount: Int
        get() = (state as? NotificationsUiState.Content)?.items?.count { !it.isRead } ?: 0

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load(silent: Boolean = false) {
        if (!silent || state !is NotificationsUiState.Content) state = NotificationsUiState.Loading
        sessionExpired = false
        when (val result = repository.load(session)) {
            is NotificationsResult.Success -> {
                session = result.session
                state = if (result.value.isEmpty()) NotificationsUiState.Empty else NotificationsUiState.Content(result.value)
                message = null
            }
            is NotificationsResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (silent && state is NotificationsUiState.Content && !result.unauthorized) message = result.message
                else state = NotificationsUiState.Error(result.message)
            }
        }
    }

    suspend fun open(notification: AppNotification): NotificationDestination? {
        if (!notification.isRead) {
            when (val result = repository.markRead(session, notification.id)) {
                is NotificationsResult.Success -> {
                    session = result.session
                    val content = state as? NotificationsUiState.Content
                    if (content != null) state = NotificationsUiState.Content(
                        content.items.map { if (it.id == notification.id) it.copy(readAt = "now") else it },
                    )
                }
                is NotificationsResult.Failure -> {
                    result.session?.let { session = it }
                    sessionExpired = result.unauthorized
                    if (!result.unauthorized) message = result.message
                }
            }
        }
        return notification.destination()
    }

    suspend fun markAllRead() {
        if (working || unreadCount == 0) return
        working = true
        message = null
        when (val result = repository.markAllRead(session)) {
            is NotificationsResult.Success -> {
                session = result.session
                val content = state as? NotificationsUiState.Content
                if (content != null) state = NotificationsUiState.Content(content.items.map { it.copy(readAt = it.readAt ?: "now") })
            }
            is NotificationsResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (!result.unauthorized) message = result.message
            }
        }
        working = false
    }
}
