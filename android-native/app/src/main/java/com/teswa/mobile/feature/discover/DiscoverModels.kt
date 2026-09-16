package com.teswa.mobile.feature.discover

import com.teswa.mobile.auth.AuthSession

data class DiscoverFilters(
    val query: String = "",
    val category: String? = null,
    val condition: String? = null,
    val city: String? = null,
) {
    fun normalized(): DiscoverFilters = copy(
        query = query.trim().take(80),
        category = category.clean(),
        condition = condition.clean(),
        city = city.clean(),
    )

    val activeCount: Int
        get() = listOf(query.trim().takeIf(String::isNotEmpty), category, condition, city).count { !it.isNullOrBlank() }

    private fun String?.clean(): String? = this?.trim()?.takeIf(String::isNotEmpty)
}

data class DiscoverItem(
    val id: String,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val category: String?,
    val condition: String?,
    val city: String?,
    val ownerDisplayName: String?,
    val createdAt: String?,
    val distanceKm: Double? = null,
)

data class DiscoverPage(
    val items: List<DiscoverItem>,
    val hasMore: Boolean,
)

data class DiscoverCategory(
    val id: String,
    val nameAr: String,
)

data class DiscoverPersonPreview(
    val id: String,
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val city: String?,
    val area: String?,
    val successfulSwapsCount: Int,
    val activeItemsCount: Int,
)

sealed interface DiscoverResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : DiscoverResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : DiscoverResult<Nothing>
}

sealed interface DiscoverUiState {
    data object Loading : DiscoverUiState
    data class Content(
        val items: List<DiscoverItem>,
        val categories: List<DiscoverCategory>,
        val people: List<DiscoverPersonPreview>,
        val hasMore: Boolean,
        val loadingMore: Boolean = false,
    ) : DiscoverUiState
    data class Empty(
        val categories: List<DiscoverCategory>,
        val people: List<DiscoverPersonPreview>,
        val message: String,
    ) : DiscoverUiState
    data class Error(val message: String) : DiscoverUiState
}
