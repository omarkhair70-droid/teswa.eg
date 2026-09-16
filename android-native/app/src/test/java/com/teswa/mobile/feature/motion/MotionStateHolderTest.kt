package com.teswa.mobile.feature.motion

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MotionStateHolderTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )

    @Test
    fun partialSectionFailureKeepsSuccessfulMotionData() = runBlocking {
        val repository = FakeMotionRepository(session).apply { failStories = true }
        val holder = MotionStateHolder(session, repository)

        holder.load()

        assertTrue(!holder.feed.loading)
        assertEquals("كاميرا", holder.feed.movingItems.single().title)
        assertEquals("راديو", holder.feed.videoDrops.single().title)
        assertNotNull(holder.feed.storiesError)
    }

    @Test
    fun cityPulseRefreshPreservesPreviousSnapshotOnFailure() = runBlocking {
        val repository = FakeMotionRepository(session)
        val holder = MotionStateHolder(session, repository)
        val resolver = MotionLocationResolver {
            MotionLocationResult.Success(MotionCityLocation("بني سويف", listOf("بني سويف")))
        }

        holder.enableCityPulse(resolver)
        repository.failPulse = true
        holder.refreshCityPulse()

        val state = holder.cityPulse as MotionCityPulseState.Ready
        assertEquals("بني سويف", state.pulse.location.label)
        assertNotNull(state.notice)
    }
}

private class FakeMotionRepository(private val stableSession: AuthSession) : MotionRepository {
    var failStories = false
    var failPulse = false

    override suspend fun loadMoving(session: AuthSession, limit: Int): MotionResult<List<MotionMovingItem>> =
        MotionResult.Success(
            listOf(MotionMovingItem("1", "كاميرا", null, "كاميرات", "good_used", "بني سويف", "عمر", 2, null, true)),
            stableSession,
        )

    override suspend fun loadStoryItems(session: AuthSession, limit: Int): MotionResult<List<MotionStoryItem>> =
        if (failStories) MotionResult.Failure("story failed", stableSession)
        else MotionResult.Success(
            listOf(MotionStoryItem("2", "كتاب", null, "كتب", "بني سويف", null, null, "سلمى", "حكاية العنصر", "حكاية", null, false)),
            stableSession,
        )

    override suspend fun loadVideoDrops(session: AuthSession, limit: Int): MotionResult<List<MotionVideoDrop>> =
        MotionResult.Success(
            listOf(MotionVideoDrop("3", "راديو", null, null, null, null, "بني سويف", "مريم", 10000, null)),
            stableSession,
        )

    override suspend fun loadCityPulse(
        session: AuthSession,
        location: MotionCityLocation,
        movingLimit: Int,
        storyLimit: Int,
        peopleLimit: Int,
        storyAuthorsLimit: Int,
    ): MotionResult<MotionCityPulse> {
        if (failPulse) return MotionResult.Failure("pulse failed", stableSession, network = true)
        return MotionResult.Success(
            MotionCityPulse(
                location = location,
                movingItems = emptyList(),
                storyItems = emptyList(),
                people = emptyList(),
                activeStoryAuthors = emptyList(),
            ),
            stableSession,
        )
    }
}
