package com.teswa.mobile.auth

fun interface SessionAuthenticator {
    suspend fun ensureValid(
        session: AuthSession,
        forceRefresh: Boolean,
    ): AuthResult<AuthSession>
}
