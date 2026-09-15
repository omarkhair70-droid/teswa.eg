package com.teswa.mobile.feature.offers

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

class OracleOffersRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val offerId = "22222222-2222-2222-2222-222222222222"
    private val requestedId = "33333333-3333-3333-3333-333333333333"
    private val offeredId = "44444444-4444-4444-4444-444444444444"
    private val senderId = "55555555-5555-5555-5555-555555555555"
    private val dealId = "66666666-6666-6666-6666-666666666666"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(userId, null, null, null, null))
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadsAndHydratesIncomingOffers() = runBlocking {
        val incoming = offerPage("pending", senderId, userId)
        val sent = JSONObject("""{"items":[],"hasMore":false}""")
        val items = JSONObject("""{"items":[
          {"id":"$requestedId","title":"راديو","imageUrl":"https://media.example/radio.jpg"},
          {"id":"$offeredId","title":"كتاب","imageUrl":null}
        ]}""")
        val transport = OfferQueueTransport(
            response(200, incoming), response(200, sent), response(200, items),
        )
        val repository = OracleOffersRepository(authenticator, transport)

        val result = repository.load(session) as OffersResult.Success

        assertEquals("راديو", result.value.incoming.single().requestedItem.title)
        assertEquals("كتاب", result.value.incoming.single().offeredItem.title)
        assertEquals(
            listOf(
                "/v1/offers?direction=incoming&limit=50&offset=0",
                "/v1/offers?direction=sent&limit=50&offset=0",
                "/v1/marketplace/exchange-items?ids=$requestedId,$offeredId",
            ),
            transport.requests.map { it.path },
        )
    }

    @Test
    fun acceptingOfferUsesEmptyBodyAndReturnsDeal() = runBlocking {
        val transport = OfferQueueTransport(response(200, JSONObject().put("dealId", dealId)))
        val repository = OracleOffersRepository(authenticator, transport)

        val result = repository.act(session, offerId, OfferAction.ACCEPT)

        assertTrue(result is OffersResult.Success)
        result as OffersResult.Success
        assertEquals(dealId, result.value.dealId)
        assertEquals("/v1/offers/$offerId/accept", transport.requests.single().path)
        assertEquals(0, requireNotNull(transport.requests.single().body).length())
    }

    private fun offerPage(status: String, sender: String, receiver: String) = JSONObject("""{
      "items":[{
        "id":"$offerId","status":"$status","message":"يناسبك؟","requestedItemId":"$requestedId",
        "offeredItemId":"$offeredId","senderId":"$sender","receiverId":"$receiver","dealId":null,
        "createdAt":"2026-09-15T12:00:00Z"
      }],"hasMore":false
    }""")

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class OfferQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val values = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()
    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return values.removeFirst()
    }
}
