package com.teswa.mobile.feature.contextual

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

class OracleContextualRepositoryTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val other = "22222222-2222-2222-2222-222222222222"
    private val conversation = "33333333-3333-3333-3333-333333333333"
    private val story = "44444444-4444-4444-4444-444444444444"
    private val message = "55555555-5555-5555-5555-555555555555"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(me, null, null, null, null))
    private val auth = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun parsesStoryReplyInbox() = runBlocking {
        val transport = ContextQueue(response(200, JSONObject("""{"items":[{
          "conversationId":"$conversation","contextType":"story_reply","contextEntityId":"$story",
          "otherParticipant":{"id":"$other","displayName":"سلمى","username":"salma","avatarUrl":null},
          "latestMessage":{"id":"$message","body":"جميلة","senderId":"$other","createdAt":"2026-09-15T12:00:00Z","kind":"text","durationMs":null},
          "unreadCount":2,"lastActivityAt":"2026-09-15T12:00:00Z"
        }]}""")))

        val result = OracleContextualRepository(auth, transport).loadInbox(session) as ContextualResult.Success

        assertEquals("سلمى", result.value.single().other.displayName)
        assertEquals(2, result.value.single().unreadCount)
        assertEquals("/v1/contextual/conversations?userId=$me", transport.requests.single().path)
    }

    @Test
    fun sendingUsesExactMessageThenNotificationContracts() = runBlocking {
        val sent = JSONObject("""{
          "id":"$message","conversationId":"$conversation","senderId":"$me","body":"شكراً",
          "messageKind":"text","mediaStoragePath":null,"mediaDurationMs":null,"createdAt":"2026-09-15T12:00:00Z"
        }""")
        val transport = ContextQueue(response(201, sent), response(200, JSONObject().put("ok", true)))

        val result = OracleContextualRepository(auth, transport).sendText(session, conversation, "  شكراً  ")

        assertTrue(result is ContextualResult.Success)
        assertEquals(
            listOf("/v1/contextual/conversations/$conversation/messages", "/v1/contextual/notifications"),
            transport.requests.map { it.path },
        )
        val messageBody = requireNotNull(transport.requests.first().body)
        assertEquals(setOf("senderId", "body"), messageBody.keys().asSequence().toSet())
        assertEquals("شكراً", messageBody.getString("body"))
        val notificationBody = requireNotNull(transport.requests.last().body)
        assertEquals(setOf("conversationId", "messageId", "kind"), notificationBody.keys().asSequence().toSet())
        assertEquals("thread_message", notificationBody.getString("kind"))
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class ContextQueue(vararg values: OracleTransportResult) : OracleTransport {
    private val remaining = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()
    override suspend fun execute(request: OracleRequest): OracleTransportResult { requests += request; return remaining.removeFirst() }
}
