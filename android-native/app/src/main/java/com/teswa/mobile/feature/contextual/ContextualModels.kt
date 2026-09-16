package com.teswa.mobile.feature.contextual

import com.teswa.mobile.auth.AuthSession

data class ContextualParticipant(
    val id: String,
    val displayName: String?,
    val username: String?,
    val avatarUrl: String?,
)

data class ContextualConversation(
    val id: String,
    val storyId: String,
    val other: ContextualParticipant,
    val latestBody: String?,
    val latestKind: String?,
    val unreadCount: Int,
    val lastActivityAt: String,
)

data class ContextualMessage(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val body: String,
    val kind: String,
    val mediaStoragePath: String?,
    val durationMs: Int?,
    val createdAt: String,
)

data class ContextualThread(
    val conversation: ContextualConversation,
    val starterId: String,
    val recipientId: String,
    val messages: List<ContextualMessage>,
)

sealed interface ContextualResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : ContextualResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : ContextualResult<Nothing>
}
