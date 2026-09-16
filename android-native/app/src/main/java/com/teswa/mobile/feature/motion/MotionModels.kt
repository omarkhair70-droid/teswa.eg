package com.teswa.mobile.feature.motion

import com.teswa.mobile.auth.AuthSession

data class MotionMovingItem(
    val id: String,
    val title: String,
    val imageUrl: String?,
    val category: String?,
    val condition: String?,
    val location: String?,
    val ownerDisplayName: String?,
    val openInterestCount: Int,
    val latestInterestAt: String?,
    val hasVideoTeaser: Boolean,
)

data class MotionStoryItem(
    val id: String,
    val title: String,
    val imageUrl: String?,
    val category: String?,
    val city: String?,
    val area: String?,
    val ownerId: String?,
    val ownerDisplayName: String?,
    val storyLabel: String,
    val storySnippet: String,
    val createdAt: String?,
    val hasVideoTeaser: Boolean,
)

data class MotionVideoDrop(
    val id: String,
    val title: String,
    val description: String?,
    val imageUrl: String?,
    val category: String?,
    val condition: String?,
    val location: String?,
    val ownerDisplayName: String?,
    val durationMs: Int?,
    val createdAt: String?,
)

data class MotionPulsePerson(
    val id: String,
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val city: String?,
    val area: String?,
    val profileTagline: String?,
    val activeItemsCount: Int,
)

data class MotionPulseStoryAuthor(
    val id: String,
    val displayName: String?,
    val username: String?,
    val avatarUrl: String?,
    val storiesCount: Int,
    val latestCreatedAt: String,
)

data class MotionCityLocation(
    val label: String,
    val matchTerms: List<String>,
)

data class MotionCityPulse(
    val location: MotionCityLocation,
    val movingItems: List<MotionMovingItem>,
    val storyItems: List<MotionStoryItem>,
    val people: List<MotionPulsePerson>,
    val activeStoryAuthors: List<MotionPulseStoryAuthor>,
)

data class MotionFeedState(
    val loading: Boolean = true,
    val movingItems: List<MotionMovingItem> = emptyList(),
    val storyItems: List<MotionStoryItem> = emptyList(),
    val videoDrops: List<MotionVideoDrop> = emptyList(),
    val movingError: String? = null,
    val storiesError: String? = null,
    val videoError: String? = null,
)

sealed interface MotionCityPulseState {
    data object Hidden : MotionCityPulseState
    data object Resolving : MotionCityPulseState
    data class Loading(val location: MotionCityLocation) : MotionCityPulseState
    data class Ready(val pulse: MotionCityPulse, val refreshing: Boolean = false, val notice: String? = null) : MotionCityPulseState
    data class Error(val message: String, val location: MotionCityLocation? = null) : MotionCityPulseState
}

sealed interface MotionResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : MotionResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : MotionResult<Nothing>
}

sealed interface MotionLocationResult {
    data class Success(val location: MotionCityLocation) : MotionLocationResult
    data class Failure(val message: String, val permissionDenied: Boolean = false) : MotionLocationResult
}

fun interface MotionLocationResolver {
    suspend fun resolve(): MotionLocationResult
}
