package com.teswa.mobile.feature.settings

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OracleSettingsRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val blockedId = "22222222-2222-2222-2222-222222222222"
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser(userId, null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadUsesPrivacyPreferencesThenBlockedContracts() = runBlocking {
        val transport = SettingsQueueTransport(
            response(200, JSONObject().put("value", "followers_only")),
            response(200, preferences()),
            response(200, JSONObject("""{"items":[{
              "id":"$blockedId","displayName":"مستخدم","username":"user_2",
              "avatarUrl":null,"blockedAt":"2026-09-12T10:00:00Z"
            }]}""")),
        )

        val result = OracleSettingsRepository(authenticator, transport).load(session) as SettingsResult.Success

        assertEquals(DirectMessagePrivacy.FOLLOWERS_ONLY, result.value.privacy)
        assertEquals("23:00", result.value.notifications.quietHoursStart)
        assertEquals("user_2", result.value.blockedUsers.single().username)
        assertEquals(
            listOf("/v1/profiles/privacy", "/v1/notifications/preferences", "/v1/profiles/blocked"),
            transport.requests.map { it.path },
        )
    }

    @Test
    fun privacyUpdateUsesExactActorAndWireValue() = runBlocking {
        val transport = SettingsQueueTransport(response(200, JSONObject().put("updated", true)))

        val result = OracleSettingsRepository(authenticator, transport)
            .updatePrivacy(session, DirectMessagePrivacy.NO_ONE)

        assertTrue(result is SettingsResult.Success)
        val request = transport.requests.single()
        assertEquals(OracleHttpMethod.POST, request.method)
        assertEquals("/v1/profiles/privacy", request.path)
        assertEquals(setOf("userId", "value"), requireNotNull(request.body).keys().asSequence().toSet())
        assertEquals(userId, request.body.getString("userId"))
        assertEquals("no_one", request.body.getString("value"))
    }

    @Test
    fun notificationUpdateSendsOnlyChangedPreference() = runBlocking {
        val transport = SettingsQueueTransport(response(200, preferences().put("marketingEnabled", true)))

        val result = OracleSettingsRepository(authenticator, transport)
            .updateNotification(session, NotificationToggle.MARKETING, true)

        assertTrue(result is SettingsResult.Success)
        val request = transport.requests.single()
        assertEquals("/v1/notifications/preferences", request.path)
        assertEquals(setOf("marketingEnabled"), requireNotNull(request.body).keys().asSequence().toSet())
        assertTrue(request.body.getBoolean("marketingEnabled"))
    }

    @Test
    fun accountDeletionUsesAnExactlyEmptyBody() = runBlocking {
        val transport = SettingsQueueTransport(response(200, JSONObject().put("ok", true)))

        val result = OracleSettingsRepository(authenticator, transport).deleteAccount(session)

        assertTrue(result is SettingsResult.Success)
        val request = transport.requests.single()
        assertEquals("/v1/account/deletion-request", request.path)
        assertEquals(0, requireNotNull(request.body).length())
    }

    private fun preferences() = JSONObject(
        """{
          "offersEnabled":true,"dealsEnabled":true,"messagesEnabled":true,"socialEnabled":true,
          "smartRemindersEnabled":true,"marketingEnabled":false,"quietHoursEnabled":false,
          "quietHoursStart":"23:00","quietHoursEnd":"08:00","updatedAt":null
        }""",
    )

    private fun response(status: Int, body: JSONObject) =
        OracleTransportResult.Response(OracleResponse(status, body))
}

private class SettingsQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val remaining = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return remaining.removeFirst()
    }
}
