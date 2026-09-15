package com.teswa.mobile.account

import android.content.Context
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

class AccountGateRepository(
    context: Context,
    private val client: OracleAccountGateClient,
) {
    private val cache = AccountGateCache(context.applicationContext)

    suspend fun check(session: AuthSession): AccountGateState = coroutineScope {
        val cachedVerified = cache.isVerified(session.user.id)
        val profileDeferred = async { client.fetchProfile(session) }
        val policiesDeferred = async { client.fetchPolicyAcceptances(session) }

        val profileResult = profileDeferred.await()
        val profile = when (profileResult) {
            is AccountGateResult.Success -> profileResult.value
            is AccountGateResult.Failure -> {
                if (profileResult.network && cachedVerified) {
                    return@coroutineScope AccountGateState.Ready(profileResult.session ?: session, null)
                }
                return@coroutineScope AccountGateState.Error(
                    session = profileResult.session ?: session,
                    message = profileResult.message,
                    sessionExpired = profileResult.unauthorized,
                )
            }
        }

        val policyResult = policiesDeferred.await()
        val policies = when (policyResult) {
            is AccountGateResult.Success -> policyResult.value
            is AccountGateResult.Failure -> {
                if (policyResult.network && cachedVerified) {
                    return@coroutineScope AccountGateState.Ready(
                        policyResult.session ?: profileResult.session,
                        profile,
                    )
                }
                return@coroutineScope AccountGateState.Error(
                    session = policyResult.session ?: profileResult.session,
                    message = policyResult.message,
                    sessionExpired = policyResult.unauthorized,
                )
            }
        }

        val activeSession = if (policyResult.session.accessToken != session.accessToken) {
            policyResult.session
        } else {
            profileResult.session
        }

        if (profile == null || !profile.isComplete) {
            return@coroutineScope AccountGateState.NeedsProfile(activeSession)
        }

        if (!requiredPoliciesAccepted(policies)) {
            return@coroutineScope AccountGateState.NeedsPolicies(activeSession, profile)
        }

        cache.markVerified(activeSession.user.id)
        AccountGateState.Ready(activeSession, profile)
    }

    suspend fun saveProfile(
        session: AuthSession,
        displayName: String,
        username: String,
    ): AccountGateState {
        val cleanName = displayName.trim()
        val cleanUsername = username.trim().lowercase()
        if (cleanName.isBlank()) return AccountGateState.Error(session, "الاسم الظاهر مطلوب.")
        if (!USERNAME.matches(cleanUsername)) {
            return AccountGateState.Error(session, "اسم المستخدم لازم يكون 3–30 حرف إنجليزي صغير أو رقم أو _.")
        }

        return when (val result = client.setupProfile(session, cleanName, cleanUsername)) {
            is AccountGateResult.Success -> check(result.session)
            is AccountGateResult.Failure -> AccountGateState.Error(
                session = result.session ?: session,
                message = result.message,
                sessionExpired = result.unauthorized,
            )
        }
    }

    suspend fun acceptPolicies(session: AuthSession): AccountGateState {
        return when (val result = client.recordRequiredPolicies(session)) {
            is AccountGateResult.Success -> check(result.session)
            is AccountGateResult.Failure -> AccountGateState.Error(
                session = result.session ?: session,
                message = result.message,
                sessionExpired = result.unauthorized,
            )
        }
    }

    fun clearUserCache(userId: String) {
        cache.clear(userId)
    }

    internal fun requiredPoliciesAccepted(rows: List<PolicyAcceptance>): Boolean {
        val accepted = rows
            .filter { it.policyVersion == RequiredPolicies.VERSION }
            .map { it.policyKey }
            .toSet()
        return RequiredPolicies.keys.all(accepted::contains)
    }

    private companion object {
        val USERNAME = Regex("^[a-z0-9_]{3,30}$")
    }
}

private class AccountGateCache(context: Context) {
    private val prefs = context.getSharedPreferences("teswa_native_account_gate", Context.MODE_PRIVATE)

    fun markVerified(userId: String) {
        prefs.edit()
            .putString(key(userId, "fingerprint"), RequiredPolicies.FINGERPRINT)
            .putLong(key(userId, "verified_at"), System.currentTimeMillis())
            .apply()
    }

    fun isVerified(userId: String): Boolean {
        val fingerprint = prefs.getString(key(userId, "fingerprint"), null)
        val verifiedAt = prefs.getLong(key(userId, "verified_at"), 0L)
        if (fingerprint != RequiredPolicies.FINGERPRINT || verifiedAt <= 0L) return false
        return System.currentTimeMillis() - verifiedAt <= MAX_AGE_MS
    }

    fun clear(userId: String) {
        prefs.edit()
            .remove(key(userId, "fingerprint"))
            .remove(key(userId, "verified_at"))
            .apply()
    }

    private fun key(userId: String, suffix: String) = "$userId:$suffix"

    private companion object {
        const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L
    }
}
