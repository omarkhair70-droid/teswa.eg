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
    var nearbyLocation by mutableStateOf<DeviceLocation?>(null)
        private set
    var locationWorking by mutableStateOf(false)
        private set
    var notice by mutableStateOf<String?>(null)
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
        when (val feed = currentPage(offset = 0)) {
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

        when (val feed = currentPage(offset = current.items.size)) {
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

    suspend fun enableNearby(provider: CurrentLocationProvider) {
        if (locationWorking) return
        locationWorking = true
        notice = null
        when (val result = provider.current()) {
            is CurrentLocationResult.Success -> {
                nearbyLocation = result.location
                when (val feed = repository.fetchNearby(session, result.location.latitude, result.location.longitude)) {
                    is HomeFeedResult.Success -> {
                        session = feed.session
                        state = HomeUiState.Content(feed.value.items, feed.value.hasMore)
                        notice = if (feed.value.items.isEmpty()) "مفيش عناصر منشورة داخل 3 كم حاليًا." else "بنعرض العناصر داخل 3 كم تقريبًا من موقعك."
                    }
                    is HomeFeedResult.Failure -> {
                        nearbyLocation = null
                        failureSession(feed)
                        notice = feed.message
                    }
                }
            }
            is CurrentLocationResult.Failure -> notice = when (result.reason) {
                CurrentLocationResult.Reason.PERMISSION_DENIED -> "إذن الموقع غير مفعّل. تقدر تكمل استخدام تِسوى عادي."
                CurrentLocationResult.Reason.SERVICES_DISABLED -> "شغّل خدمة الموقع ثم حاول تاني."
                CurrentLocationResult.Reason.UNAVAILABLE -> "تعذر تحديد موقعك الآن. حاول تاني بعد لحظات."
            }
        }
        locationWorking = false
    }

    suspend fun disableNearby() {
        nearbyLocation = null
        notice = null
        load()
    }

    fun showNotice(value: String) {
        notice = value
    }

    private suspend fun currentPage(offset: Int): HomeFeedResult<HomeFeedPage> {
        val location = nearbyLocation
        return if (location == null) repository.fetchFeed(session, offset = offset)
        else repository.fetchNearby(session, location.latitude, location.longitude, offset = offset)
    }

    private fun failureSession(failure: HomeFeedResult.Failure) {
        failure.session?.let { session = it }
        sessionExpired = failure.unauthorized
    }

    private fun handleFailure(failure: HomeFeedResult.Failure) {
        failureSession(failure)
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
