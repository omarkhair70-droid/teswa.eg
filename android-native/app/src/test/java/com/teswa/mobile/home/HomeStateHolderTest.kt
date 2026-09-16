package com.teswa.mobile.home

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeStateHolderTest {
    private val session = AuthSession(
        accessToken = "access-token",
        refreshToken = "refresh-token",
        expiresAtEpochSeconds = 9_999_999_999L,
        user = AuthUser("user-1", null, null, null, null),
    )

    @Test
    fun paginationMergesWithoutDuplicatingItems() = runBlocking {
        val first = item("item-1", "الأول")
        val duplicate = item("item-1", "نسخة مكررة")
        val second = item("item-2", "الثاني")
        val repository = FakeHomeRepository(
            feedResults = listOf(
                HomeFeedResult.Success(HomeFeedPage(listOf(first), hasMore = true), session),
                HomeFeedResult.Success(HomeFeedPage(listOf(duplicate, second), hasMore = false), session),
            ),
        )
        val holder = HomeStateHolder(session, repository)

        holder.load()
        holder.loadMore()

        val state = holder.state as HomeUiState.Content
        assertEquals(listOf("item-1", "item-2"), state.items.map { it.id })
        assertEquals("الأول", state.items.first().title)
        assertFalse(state.hasMore)
        assertEquals(listOf(0, 1), repository.offsets)
    }

    @Test
    fun unauthorizedResultRequestsCleanAuthExit() = runBlocking {
        val repository = FakeHomeRepository(
            feedResults = listOf(
                HomeFeedResult.Failure("انتهت الجلسة.", unauthorized = true, session = session),
            ),
        )
        val holder = HomeStateHolder(session, repository)

        holder.load()

        assertTrue(holder.sessionExpired)
        assertTrue(holder.state is HomeUiState.Error)
    }

    @Test
    fun nearbyLocationLoadsNearbyPageWithoutAffectingBaseFlow() = runBlocking {
        val nearby = item("near-1", "قريب")
        val repository = FakeHomeRepository(
            feedResults = listOf(HomeFeedResult.Success(HomeFeedPage(emptyList(), false), session)),
            nearbyResults = listOf(HomeFeedResult.Success(HomeFeedPage(listOf(nearby), false), session)),
        )
        val holder = HomeStateHolder(session, repository)

        holder.enableNearby { CurrentLocationResult.Success(DeviceLocation(30.0, 31.0)) }

        assertEquals(DeviceLocation(30.0, 31.0), holder.nearbyLocation)
        assertEquals(listOf("near-1"), (holder.state as HomeUiState.Content).items.map { it.id })
        assertEquals(listOf(Triple(30.0, 31.0, 0)), repository.nearbyCalls)
    }

    @Test
    fun deniedLocationStaysOptionalAndDoesNotReplaceFeedState() = runBlocking {
        val repository = FakeHomeRepository(
            feedResults = listOf(HomeFeedResult.Success(HomeFeedPage(listOf(item("item-1", "عنصر")), false), session)),
        )
        val holder = HomeStateHolder(session, repository)
        holder.load()

        holder.enableNearby { CurrentLocationResult.Failure(CurrentLocationResult.Reason.PERMISSION_DENIED) }

        assertTrue(holder.state is HomeUiState.Content)
        assertEquals(null, holder.nearbyLocation)
        assertTrue(holder.notice?.contains("تكمل") == true)
    }

    private fun item(id: String, title: String) = HomeFeedItem(
        id = id,
        title = title,
        description = null,
        coverImageUrl = null,
        category = null,
        condition = null,
        city = null,
        ownerDisplayName = null,
        createdAt = null,
    )
}

private class FakeHomeRepository(
    feedResults: List<HomeFeedResult<HomeFeedPage>>,
    nearbyResults: List<HomeFeedResult<HomeFeedPage>> = emptyList(),
) : HomeRepository {
    private val feeds = ArrayDeque(feedResults)
    private val nearby = ArrayDeque(nearbyResults)
    val offsets = mutableListOf<Int>()
    val nearbyCalls = mutableListOf<Triple<Double, Double, Int>>()

    override suspend fun fetchFeed(
        session: AuthSession,
        offset: Int,
        limit: Int,
    ): HomeFeedResult<HomeFeedPage> {
        offsets += offset
        return feeds.removeFirst()
    }

    override suspend fun fetchDetail(
        session: AuthSession,
        itemId: String,
    ): HomeFeedResult<ItemDetail> = error("Not used in this state-holder test.")

    override suspend fun fetchNearby(
        session: AuthSession,
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        offset: Int,
        limit: Int,
    ): HomeFeedResult<HomeFeedPage> {
        nearbyCalls += Triple(latitude, longitude, offset)
        return nearby.removeFirst()
    }
}
