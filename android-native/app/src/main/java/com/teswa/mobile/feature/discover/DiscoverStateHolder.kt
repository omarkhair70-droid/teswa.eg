package com.teswa.mobile.feature.discover

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.home.CurrentLocationResult
import com.teswa.mobile.home.DeviceLocation

class DiscoverStateHolder(
    initialSession: AuthSession,
    private val repository: DiscoverRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<DiscoverUiState>(DiscoverUiState.Loading)
        private set
    var filters by mutableStateOf(DiscoverFilters())
        private set
    var nearbyLocation by mutableStateOf<DeviceLocation?>(null)
        private set
    var locationWorking by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    private var categories: List<DiscoverCategory> = emptyList()
    private var people: List<DiscoverPersonPreview> = emptyList()
    private var loadedOffset = 0

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load() {
        state = DiscoverUiState.Loading
        sessionExpired = false
        message = null
        loadedOffset = 0
        loadSupportingData()
        if (sessionExpired) {
            state = DiscoverUiState.Error("انتهت جلسة تِسوى.")
            return
        }
        loadFirstPage()
    }

    suspend fun refresh() {
        loadedOffset = 0
        loadFirstPage(keepVisibleOnFailure = true)
    }

    suspend fun applyFilters(next: DiscoverFilters) {
        filters = next.normalized()
        loadedOffset = 0
        loadFirstPage()
    }

    suspend fun clearFilters() {
        filters = DiscoverFilters()
        loadedOffset = 0
        loadFirstPage()
    }

    fun showLocationPermissionDenied() {
        message = "إذن الموقع اترفض. تقدر تكمل الاكتشاف عادي."
    }

    suspend fun enableNearby(provider: CurrentLocationProvider) {
        if (locationWorking) return
        locationWorking = true
        message = null
        when (val result = provider.current()) {
            is CurrentLocationResult.Success -> {
                nearbyLocation = result.location
                loadedOffset = 0
                loadFirstPage()
            }
            is CurrentLocationResult.Failure -> {
                message = when (result.reason) {
                    CurrentLocationResult.Reason.PERMISSION_DENIED -> "إذن الموقع مش متاح. تقدر تكمل الاكتشاف عادي."
                    CurrentLocationResult.Reason.SERVICES_DISABLED -> "فعّل خدمة الموقع لو عايز تشوف القريب منك."
                    CurrentLocationResult.Reason.UNAVAILABLE -> "ما قدرناش نحدد موقعك دلوقتي."
                }
            }
        }
        locationWorking = false
    }

    suspend fun disableNearby() {
        nearbyLocation = null
        loadedOffset = 0
        loadFirstPage()
    }

    suspend fun loadMore() {
        val current = state as? DiscoverUiState.Content ?: return
        if (!current.hasMore || current.loadingMore) return
        state = current.copy(loadingMore = true)
        when (val result = readPage(loadedOffset)) {
            is DiscoverResult.Success -> {
                session = result.session
                loadedOffset += result.value.items.size
                val visible = visibleItems(result.value.items)
                val unique = LinkedHashMap<String, DiscoverItem>()
                current.items.forEach { unique[it.id] = it }
                visible.forEach { unique[it.id] = it }
                state = if (unique.isEmpty() && !result.value.hasMore) {
                    DiscoverUiState.Empty(
                        categories = categories,
                        people = people,
                        message = "مفيش نتائج مطابقة في النطاق القريب دلوقتي.",
                    )
                } else {
                    DiscoverUiState.Content(
                        items = unique.values.toList(),
                        categories = categories,
                        people = people,
                        hasMore = result.value.hasMore,
                    )
                }
            }
            is DiscoverResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                state = current.copy(loadingMore = false)
                if (!result.unauthorized) message = result.message
            }
        }
    }

    private suspend fun loadSupportingData() {
        when (val result = repository.loadCategories(session)) {
            is DiscoverResult.Success -> {
                session = result.session
                categories = result.value
            }
            is DiscoverResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (!result.unauthorized) message = result.message
            }
        }
        if (sessionExpired) return
        when (val result = repository.loadPeoplePreview(session)) {
            is DiscoverResult.Success -> {
                session = result.session
                people = result.value
            }
            is DiscoverResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (!result.unauthorized && message == null) message = result.message
            }
        }
    }

    private suspend fun loadFirstPage(keepVisibleOnFailure: Boolean = false) {
        if (!keepVisibleOnFailure) state = DiscoverUiState.Loading
        when (val result = readPage(0)) {
            is DiscoverResult.Success -> {
                session = result.session
                loadedOffset = result.value.items.size
                val visible = visibleItems(result.value.items)
                state = when {
                    visible.isNotEmpty() -> DiscoverUiState.Content(visible, categories, people, result.value.hasMore)
                    nearbyLocation != null && result.value.hasMore -> DiscoverUiState.Content(
                        items = emptyList(),
                        categories = categories,
                        people = people,
                        hasMore = true,
                    )
                    else -> DiscoverUiState.Empty(
                        categories = categories,
                        people = people,
                        message = if (filters.activeCount > 0) "مفيش نتائج مطابقة دلوقتي. جرّب توسّع البحث." else "مفيش حاجات جديدة للاستكشاف دلوقتي.",
                    )
                }
            }
            is DiscoverResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (keepVisibleOnFailure && state is DiscoverUiState.Content && !result.unauthorized) {
                    message = result.message
                } else {
                    state = DiscoverUiState.Error(result.message)
                }
            }
        }
    }

    private suspend fun readPage(offset: Int): DiscoverResult<DiscoverPage> {
        val location = nearbyLocation
        return if (location == null) {
            repository.loadPage(session, filters, offset)
        } else {
            repository.loadNearby(session, location.latitude, location.longitude, offset)
        }
    }

    private fun visibleItems(items: List<DiscoverItem>): List<DiscoverItem> {
        if (nearbyLocation == null) return items
        val safe = filters.normalized()
        val query = safe.query.lowercase()
        return items.filter { item ->
            val matchesQuery = query.isBlank() || listOfNotNull(item.title, item.description, item.category, item.city, item.ownerDisplayName)
                .joinToString(" ").lowercase().contains(query)
            val matchesCategory = safe.category == null || item.category.equals(safe.category, ignoreCase = true)
            val matchesCondition = safe.condition == null || item.condition.equals(safe.condition, ignoreCase = true)
            val matchesCity = safe.city == null || item.city.equals(safe.city, ignoreCase = true)
            matchesQuery && matchesCategory && matchesCondition && matchesCity
        }
    }
}
