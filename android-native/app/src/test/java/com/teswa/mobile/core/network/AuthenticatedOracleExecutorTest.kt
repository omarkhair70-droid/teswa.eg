package com.teswa.mobile.core.network

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthenticatedOracleExecutorTest {
    private val user = AuthUser(
        id = "user-1",
        email = null,
        phone = null,
        displayName = null,
        avatarUrl = null,
    )
    private val initial = session("access-old", "refresh-old")
    private val rotated = session("access-new", "refresh-new")

    @Test
    fun retriesOriginalRequestOnceWithRotatedToken() = runBlocking {
        val authenticator = RecordingAuthenticator(initial, rotated)
        val transport = RecordingTransport(listOf(response(401), response(200)))
        val executor = AuthenticatedOracleExecutor(authenticator, transport)

        val result = executor.execute(initial, OracleRequest(path = "/v1/marketplace/feed"))

        assertTrue(result is AuthenticatedOracleResult.Response)
        assertEquals(rotated, (result as AuthenticatedOracleResult.Response).session)
        assertEquals(listOf("access-old", "access-new"), transport.tokens)
        assertEquals(listOf(false, true), authenticator.forceRefreshes)
    }

    @Test
    fun secondUnauthorizedResponseDoesNotLoop() = runBlocking {
        val authenticator = RecordingAuthenticator(initial, rotated)
        val transport = RecordingTransport(listOf(response(401), response(401)))
        val executor = AuthenticatedOracleExecutor(authenticator, transport)

        val result = executor.execute(initial, OracleRequest(path = "/v1/profiles/me"))

        assertEquals(401, (result as AuthenticatedOracleResult.Response).value.status)
        assertEquals(2, transport.tokens.size)
        assertEquals(listOf(false, true), authenticator.forceRefreshes)
    }

    @Test
    fun networkFailureDoesNotRefreshSession() = runBlocking {
        val authenticator = RecordingAuthenticator(initial, rotated)
        val transport = RecordingTransport(
            listOf(OracleTransportResult.NetworkFailure(OracleNetworkFailureKind.OFFLINE, true)),
        )
        val executor = AuthenticatedOracleExecutor(authenticator, transport)

        val result = executor.execute(initial, OracleRequest(path = "/v1/marketplace/feed"))

        assertTrue(result is AuthenticatedOracleResult.NetworkFailure)
        assertEquals(listOf(false), authenticator.forceRefreshes)
        assertEquals(listOf("access-old"), transport.tokens)
    }

    private fun session(accessToken: String, refreshToken: String) = AuthSession(
        accessToken = accessToken,
        refreshToken = refreshToken,
        expiresAtEpochSeconds = 9_999_999_999L,
        user = user,
    )

    private fun response(status: Int) = OracleTransportResult.Response(
        OracleResponse(status, JSONObject()),
    )
}

private class RecordingAuthenticator(
    private val initial: AuthSession,
    private val rotated: AuthSession,
) : SessionAuthenticator {
    val forceRefreshes = mutableListOf<Boolean>()

    override suspend fun ensureValid(
        session: AuthSession,
        forceRefresh: Boolean,
    ): AuthResult<AuthSession> {
        forceRefreshes += forceRefresh
        return AuthResult.Success(if (forceRefresh) rotated else initial)
    }
}

private class RecordingTransport(
    responses: List<OracleTransportResult>,
) : OracleTransport {
    private val remaining = ArrayDeque(responses)
    val tokens = mutableListOf<String?>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        tokens += request.bearerToken
        return remaining.removeFirst()
    }
}
