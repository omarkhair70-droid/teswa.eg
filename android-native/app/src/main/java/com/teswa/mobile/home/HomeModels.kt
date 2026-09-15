package com.teswa.mobile.home

import com.teswa.mobile.auth.AuthSession

data class HomeFeedItem(
    val id: String,
    val title: String,
    val description: String?,
    val coverImageUrl: String?,
    val category: String?,
    val condition: String?,
    val city: String?,
    val ownerDisplayName: String?,
    val createdAt: String?,
)

data class HomeFeedPage(
    val items: List<HomeFeedItem>,
    val hasMore: Boolean,
)

data class ItemDetail(
    val id: String,
    val ownerId: String?,
    val title: String,
    val description: String?,
    val condition: String?,
    val conditionNotes: String?,
    val category: String?,
    val city: String?,
    val area: String?,
    val images: List<String>,
    val ownerDisplayName: String?,
    val ownerUsername: String?,
    val desireText: String?,
    val itemStory: String?,
    val swapReason: String?,
    val goodFor: String?,
)

sealed interface HomeFeedResult<out T> {
    data class Success<T>(
        val value: T,
        val session: AuthSession,
    ) : HomeFeedResult<T>
    data class Failure(
        val message: String,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
        val session: AuthSession? = null,
    ) : HomeFeedResult<Nothing>
}

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Content(
        val items: List<HomeFeedItem>,
        val hasMore: Boolean,
        val loadingMore: Boolean = false,
    ) : HomeUiState
    data class Empty(val message: String) : HomeUiState
    data class Error(val message: String) : HomeUiState
}

sealed interface ItemDetailUiState {
    data object Loading : ItemDetailUiState
    data class Content(val detail: ItemDetail) : ItemDetailUiState
    data class Error(val message: String) : ItemDetailUiState
}
