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
) : HomeRepository {
    private val feeds = ArrayDeque(feedResults)
    val offsets = mutableListOf<Int>()

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
}
