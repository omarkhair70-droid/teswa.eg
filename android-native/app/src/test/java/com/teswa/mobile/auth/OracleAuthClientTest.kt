package com.teswa.mobile.auth

import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class OracleAuthClientTest {
    @Test
    fun refreshUnauthorizedIsSessionExpiry() = runBlocking {
        val client = OracleAuthClient(FixedAuthTransport(401, JSONObject()))

        val result = client.refresh("refresh-token") as AuthResult.Failure

        assertEquals(AuthResult.Reason.SESSION_EXPIRED, result.reason)
    }

    @Test
    fun googleTokenRejectionStaysAProviderFailure() = runBlocking {
        val body = JSONObject().put("error", "invalid_google_token")
        val client = OracleAuthClient(FixedAuthTransport(401, body))

        val result = client.exchangeGoogleIdToken("google-token") as AuthResult.Failure

        assertEquals(AuthResult.Reason.PROVIDER, result.reason)
    }
}

private class FixedAuthTransport(
    private val status: Int,
    private val body: JSONObject,
) : OracleTransport {
    override suspend fun execute(request: OracleRequest) = OracleTransportResult.Response(
        OracleResponse(status, body),
    )
}
