package com.teswa.mobile.feature.people

import com.teswa.mobile.auth.AuthSession

data class PeopleEntry(
    val id: String,
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val coverUrl: String?,
    val profileTagline: String?,
    val bio: String?,
    val city: String?,
    val area: String?,
    val successfulSwapsCount: Int,
    val responseRate: Double?,
    val activeItemsCount: Int,
    val createdAt: String?,
)

data class PeoplePage(
    val entries: List<PeopleEntry>,
    val hasMore: Boolean,
)

sealed interface PeopleResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : PeopleResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : PeopleResult<Nothing>
}

sealed interface PeopleUiState {
    data object Loading : PeopleUiState
    data class Content(
        val entries: List<PeopleEntry>,
        val query: String,
        val page: Int,
        val hasMore: Boolean,
        val loadingMore: Boolean = false,
        val loadMoreError: String? = null,
    ) : PeopleUiState
    data class Empty(val query: String) : PeopleUiState
    data class Error(val message: String) : PeopleUiState
}
