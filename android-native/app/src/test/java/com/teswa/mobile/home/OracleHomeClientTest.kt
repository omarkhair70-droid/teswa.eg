package com.teswa.mobile.home

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

class OracleHomeClientTest {
    private val session = AuthSession(
        accessToken = "access-token",
        refreshToken = "refresh-token",
        expiresAtEpochSeconds = 9_999_999_999L,
        user = AuthUser("user-1", null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun parsesOracleFeedContractAndCarriesSession() = runBlocking {
        val transport = OneShotTransport(
            OracleTransportResult.Response(
                OracleResponse(
                    200,
                    JSONObject(
                        """{
                          "items": [{
                            "id": "11111111-1111-1111-1111-111111111111",
                            "title": "كاميرا فيلم",
                            "coverImageUrl": "https://media.example/item.jpg",
                            "category": "كاميرات",
                            "condition": "good_used",
                            "city": "القاهرة"
                          }],
                          "hasMore": true
                        }""".trimIndent(),
                    ),
                ),
            ),
        )
        val client = OracleHomeClient(authenticator, transport)

        val result = client.fetchFeed(session, offset = 20, limit = 80)

        assertTrue(result is HomeFeedResult.Success)
        result as HomeFeedResult.Success
        assertEquals(session, result.session)
        assertEquals("كاميرا فيلم", result.value.items.single().title)
        assertTrue(result.value.hasMore)
        assertEquals("/v1/marketplace/feed?offset=20&limit=40", transport.request.path)
        assertEquals("access-token", transport.request.bearerToken)
    }

    @Test
    fun rejectsIncompleteFeedPayload() = runBlocking {
        val transport = OneShotTransport(
            OracleTransportResult.Response(
                OracleResponse(200, JSONObject("""{"items": []}""")),
            ),
        )
        val client = OracleHomeClient(authenticator, transport)

        val result = client.fetchFeed(session)

        assertTrue(result is HomeFeedResult.Failure)
        assertEquals("استجابة الرئيسية غير مكتملة.", (result as HomeFeedResult.Failure).message)
    }
}

private class OneShotTransport(
    private val result: OracleTransportResult,
) : OracleTransport {
    lateinit var request: OracleRequest

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        this.request = request
        return result
    }
}
