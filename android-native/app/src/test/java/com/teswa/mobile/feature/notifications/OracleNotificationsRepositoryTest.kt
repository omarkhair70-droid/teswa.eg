package com.teswa.mobile.feature.notifications

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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OracleNotificationsRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val notificationId = "22222222-2222-2222-2222-222222222222"
    private val dealId = "33333333-3333-3333-3333-333333333333"
    private val targetUserId = "44444444-4444-4444-4444-444444444444"
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser(userId, null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadsAndResolvesDealNotification() = runBlocking {
        val body = JSONObject("""{"items":[{
          "id":"$notificationId","type":"deal_message_received","title":"رسالة جديدة",
          "body":"اتفقنا","route":null,"actorUserId":null,"itemId":null,"offerId":null,
          "dealId":"$dealId","conversationId":null,"readAt":null,"createdAt":"2026-09-15T12:00:00Z"
        }]}""")
        val transport = NotificationQueueTransport(response(200, body))

        val result = OracleNotificationsRepository(authenticator, transport).load(session) as NotificationsResult.Success

        val notification = result.value.single()
        assertTrue(!notification.isRead)
        assertEquals(NotificationDestination.Deal(dealId), notification.destination())
        assertEquals("/v1/notifications?limit=50", transport.requests.single().path)
    }

    @Test
    fun markReadUsesExactActorPayload() = runBlocking {
        val transport = NotificationQueueTransport(response(200, JSONObject().put("ok", true)))

        val result = OracleNotificationsRepository(authenticator, transport).markRead(session, notificationId)

        assertTrue(result is NotificationsResult.Success)
        val request = transport.requests.single()
        assertEquals("/v1/notifications/read", request.path)
        assertEquals(setOf("userId", "notificationId"), requireNotNull(request.body).keys().asSequence().toSet())
        assertEquals(userId, request.body.getString("userId"))
    }

    @Test
    fun unrecognizedDestinationStillLoadsAsReadableActivity() = runBlocking {
        val body = JSONObject("""{"items":[{
          "id":"$notificationId","type":"system","title":"من تِسوى","body":null,"route":null,
          "actorUserId":null,"itemId":null,"offerId":null,"dealId":null,"conversationId":null,
          "readAt":"2026-09-15T12:01:00Z","createdAt":"2026-09-15T12:00:00Z"
        }]}""")
        val transport = NotificationQueueTransport(response(200, body))

        val notification = (OracleNotificationsRepository(authenticator, transport).load(session) as NotificationsResult.Success).value.single()

        assertTrue(notification.isRead)
        assertNull(notification.destination())
    }

    @Test
    fun dispatcherUsesTheExactOracleDispatchEnvelope() = runBlocking {
        val transport = NotificationQueueTransport(response(200, JSONObject().put("accepted", true)))
        val dispatcher = OracleNotificationDispatcher(authenticator, transport)

        dispatcher.dispatch(
            session,
            NotificationDispatch(
                targetUserId = targetUserId,
                type = "deal_message_received",
                title = "رسالة جديدة",
                body = "ميعادنا بكرة",
                dealId = dealId,
                messageId = notificationId,
            ),
        )

        val request = transport.requests.single()
        val body = requireNotNull(request.body)
        assertEquals("/v1/notifications/dispatch", request.path)
        assertEquals(
            setOf("targetUserId", "type", "title", "body", "itemId", "offerId", "dealId", "messageId"),
            body.keys().asSequence().toSet(),
        )
        assertTrue(body.isNull("itemId"))
        assertTrue(body.isNull("offerId"))
        assertEquals(notificationId, body.getString("messageId"))
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class NotificationQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val remaining = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()
    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return remaining.removeFirst()
    }
}
