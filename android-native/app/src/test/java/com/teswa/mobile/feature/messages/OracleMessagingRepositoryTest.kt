package com.teswa.mobile.feature.messages

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

class OracleMessagingRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val dealId = "22222222-2222-2222-2222-222222222222"
    private val requestedId = "33333333-3333-3333-3333-333333333333"
    private val offeredId = "44444444-4444-4444-4444-444444444444"
    private val otherId = "55555555-5555-5555-5555-555555555555"
    private val messageId = "66666666-6666-6666-6666-666666666666"
    private val session = AuthSession(
        "access", "refresh", 9_999_999_999L,
        AuthUser(userId, null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun joinsInboxWithMarketplaceItemTitles() = runBlocking {
        val transport = QueueTransport(
            OracleTransportResult.Response(
                OracleResponse(200, JSONObject("""{
                  "items":[{
                    "dealId":"$dealId","status":"coordinating","requestedItemId":"$requestedId",
                    "offeredItemId":"$offeredId","otherParticipant":{"id":"$otherId","displayName":"سلمى","avatarUrl":null},
                    "latestMessage":{"body":"ميعادنا بكرة","createdAt":"2026-09-15T12:00:00Z","senderId":"$otherId","messageType":"text"},
                    "unreadCount":2,"lastActivityAt":"2026-09-15T12:00:00Z"
                  }],"hasMore":false
                }""")),
            ),
            OracleTransportResult.Response(
                OracleResponse(200, JSONObject("""{
                  "items":[{"id":"$requestedId","title":"كاميرا"},{"id":"$offeredId","title":"كتاب"}]
                }""")),
            ),
        )
        val repository = OracleMessagingRepository(authenticator, transport)

        val result = repository.loadInbox(session)

        assertTrue(result is MessagingResult.Success)
        result as MessagingResult.Success
        val row = result.value.items.single()
        assertEquals("كاميرا", row.requestedItemTitle)
        assertEquals("كتاب", row.offeredItemTitle)
        assertEquals(2, row.unreadCount)
        assertEquals(
            "/v1/deals/inbox?userId=$userId&limit=50&offset=0",
            transport.requests.first().path,
        )
        assertEquals(
            "/v1/marketplace/exchange-items?ids=$requestedId,$offeredId",
            transport.requests.last().path,
        )
    }

    @Test
    fun sendsExactTextMessageContract() = runBlocking {
        val response = JSONObject("""{
          "id":"$messageId","dealId":"$dealId","senderId":"$userId","body":"أهلاً",
          "messageType":"text","createdAt":"2026-09-15T12:30:00Z"
        }""")
        val transport = QueueTransport(OracleTransportResult.Response(OracleResponse(201, response)))
        val repository = OracleMessagingRepository(authenticator, transport)

        val result = repository.sendText(session, dealId, otherId, "  أهلاً  ")

        assertTrue(result is MessagingResult.Success)
        val request = transport.requests.single()
        val body = requireNotNull(request.body)
        assertEquals("/v1/deals/$dealId/messages", request.path)
        assertEquals(setOf("senderId", "body"), body.keys().asSequence().toSet())
        assertEquals(userId, body.getString("senderId"))
        assertEquals("أهلاً", body.getString("body"))
    }

    @Test
    fun loadsLatestMessagesInChronologicalDisplayOrder() = runBlocking {
        val olderId = "77777777-7777-7777-7777-777777777777"
        val transport = QueueTransport(
            OracleTransportResult.Response(
                OracleResponse(200, JSONObject("""{
                  "items":[
                    {"id":"$messageId","dealId":"$dealId","senderId":"$userId","body":"الأحدث","messageType":"text","createdAt":"2026-09-15T12:30:00Z"},
                    {"id":"$olderId","dealId":"$dealId","senderId":"$otherId","body":"الأقدم","messageType":"text","createdAt":"2026-09-15T12:00:00Z"}
                  ],"hasMore":false
                }""")),
            ),
        )
        val repository = OracleMessagingRepository(authenticator, transport)

        val result = repository.loadMessages(session, dealId) as MessagingResult.Success

        assertEquals(listOf("الأقدم", "الأحدث"), result.value.map { it.body })
        assertEquals("/v1/deals/$dealId/messages?limit=100&offset=0&order=desc", transport.requests.single().path)
    }

    @Test
    fun loadsDealConfirmationParticipants() = runBlocking {
        val transport = QueueTransport(
            OracleTransportResult.Response(OracleResponse(200, JSONObject("""{"userIds":["$userId","$otherId"]}"""))),
        )

        val result = OracleMessagingRepository(authenticator, transport).loadConfirmations(session, dealId)

        assertEquals(setOf(userId, otherId), (result as MessagingResult.Success).value)
        assertEquals("/v1/deals/$dealId/confirmations", transport.requests.single().path)
    }

    @Test
    fun confirmationThenCompletionUseExactOracleContracts() = runBlocking {
        val transport = QueueTransport(
            OracleTransportResult.Response(OracleResponse(200, JSONObject().put("ok", true))),
            OracleTransportResult.Response(OracleResponse(200, JSONObject().put("completed", false))),
        )
        val conversation = DealConversation(
            dealId, "coordinating", "كاميرا", "كتاب", otherId, "سلمى", null, null, 0,
            "2026-09-15T12:00:00Z",
        )

        val result = OracleMessagingRepository(authenticator, transport).confirmCompletion(session, conversation)

        assertTrue(result is MessagingResult.Success && !result.value)
        assertEquals(listOf("/v1/deals/$dealId/confirmations", "/v1/deals/$dealId/complete"), transport.requests.map { it.path })
        val confirmation = requireNotNull(transport.requests.first().body)
        assertEquals(setOf("userId", "note"), confirmation.keys().asSequence().toSet())
        assertEquals(userId, confirmation.getString("userId"))
        assertTrue(confirmation.isNull("note"))
        assertEquals(0, requireNotNull(transport.requests.last().body).length())
    }
}

private class QueueTransport(vararg results: OracleTransportResult) : OracleTransport {
    private val queue = ArrayDeque(results.toList())
    val requests = mutableListOf<OracleRequest>()
    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return queue.removeFirst()
    }
}
