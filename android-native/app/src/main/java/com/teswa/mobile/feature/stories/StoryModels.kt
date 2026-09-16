package com.teswa.mobile.feature.stories

import com.teswa.mobile.auth.AuthSession

data class StoryAuthor(
    val id: String,
    val displayName: String?,
    val username: String?,
    val avatarUrl: String?,
)

data class StoryRecord(
    val id: String,
    val userId: String,
    val mediaType: String,
    val mediaStoragePath: String,
    val caption: String?,
    val durationMs: Int?,
    val width: Int?,
    val height: Int?,
    val createdAt: String,
    val expiresAt: String,
)

data class StoryGroup(
    val author: StoryAuthor,
    val stories: List<StoryRecord>,
    val latestCreatedAt: String,
)

data class StorySlide(
    val story: StoryRecord,
    val signedUrl: String?,
    val liked: Boolean,
)

data class StoryViewer(
    val group: StoryGroup,
    val slides: List<StorySlide>,
)

data class StoryReplyReceipt(
    val conversationId: String,
    val messageId: String,
)

sealed interface StoryResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : StoryResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : StoryResult<Nothing>
}
