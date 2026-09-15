package com.teswa.mobile.auth

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class AuthRepository(
    context: Context,
    private val oracle: OracleAuthClient = OracleAuthClient(),
) : SessionAuthenticator {
    private val appContext = context.applicationContext
    private val store = SessionStore(appContext)
    private val google = GoogleCredentialSignIn(appContext)
    private val refreshMutex = Mutex()
    private var invalidatedAccessToken: String? = null

    suspend fun restore(): AuthResult<AuthSession?> {
        val local = store.read() ?: return AuthResult.Success(null)

        if (!local.isUsable()) {
            if (local.refreshToken == null) {
                store.clear()
                return AuthResult.Success(null)
            }
            return when (val refreshed = refreshStoredSession(local)) {
                is AuthResult.Success -> {
                    AuthResult.Success(refreshed.value)
                }
                is AuthResult.Failure -> {
                    if (refreshed.reason == AuthResult.Reason.NETWORK) {
                        refreshed
                    } else {
                        store.clear()
                        AuthResult.Success(null)
                    }
                }
            }
        }

        return when (val validated = oracle.validate(local)) {
            is AuthResult.Success -> {
                store.write(validated.value)
                AuthResult.Success(validated.value)
            }
            is AuthResult.Failure -> when (validated.reason) {
                AuthResult.Reason.NETWORK -> AuthResult.Success(local)
                AuthResult.Reason.SESSION_EXPIRED -> refreshStoredSession(local)
                else -> validated
            }
        }
    }

    override suspend fun ensureValid(
        session: AuthSession,
        forceRefresh: Boolean,
    ): AuthResult<AuthSession> {
        if (!forceRefresh && session.isUsable()) return AuthResult.Success(session)
        return refreshStoredSession(session)
    }

    private suspend fun refreshStoredSession(session: AuthSession): AuthResult<AuthSession> = refreshMutex.withLock {
        if (invalidatedAccessToken == session.accessToken) {
            return@withLock AuthResult.Failure(
                reason = AuthResult.Reason.SESSION_EXPIRED,
                message = "انتهت جلسة تِسوى. سجّل دخولك مرة تانية.",
            )
        }

        val stored = store.read()
        if (stored != null && stored.accessToken != session.accessToken && stored.isUsable()) {
            return@withLock AuthResult.Success(stored)
        }

        val refreshToken = stored
            ?.takeIf { it.user.id == session.user.id }
            ?.refreshToken
            ?: session.refreshToken
            ?: return@withLock AuthResult.Failure(
                reason = AuthResult.Reason.SESSION_EXPIRED,
                message = "انتهت جلسة تِسوى. سجّل دخولك مرة تانية.",
            )

        when (val refreshed = oracle.refresh(refreshToken)) {
            is AuthResult.Success -> {
                invalidatedAccessToken = null
                store.write(refreshed.value)
                AuthResult.Success(refreshed.value)
            }
            is AuthResult.Failure -> {
                if (refreshed.reason != AuthResult.Reason.NETWORK) {
                    invalidatedAccessToken = session.accessToken
                    store.clear()
                }
                refreshed
            }
        }
    }

    suspend fun signInWithGoogle(context: Context): AuthResult<AuthSession> {
        return try {
            when (val credential = google.getIdToken(context)) {
                is AuthResult.Success -> when (val exchange = oracle.exchangeGoogleIdToken(credential.value)) {
                    is AuthResult.Success -> {
                        invalidatedAccessToken = null
                        store.write(exchange.value)
                        AuthResult.Success(exchange.value)
                    }
                    is AuthResult.Failure -> exchange
                }
                is AuthResult.Failure -> credential
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Throwable) {
            AuthResult.Failure(
                AuthResult.Reason.UNKNOWN,
                "حدث خطأ غير متوقع أثناء تسجيل الدخول.",
            )
        }
    }

    suspend fun signOut() {
        val local = store.read()
        invalidatedAccessToken = local?.accessToken
        store.clear()
        if (local != null) runCatching { oracle.logout(local.accessToken) }
    }
}
