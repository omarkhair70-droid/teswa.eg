package com.teswa.mobile.auth

data class AuthUser(
    val id: String,
    val email: String?,
    val phone: String?,
    val displayName: String?,
    val avatarUrl: String?,
)

data class AuthSession(
    val accessToken: String,
    val refreshToken: String?,
    val expiresAtEpochSeconds: Long?,
    val user: AuthUser,
) {
    fun isUsable(nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): Boolean {
        val expiry = expiresAtEpochSeconds ?: return false
        return expiry > nowEpochSeconds + 15L
    }
}

sealed interface AuthResult<out T> {
    data class Success<T>(val value: T) : AuthResult<T>
    data class Failure(
        val reason: Reason,
        val message: String,
        val retryable: Boolean = false,
    ) : AuthResult<Nothing>

    enum class Reason {
        CANCELLED,
        PROVIDER,
        NETWORK,
        SESSION_EXPIRED,
        RATE_LIMITED,
        INVALID_RESPONSE,
        UNKNOWN,
    }
}

sealed interface AuthUiState {
    data object Restoring : AuthUiState
    data object SignedOut : AuthUiState
    data class Working(val message: String) : AuthUiState
    data class SignedIn(val session: AuthSession) : AuthUiState
    data class Error(val message: String) : AuthUiState
}
