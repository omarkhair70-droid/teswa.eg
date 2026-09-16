package com.teswa.mobile.feature.motion

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

class MotionStateHolder(
    initialSession: AuthSession,
    private val repository: MotionRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var feed by mutableStateOf(MotionFeedState())
        private set
    var cityPulse by mutableStateOf<MotionCityPulseState>(MotionCityPulseState.Hidden)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load() {
        sessionExpired = false
        feed = feed.copy(loading = true, movingError = null, storiesError = null, videoError = null)

        when (val result = repository.loadMoving(session)) {
            is MotionResult.Success -> {
                session = result.session
                feed = feed.copy(movingItems = result.value, movingError = null)
            }
            is MotionResult.Failure -> {
                capture(result)
                feed = feed.copy(movingError = result.message)
            }
        }
        if (sessionExpired) return finishLoading()

        when (val result = repository.loadStoryItems(session)) {
            is MotionResult.Success -> {
                session = result.session
                feed = feed.copy(storyItems = result.value, storiesError = null)
            }
            is MotionResult.Failure -> {
                capture(result)
                feed = feed.copy(storiesError = result.message)
            }
        }
        if (sessionExpired) return finishLoading()

        when (val result = repository.loadVideoDrops(session)) {
            is MotionResult.Success -> {
                session = result.session
                feed = feed.copy(videoDrops = result.value, videoError = null)
            }
            is MotionResult.Failure -> {
                capture(result)
                feed = feed.copy(videoError = result.message)
            }
        }
        finishLoading()
    }

    suspend fun enableCityPulse(resolver: MotionLocationResolver) {
        if (cityPulse is MotionCityPulseState.Resolving || cityPulse is MotionCityPulseState.Loading) return
        cityPulse = MotionCityPulseState.Resolving
        when (val resolved = resolver.resolve()) {
            is MotionLocationResult.Success -> loadCityPulse(resolved.location, preserve = false)
            is MotionLocationResult.Failure -> cityPulse = MotionCityPulseState.Error(resolved.message)
        }
    }

    suspend fun refreshCityPulse() {
        val current = cityPulse as? MotionCityPulseState.Ready ?: return
        cityPulse = current.copy(refreshing = true, notice = null)
        loadCityPulse(current.pulse.location, preserve = true, previous = current.pulse)
    }

    suspend fun retryCityPulse(resolver: MotionLocationResolver) {
        val failed = cityPulse as? MotionCityPulseState.Error
        val location = failed?.location
        if (location != null) loadCityPulse(location, preserve = false)
        else enableCityPulse(resolver)
    }

    fun hideCityPulse() {
        cityPulse = MotionCityPulseState.Hidden
    }

    fun showLocationPermissionDenied() {
        cityPulse = MotionCityPulseState.Error("إذن الموقع اترفض. تقدر تستخدم باقي نبض تِسوى عادي.")
    }

    private suspend fun loadCityPulse(
        location: MotionCityLocation,
        preserve: Boolean,
        previous: MotionCityPulse? = null,
    ) {
        if (!preserve) cityPulse = MotionCityPulseState.Loading(location)
        when (val result = repository.loadCityPulse(session, location)) {
            is MotionResult.Success -> {
                session = result.session
                cityPulse = MotionCityPulseState.Ready(result.value)
            }
            is MotionResult.Failure -> {
                capture(result)
                cityPulse = when {
                    result.unauthorized -> MotionCityPulseState.Error(result.message, location)
                    preserve && previous != null -> MotionCityPulseState.Ready(
                        previous,
                        refreshing = false,
                        notice = "تعذر تحديث نبض مدينتك؛ بنعرض آخر نتيجة عندك.",
                    )
                    else -> MotionCityPulseState.Error(result.message, location)
                }
            }
        }
    }

    private fun capture(result: MotionResult.Failure) {
        result.session?.let { session = it }
        sessionExpired = result.unauthorized
    }

    private fun finishLoading() {
        feed = feed.copy(loading = false)
    }
}
