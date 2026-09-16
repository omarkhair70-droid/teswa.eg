package com.teswa.mobile.feature.people

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

class PeopleStateHolder(
    initialSession: AuthSession,
    private val repository: PeopleRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<PeopleUiState>(PeopleUiState.Loading)
        private set
    var appliedQuery by mutableStateOf("")
        private set
    var refreshing by mutableStateOf(false)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load(query: String = appliedQuery, refresh: Boolean = false) {
        val safeQuery = sanitizePeopleQuery(query)
        appliedQuery = safeQuery
        sessionExpired = false
        if (refresh) refreshing = true else state = PeopleUiState.Loading
        when (val result = repository.load(session, safeQuery, page = 1)) {
            is PeopleResult.Success -> {
                session = result.session
                state = if (result.value.entries.isEmpty()) {
                    PeopleUiState.Empty(safeQuery)
                } else {
                    PeopleUiState.Content(
                        entries = result.value.entries,
                        query = safeQuery,
                        page = 1,
                        hasMore = result.value.hasMore,
                    )
                }
            }
            is PeopleResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (refresh && !result.unauthorized && state is PeopleUiState.Content) {
                    val current = state as PeopleUiState.Content
                    state = current.copy(loadMoreError = result.message)
                } else {
                    state = PeopleUiState.Error(result.message)
                }
            }
        }
        refreshing = false
    }

    suspend fun search(rawQuery: String) = load(rawQuery)

    suspend fun clearSearch() = load("")

    suspend fun refresh() = load(appliedQuery, refresh = true)

    suspend fun loadMore() {
        val current = state as? PeopleUiState.Content ?: return
        if (!current.hasMore || current.loadingMore) return
        state = current.copy(loadingMore = true, loadMoreError = null)
        val nextPage = current.page + 1
        when (val result = repository.load(session, current.query, page = nextPage)) {
            is PeopleResult.Success -> {
                session = result.session
                val merged = LinkedHashMap<String, PeopleEntry>()
                current.entries.forEach { merged[it.id] = it }
                result.value.entries.forEach { merged[it.id] = it }
                state = PeopleUiState.Content(
                    entries = merged.values.toList(),
                    query = current.query,
                    page = nextPage,
                    hasMore = result.value.hasMore,
                )
            }
            is PeopleResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                state = if (result.unauthorized) {
                    PeopleUiState.Error(result.message)
                } else {
                    current.copy(loadingMore = false, loadMoreError = result.message)
                }
            }
        }
    }
}
