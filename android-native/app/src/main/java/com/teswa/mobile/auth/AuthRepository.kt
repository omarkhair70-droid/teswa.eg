package com.teswa.mobile.auth

import android.content.Context
import kotlinx.coroutines.CancellationException

class AuthRepository(context: Context) {
    private val appContext = context.applicationContext
    private val store = SessionStore(appContext)
    private val oracle = OracleAuthClient()
    private val google = GoogleCredentialSignIn(appContext)

    suspend fun restore(): AuthResult<AuthSession?> {
        val local = store.read() ?: return AuthResult.Success(null)

        if (!local.isUsable()) {
            val refreshToken = local.refreshToken
            if (refreshToken == null) {
                store.clear()
                return AuthResult.Success(null)
            }
            return when (val refreshed = oracle.refresh(refreshToken)) {
                is AuthResult.Success -> {
                    store.write(refreshed.value)
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
                AuthResult.Reason.SESSION_EXPIRED -> {
                    val refreshToken = local.refreshToken
                    if (refreshToken == null) {
                        store.clear()
                        AuthResult.Success(null)
                    } else {
                        when (val refreshed = oracle.refresh(refreshToken)) {
                            is AuthResult.Success -> {
                                store.write(refreshed.value)
                                AuthResult.Success(refreshed.value)
                            }
                            is AuthResult.Failure -> {
                                if (refreshed.reason != AuthResult.Reason.NETWORK) store.clear()
                                refreshed
                            }
                        }
                    }
                }
                else -> validated
            }
        }
    }

    suspend fun signInWithGoogle(context: Context): AuthResult<AuthSession> {
        return try {
            when (val credential = google.getIdToken(context)) {
                is AuthResult.Success -> when (val exchange = oracle.exchangeGoogleIdToken(credential.value)) {
                    is AuthResult.Success -> {
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
        store.clear()
        if (local != null) runCatching { oracle.logout(local.accessToken) }
    }
}
