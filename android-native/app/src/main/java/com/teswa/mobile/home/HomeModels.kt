package com.teswa.mobile.home

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

sealed interface HomeFeedResult<out T> {
    data class Success<T>(val value: T) : HomeFeedResult<T>
    data class Failure(
        val message: String,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : HomeFeedResult<Nothing>
}

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Content(
        val items: List<HomeFeedItem>,
        val hasMore: Boolean,
    ) : HomeUiState
    data class Empty(val message: String) : HomeUiState
    data class Error(val message: String) : HomeUiState
}
