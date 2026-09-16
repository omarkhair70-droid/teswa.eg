package com.teswa.mobile.feature.discover

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.home.CurrentLocationResult
import com.teswa.mobile.home.DeviceLocation
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DiscoverStateHolderTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )

    @Test
    fun appliesServerFiltersAndKeepsSupportingSections() = runBlocking {
        val repository = FakeDiscoverRepository(session)
        val holder = DiscoverStateHolder(session, repository)

        holder.load()
        holder.applyFilters(DiscoverFilters(query = "كاميرا", category = "كاميرات"))

        assertEquals(DiscoverFilters(query = "كاميرا", category = "كاميرات"), repository.lastFilters)
        val state = holder.state as DiscoverUiState.Content
        assertEquals("كتب", state.categories.single().nameAr)
        assertEquals("سلمى", state.people.single().displayName)
    }

    @Test
    fun nearbyUsesSharedOneShotLocationAndClientFilters() = runBlocking {
        val repository = FakeDiscoverRepository(session)
        repository.nearbyItems = listOf(
            item("1", "كاميرا", "كاميرات"),
            item("2", "كتاب", "كتب"),
        )
        val holder = DiscoverStateHolder(session, repository)
        holder.load()
        holder.applyFilters(DiscoverFilters(category = "كاميرات"))

        holder.enableNearby(CurrentLocationProvider {
            CurrentLocationResult.Success(DeviceLocation(29.07, 31.10))
        })

        assertEquals(1, repository.nearbyCalls)
        val state = holder.state as DiscoverUiState.Content
        assertEquals(listOf("كاميرا"), state.items.map { it.title })
        assertTrue(holder.nearbyLocation != null)
    }

    private fun item(id: String, title: String, category: String) = DiscoverItem(
        id = id,
        title = title,
        description = null,
        imageUrl = null,
        category = category,
        condition = "good_used",
        city = "بني سويف",
        ownerDisplayName = null,
        createdAt = null,
    )
}

private class FakeDiscoverRepository(private val stableSession: AuthSession) : DiscoverRepository {
    var lastFilters = DiscoverFilters()
    var nearbyCalls = 0
    var nearbyItems: List<DiscoverItem> = listOf(
        DiscoverItem("1", "كاميرا", null, null, "كاميرات", "good_used", "بني سويف", null, null),
    )

    override suspend fun loadPage(session: AuthSession, filters: DiscoverFilters, offset: Int, limit: Int): DiscoverResult<DiscoverPage> {
        lastFilters = filters
        return DiscoverResult.Success(
            DiscoverPage(listOf(DiscoverItem("1", "كاميرا", null, null, "كاميرات", "good_used", "بني سويف", null, null)), false),
            stableSession,
        )
    }

    override suspend fun loadNearby(
        session: AuthSession,
        latitude: Double,
        longitude: Double,
        offset: Int,
        limit: Int,
    ): DiscoverResult<DiscoverPage> {
        nearbyCalls += 1
        return DiscoverResult.Success(DiscoverPage(nearbyItems, false), stableSession)
    }

    override suspend fun loadCategories(session: AuthSession): DiscoverResult<List<DiscoverCategory>> =
        DiscoverResult.Success(listOf(DiscoverCategory("cat-1", "كتب")), stableSession)

    override suspend fun loadPeoplePreview(session: AuthSession, limit: Int): DiscoverResult<List<DiscoverPersonPreview>> =
        DiscoverResult.Success(
            listOf(DiscoverPersonPreview("2", "سلمى", "salma", null, "القاهرة", null, 2, 3)),
            stableSession,
        )
}
