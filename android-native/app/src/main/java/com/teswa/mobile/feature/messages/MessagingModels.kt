package com.teswa.mobile.feature.messages

import com.teswa.mobile.auth.AuthSession

data class DealConversation(
    val dealId: String,
    val status: String,
    val requestedItemTitle: String,
    val offeredItemTitle: String,
    val otherParticipantId: String,
    val otherDisplayName: String?,
    val otherAvatarUrl: String?,
    val latestMessage: DealMessagePreview?,
    val unreadCount: Int,
    val lastActivityAt: String,
)

data class DealMessagePreview(
    val body: String,
    val createdAt: String,
    val senderId: String,
    val messageType: String,
)

data class DealMessage(
    val id: String,
    val dealId: String,
    val senderId: String,
    val body: String,
    val messageType: String,
    val createdAt: String,
)

data class DealInboxPage(
    val items: List<DealConversation>,
    val hasMore: Boolean,
)

sealed interface MessagingResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : MessagingResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : MessagingResult<Nothing>
}
