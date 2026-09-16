package com.teswa.mobile.feature.stories

import com.teswa.mobile.auth.AuthSession
import java.io.InputStream

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

data class ManagedStory(
    val story: StoryRecord,
    val signedUrl: String?,
    val viewCount: Int?,
    val likeCount: Int?,
)

data class StoryDeleteOutcome(
    val storageCleanupComplete: Boolean,
)

data class StoryMediaSelection(
    val uri: String,
    val displayName: String,
    val contentType: String,
    val sizeBytes: Long,
    val width: Int?,
    val height: Int?,
    val durationMs: Int?,
) {
    val mediaType: String
        get() = if (contentType.startsWith("video/")) "video" else "image"
}

data class StoryDraft(
    val media: StoryMediaSelection? = null,
    val caption: String = "",
) {
    fun validate(): String? = when {
        media == null -> "اختار صورة أو فيديو للقصة."
        media.sizeBytes !in 1..MAX_BYTES -> "حجم الملف غير صالح أو أكبر من 100 ميجابايت."
        media.contentType !in SUPPORTED_TYPES -> "استخدم صورة JPG/PNG/WebP أو فيديو MP4/MOV."
        media.mediaType == "video" && media.durationMs != null && media.durationMs !in 1..120_000 ->
            "الفيديو لازم يكون دقيقتين أو أقل."
        caption.trim().length > 220 -> "تعليق القصة لازم يكون 220 حرف أو أقل."
        else -> null
    }

    companion object {
        const val MAX_BYTES = 100L * 1024L * 1024L
        val SUPPORTED_TYPES = setOf(
            "image/jpeg",
            "image/png",
            "image/webp",
            "video/mp4",
            "video/quicktime",
        )
    }
}

sealed interface StoryPublishProgress {
    data class Uploading(val percent: Int) : StoryPublishProgress
    data object Saving : StoryPublishProgress
    data object CleaningUp : StoryPublishProgress
}

fun interface StoryContentSource {
    fun open(media: StoryMediaSelection): InputStream
}

sealed interface StoryResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : StoryResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : StoryResult<Nothing>
}
