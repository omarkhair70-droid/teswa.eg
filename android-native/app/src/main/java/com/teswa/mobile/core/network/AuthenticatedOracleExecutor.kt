package com.teswa.mobile.core.network

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator

sealed interface AuthenticatedOracleResult {
    data class Response(
        val session: AuthSession,
        val value: OracleResponse,
    ) : AuthenticatedOracleResult

    data class NetworkFailure(
        val session: AuthSession?,
        val kind: OracleNetworkFailureKind,
    ) : AuthenticatedOracleResult

    data class InvalidResponse(val session: AuthSession?) : AuthenticatedOracleResult
    data class SessionFailure(val failure: AuthResult.Failure) : AuthenticatedOracleResult
}

class AuthenticatedOracleExecutor(
    private val authenticator: SessionAuthenticator,
    private val transport: OracleTransport,
) {
    suspend fun execute(
        session: AuthSession,
        request: OracleRequest,
    ): AuthenticatedOracleResult {
        val valid = when (val result = authenticator.ensureValid(session, forceRefresh = false)) {
            is AuthResult.Success -> result.value
            is AuthResult.Failure -> return AuthenticatedOracleResult.SessionFailure(result)
        }

        val first = transport.execute(request.copy(bearerToken = valid.accessToken))
        if (first !is OracleTransportResult.Response || first.value.status != 401) {
            return first.toAuthenticated(valid)
        }

        val refreshed = when (val result = authenticator.ensureValid(valid, forceRefresh = true)) {
            is AuthResult.Success -> result.value
            is AuthResult.Failure -> return AuthenticatedOracleResult.SessionFailure(result)
        }
        return transport.execute(request.copy(bearerToken = refreshed.accessToken)).toAuthenticated(refreshed)
    }

    private fun OracleTransportResult.toAuthenticated(session: AuthSession): AuthenticatedOracleResult {
        return when (this) {
            is OracleTransportResult.Response -> AuthenticatedOracleResult.Response(session, value)
            is OracleTransportResult.NetworkFailure -> AuthenticatedOracleResult.NetworkFailure(session, kind)
            OracleTransportResult.InvalidResponse -> AuthenticatedOracleResult.InvalidResponse(session)
        }
    }
}
