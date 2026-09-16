package com.teswa.mobile.feature.direct

import com.teswa.mobile.auth.AuthSession

data class DirectConversation(
    val id: String,
    val status: String,
    val requestedBy: String,
    val otherUserId: String,
    val otherDisplayName: String?,
    val otherUsername: String?,
    val otherAvatarUrl: String?,
    val lastMessageBody: String?,
    val lastMessageAt: String?,
    val unreadCount: Int,
    val requiresAction: Boolean,
)

data class DirectMessage(val id: String, val senderId: String, val body: String, val messageType: String, val createdAt: String, val readAt: String?)

data class DirectComposeTarget(
    val userId: String,
    val displayName: String?,
    val username: String?,
    val avatarUrl: String?,
)

data class DirectStartOutcome(
    val conversationId: String,
    val messageId: String?,
    val status: String,
    val accepted: Boolean,
    val message: String?,
)

sealed interface DirectResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : DirectResult<T>
    data class Failure(val message: String, val session: AuthSession? = null, val unauthorized: Boolean = false, val network: Boolean = false) : DirectResult<Nothing>
}
