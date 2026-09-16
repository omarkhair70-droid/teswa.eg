package com.teswa.mobile.feature.people

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

class OraclePeopleRepositoryTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun sanitizesSearchAndParsesDirectoryPage() = runBlocking {
        val transport = PeopleQueueTransport(
            response(200, JSONObject("""{
              "entries":[{
                "id":"22222222-2222-2222-2222-222222222222",
                "displayName":"سلمى أحمد","username":"salma","avatarUrl":"https://media.example/avatar.jpg",
                "coverUrl":null,"profileTagline":"بحب الكتب والكاميرات","bio":"تبديل بسيط",
                "city":"القاهرة","area":"المعادي","successfulSwapsCount":4,
                "responseRate":92.5,"activeItemsCount":3,"createdAt":"2026-09-01T12:00:00Z"
              }],"hasMore":true
            }""")),
        )
        val repository = OraclePeopleRepository(authenticator, transport)

        val result = repository.load(session, "  سلمى%(المعادي)  ", page = 2, pageSize = 24)

        assertTrue(result is PeopleResult.Success)
        result as PeopleResult.Success
        assertEquals("سلمى أحمد", result.value.entries.single().displayName)
        assertEquals(92.5, result.value.entries.single().responseRate!!, 0.01)
        assertTrue(result.value.hasMore)
        assertEquals(
            "/v1/people?query=%D8%B3%D9%84%D9%85%D9%89+%D8%A7%D9%84%D9%85%D8%B9%D8%A7%D8%AF%D9%8A&page=2&pageSize=24",
            transport.requests.single().path,
        )
    }

    @Test
    fun capsQueryAndPageSizeAtNativeBoundary() = runBlocking {
        val transport = PeopleQueueTransport(response(200, JSONObject("""{"entries":[],"hasMore":false}""")))
        val repository = OraclePeopleRepository(authenticator, transport)
        repository.load(session, "x".repeat(100), page = 0, pageSize = 100)
        val path = transport.requests.single().path
        assertTrue(path.contains("page=1"))
        assertTrue(path.contains("pageSize=40"))
        assertTrue(path.substringAfter("query=").substringBefore("&").length == 80)
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class PeopleQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val values = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return values.removeFirst()
    }
}
