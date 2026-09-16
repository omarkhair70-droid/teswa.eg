package com.teswa.mobile.feature.people

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PeopleStateHolderTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )

    @Test
    fun searchThenPaginationDeduplicatesProfiles() = runBlocking {
        val repository = FakePeopleRepository(session)
        val holder = PeopleStateHolder(session, repository)

        holder.search(" سلمى ")
        holder.loadMore()

        val state = holder.state as PeopleUiState.Content
        assertEquals("سلمى", state.query)
        assertEquals(listOf("سلمى", "مريم"), state.entries.map { it.displayName })
        assertEquals(2, state.page)
        assertTrue(!state.hasMore)
        assertEquals(listOf(1, 2), repository.pages)
    }

    @Test
    fun clearSearchReturnsToDefaultDirectory() = runBlocking {
        val repository = FakePeopleRepository(session)
        val holder = PeopleStateHolder(session, repository)
        holder.search("سلمى")

        holder.clearSearch()

        assertEquals("", holder.appliedQuery)
        assertEquals("", repository.queries.last())
    }
}

private class FakePeopleRepository(private val stableSession: AuthSession) : PeopleRepository {
    val pages = mutableListOf<Int>()
    val queries = mutableListOf<String>()

    override suspend fun load(
        session: AuthSession,
        query: String,
        page: Int,
        pageSize: Int,
    ): PeopleResult<PeoplePage> {
        pages += page
        queries += query
        val rows = if (page == 1) {
            listOf(person("22222222-2222-2222-2222-222222222222", "سلمى"))
        } else {
            listOf(
                person("22222222-2222-2222-2222-222222222222", "سلمى"),
                person("33333333-3333-3333-3333-333333333333", "مريم"),
            )
        }
        return PeopleResult.Success(PeoplePage(rows, hasMore = page == 1), stableSession)
    }

    private fun person(id: String, name: String) = PeopleEntry(
        id = id,
        displayName = name,
        username = name,
        avatarUrl = null,
        coverUrl = null,
        profileTagline = null,
        bio = null,
        city = "بني سويف",
        area = null,
        successfulSwapsCount = 1,
        responseRate = null,
        activeItemsCount = 2,
        createdAt = null,
    )
}
