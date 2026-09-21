package com.teswa.mobile.feature.dolab

import com.teswa.mobile.auth.AuthSession
import java.io.InputStream

enum class DolabItemStatus(val wire: String) {
    DRAFT("draft"),
    READY("ready"),
    PUBLISHED("published"),
    EXCHANGED("exchanged"),
    ARCHIVED("archived"),
    UNKNOWN("unknown");

    val editable: Boolean get() = this == DRAFT || this == READY

    companion object {
        fun fromWire(value: String): DolabItemStatus = entries.firstOrNull { it.wire == value } ?: UNKNOWN
    }
}

data class DolabItem(
    val id: String,
    val title: String?,
    val description: String?,
    val category: String?,
    val condition: String?,
    val exchangeIntent: String?,
    val status: DolabItemStatus,
    val source: String,
    val publishedItemId: String?,
    val createdAt: String?,
    val updatedAt: String?,
)

data class DolabMedia(
    val id: String,
    val dolabItemId: String?,
    val mediaType: String,
    val storagePath: String,
    val thumbnailPath: String?,
    val durationMs: Long?,
    val width: Int?,
    val height: Int?,
    val mimeType: String?,
    val sizeBytes: Long?,
    val sortOrder: Int,
    val createdAt: String?,
)

data class DolabPendingMedia(
    val uri: String,
    val displayName: String,
    val mediaType: String,
    val mimeType: String,
    val sizeBytes: Long,
    val durationMs: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val openStream: () -> InputStream,
) {
    fun validate(): String? = when {
        mediaType !in setOf("image", "video", "audio") -> "نوع الميديا غير مدعوم."
        sizeBytes <= 0L -> "الملف فاضي أو مش متاح."
        sizeBytes > 50L * 1024L * 1024L -> "حجم الملف أكبر من 50 ميجابايت."
        mediaType == "audio" && durationMs != null && durationMs !in 500L..120_000L ->
            "التسجيل لازم يكون بين نصف ثانية ودقيقتين."
        else -> null
    }
}

data class DolabMediaUploadProgress(
    val itemId: String,
    val percent: Int,
)

data class DolabNote(
    val id: String,
    val body: String?,
    val noteType: String,
    val dolabItemId: String?,
    val mediaId: String?,
    val sharedToConversationId: String?,
    val createdAt: String?,
)

data class DolabWorkspace(
    val items: List<DolabItem>,
    val media: List<DolabMedia>,
    val notes: List<DolabNote>,
) {
    fun mediaFor(itemId: String): List<DolabMedia> =
        media.filter { it.dolabItemId == itemId }.sortedBy(DolabMedia::sortOrder)
    fun notesFor(itemId: String): List<DolabNote> = notes.filter { it.dolabItemId == itemId }
}

data class DolabItemDraft(
    val title: String = "",
    val description: String = "",
    val category: String = "",
    val condition: String = "",
    val exchangeIntent: String = "",
    val status: DolabItemStatus = DolabItemStatus.DRAFT,
    val source: String = "manual",
)

enum class DolabFilter {
    ALL,
    IN_PROGRESS,
    READY,
    PUBLISHED,
    EXCHANGED,
    ARCHIVED,
}

sealed interface DolabResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : DolabResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : DolabResult<Nothing>
}

sealed interface DolabUiState {
    data object Loading : DolabUiState
    data class Ready(val workspace: DolabWorkspace) : DolabUiState
    data class Empty(val workspace: DolabWorkspace = DolabWorkspace(emptyList(), emptyList(), emptyList())) : DolabUiState
    data class Error(val message: String) : DolabUiState
}
