package com.teswa.mobile.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

class HomeStateHolder(
    initialSession: AuthSession,
    private val repository: HomeRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<HomeUiState>(HomeUiState.Loading)
        private set
    var selectedItemId by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) {
            session = updated
        }
    }

    fun openItem(itemId: String) {
        selectedItemId = itemId
    }

    fun closeItem() {
        selectedItemId = null
    }

    suspend fun load() {
        sessionExpired = false
        state = HomeUiState.Loading
        when (val feed = repository.fetchFeed(session)) {
            is HomeFeedResult.Success -> {
                session = feed.session
                state = if (feed.value.items.isEmpty()) {
                    HomeUiState.Empty("مفيش عناصر ظاهرة دلوقتي. أول عنصر جديد هتلاقيه هنا.")
                } else {
                    HomeUiState.Content(feed.value.items, feed.value.hasMore)
                }
            }
            is HomeFeedResult.Failure -> handleFailure(feed)
        }
    }

    suspend fun loadMore() {
        val current = state as? HomeUiState.Content ?: return
        if (!current.hasMore || current.loadingMore) return
        state = current.copy(loadingMore = true)

        when (val feed = repository.fetchFeed(session, offset = current.items.size)) {
            is HomeFeedResult.Success -> {
                session = feed.session
                state = current.copy(
                    items = (current.items + feed.value.items).distinctBy { it.id },
                    hasMore = feed.value.hasMore,
                    loadingMore = false,
                )
            }
            is HomeFeedResult.Failure -> handleFailure(feed)
        }
    }

    private fun handleFailure(failure: HomeFeedResult.Failure) {
        failure.session?.let { session = it }
        sessionExpired = failure.unauthorized
        state = HomeUiState.Error(failure.message)
    }
}

class ItemDetailStateHolder(
    private val itemId: String,
    initialSession: AuthSession,
    private val repository: HomeRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<ItemDetailUiState>(ItemDetailUiState.Loading)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) {
            session = updated
        }
    }

    suspend fun load() {
        sessionExpired = false
        state = ItemDetailUiState.Loading
        when (val detail = repository.fetchDetail(session, itemId)) {
            is HomeFeedResult.Success -> {
                session = detail.session
                state = ItemDetailUiState.Content(detail.value)
            }
            is HomeFeedResult.Failure -> {
                detail.session?.let { session = it }
                sessionExpired = detail.unauthorized
                state = ItemDetailUiState.Error(detail.message)
            }
        }
    }
}
