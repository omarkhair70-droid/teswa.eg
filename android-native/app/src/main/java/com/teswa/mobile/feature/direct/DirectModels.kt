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

data class DirectAttachment(
    val id: String?,
    val kind: String,
    val storagePath: String,
    val storageBucket: String?,
    val fileName: String?,
    val mimeType: String?,
    val sizeBytes: Long?,
    val durationMs: Int?,
    val width: Int?,
    val height: Int?,
)

data class DirectReaction(
    val reaction: String,
    val userId: String,
    val createdAt: String?,
)

data class DirectMessage(
    val id: String,
    val senderId: String,
    val body: String,
    val messageType: String,
    val createdAt: String,
    val readAt: String?,
    val audioStoragePath: String? = null,
    val audioDurationMs: Int? = null,
    val audioMimeType: String? = null,
    val audioSizeBytes: Long? = null,
    val replyToMessageId: String? = null,
    val replySenderId: String? = null,
    val replyBody: String? = null,
    val deletedAt: String? = null,
    val attachments: List<DirectAttachment> = emptyList(),
    val reactions: List<DirectReaction> = emptyList(),
)

data class DirectReactionToggle(
    val enabled: Boolean,
    val count: Int,
)

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
