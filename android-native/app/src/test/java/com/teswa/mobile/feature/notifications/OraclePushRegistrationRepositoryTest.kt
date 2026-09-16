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
import org.junit.Assert.assertTrue
import org.junit.Test

class OraclePushRegistrationRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val session = AuthSession(
        accessToken = "token",
        refreshToken = "refresh",
        expiresAtEpochSeconds = 9_999_999_999L,
        user = AuthUser(userId, null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun registerUsesExistingOraclePushContractWithNamespacedFcmToken() = runBlocking {
        val transport = PushRecordingTransport(okResponse())
        val repository = OraclePushRegistrationRepository(authenticator, transport)

        val result = repository.register(session, "fcm:device-token")

        assertTrue(result is PushRegistrationResult.Success)
        val request = transport.requests.single()
        assertEquals("/v1/notifications/push/register", request.path)
        assertEquals(
            setOf("userId", "expoPushToken", "platform"),
            requireNotNull(request.body).keys().asSequence().toSet(),
        )
        assertEquals(userId, request.body.getString("userId"))
        assertEquals("fcm:device-token", request.body.getString("expoPushToken"))
        assertEquals("android", request.body.getString("platform"))
    }

    @Test
    fun disableUsesExistingOraclePushContractWithoutInventingFields() = runBlocking {
        val transport = PushRecordingTransport(okResponse())
        val repository = OraclePushRegistrationRepository(authenticator, transport)

        repository.disable(session, "fcm:device-token")

        val request = transport.requests.single()
        assertEquals("/v1/notifications/push/disable", request.path)
        assertEquals(
            setOf("userId", "expoPushToken"),
            requireNotNull(request.body).keys().asSequence().toSet(),
        )
    }

    @Test
    fun rejectsUnnamespacedOrOversizedTokensBeforeNetwork() = runBlocking {
        val transport = PushRecordingTransport(okResponse())
        val repository = OraclePushRegistrationRepository(authenticator, transport)

        assertTrue(repository.register(session, "device-token") is PushRegistrationResult.Failure)
        assertTrue(repository.register(session, "fcm:${"x".repeat(509)}") is PushRegistrationResult.Failure)
        assertTrue(transport.requests.isEmpty())
    }

    private fun okResponse() = OracleTransportResult.Response(
        OracleResponse(200, JSONObject().put("ok", true)),
    )
}

private class PushRecordingTransport(
    private val response: OracleTransportResult,
) : OracleTransport {
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return response
    }
}
