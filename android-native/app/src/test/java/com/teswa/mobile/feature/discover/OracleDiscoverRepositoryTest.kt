package com.teswa.mobile.feature.discover

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OracleDiscoverRepositoryTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun feedUsesOracleFiltersAndParsesPage() = runBlocking {
        val transport = DiscoverQueueTransport(
            response(200, JSONObject("""{
              "items":[{
                "id":"22222222-2222-2222-2222-222222222222",
                "title":"كاميرا فيلم","description":"35mm","coverImageUrl":"https://media.example/camera.jpg",
                "category":"كاميرات","condition":"good_used","city":"بني سويف",
                "ownerDisplayName":"عمر","createdAt":"2026-09-16T01:00:00Z"
              }],"hasMore":true
            }""")),
        )
        val repository = OracleDiscoverRepository(authenticator, transport)

        val result = repository.loadPage(
            session,
            DiscoverFilters(query = "كاميرا فيلم", category = "كاميرات", condition = "good_used", city = "بني سويف"),
            offset = 20,
            limit = 20,
        )

        assertTrue(result is DiscoverResult.Success)
        result as DiscoverResult.Success
        assertEquals("كاميرا فيلم", result.value.items.single().title)
        assertTrue(result.value.hasMore)
        assertEquals(
            "/v1/marketplace/feed?offset=20&limit=20&query=%D9%83%D8%A7%D9%85%D9%8A%D8%B1%D8%A7+%D9%81%D9%8A%D9%84%D9%85&category=%D9%83%D8%A7%D9%85%D9%8A%D8%B1%D8%A7%D8%AA&condition=good_used&city=%D8%A8%D9%86%D9%8A+%D8%B3%D9%88%D9%8A%D9%81",
            transport.requests.single().path,
        )
    }

    @Test
    fun categoriesAndPeopleUseExistingOracleContracts() = runBlocking {
        val transport = DiscoverQueueTransport(
            response(200, JSONObject("""{"items":[{"id":"cat-1","nameAr":"كتب"}]}""")),
            response(200, JSONObject("""{
              "entries":[{
                "id":"33333333-3333-3333-3333-333333333333","displayName":"سلمى","username":"salma",
                "avatarUrl":null,"city":"القاهرة","area":"المعادي","successfulSwapsCount":4,"activeItemsCount":3
              }],"hasMore":false
            }""")),
        )
        val repository = OracleDiscoverRepository(authenticator, transport)

        val categories = repository.loadCategories(session) as DiscoverResult.Success
        val people = repository.loadPeoplePreview(categories.session, 4) as DiscoverResult.Success

        assertEquals("كتب", categories.value.single().nameAr)
        assertEquals("سلمى", people.value.single().displayName)
        assertEquals(
            listOf("/v1/marketplace/categories", "/v1/people?query=&page=1&pageSize=4"),
            transport.requests.map { it.path },
        )
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class DiscoverQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val values = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return values.removeFirst()
    }
}
