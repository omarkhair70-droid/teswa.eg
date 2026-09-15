package com.teswa.mobile.account

import com.teswa.mobile.auth.AuthSession

data class AccountProfile(
    val id: String,
    val displayName: String?,
    val username: String?,
    val city: String?,
) {
    val isComplete: Boolean
        get() = !displayName.isNullOrBlank() && !username.isNullOrBlank()
}

data class PolicyAcceptance(
    val policyKey: String,
    val policyVersion: String,
)

sealed interface AccountGateResult<out T> {
    data class Success<T>(
        val value: T,
        val session: AuthSession,
    ) : AccountGateResult<T>
    data class Failure(
        val message: String,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
        val session: AuthSession? = null,
    ) : AccountGateResult<Nothing>
}

sealed interface AccountGateState {
    data object Checking : AccountGateState
    data class NeedsProfile(val session: AuthSession) : AccountGateState
    data class NeedsPolicies(val session: AuthSession, val profile: AccountProfile) : AccountGateState
    data class Ready(val session: AuthSession, val profile: AccountProfile?) : AccountGateState
    data class Error(
        val session: AuthSession,
        val message: String,
        val sessionExpired: Boolean = false,
    ) : AccountGateState
}

object RequiredPolicies {
    const val TERMS_KEY = "terms_of_use"
    const val COMMUNITY_KEY = "community_guidelines"
    const val VERSION = "2026-05"
    const val FINGERPRINT = "$TERMS_KEY:$VERSION|$COMMUNITY_KEY:$VERSION"

    val keys = listOf(TERMS_KEY, COMMUNITY_KEY)
}
