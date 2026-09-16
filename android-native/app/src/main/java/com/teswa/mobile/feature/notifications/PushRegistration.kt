package com.teswa.mobile.feature.notifications

import android.content.Context
import androidx.core.content.edit
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume

sealed interface PushRegistrationResult {
    data class Success(val session: AuthSession) : PushRegistrationResult
    data class Failure(val message: String, val session: AuthSession? = null, val unauthorized: Boolean = false) : PushRegistrationResult
}

interface PushRegistrationRepository {
    suspend fun register(session: AuthSession, token: String): PushRegistrationResult
    suspend fun disable(session: AuthSession, token: String): PushRegistrationResult
}

class OraclePushRegistrationRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : PushRegistrationRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun register(session: AuthSession, token: String) = write(session, token, register = true)
    override suspend fun disable(session: AuthSession, token: String) = write(session, token, register = false)

    private suspend fun write(session: AuthSession, token: String, register: Boolean): PushRegistrationResult {
        val clean = token.trim()
        if (!clean.startsWith("fcm:") || clean.length !in 5..512) return PushRegistrationResult.Failure("رمز الإشعارات غير صالح.", session)
        val body = JSONObject().put("userId", session.user.id).put("expoPushToken", clean)
        if (register) body.put("platform", "android")
        val path = if (register) "/v1/notifications/push/register" else "/v1/notifications/push/disable"
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, path, body))) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> PushRegistrationResult.Success(result.session)
                result.value.status == 401 -> PushRegistrationResult.Failure("انتهت جلسة تِسوى.", result.session, unauthorized = true)
                else -> PushRegistrationResult.Failure("تعذر تحديث جهاز الإشعارات (${result.value.status}).", result.session)
            }
            is AuthenticatedOracleResult.NetworkFailure -> PushRegistrationResult.Failure("تعذر الاتصال لتحديث الإشعارات.", result.session)
            is AuthenticatedOracleResult.InvalidResponse -> PushRegistrationResult.Failure("استجابة تسجيل الإشعارات غير صالحة.", result.session)
            is AuthenticatedOracleResult.SessionFailure -> PushRegistrationResult.Failure(
                result.failure.message,
                unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            )
        }
    }
}

class NativePushTokenStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("teswa_native_push", Context.MODE_PRIVATE)
    fun save(installationId: String) = preferences.edit { putString(KEY, installationId.trim()) }
    fun load(): String? = preferences.getString(KEY, null)?.trim()?.takeIf(String::isNotEmpty)
    fun clear() = preferences.edit { remove(KEY) }
    private companion object { const val KEY = "fcm_installation_id" }
}

class NativePushManager(
    context: Context,
    private val repository: PushRegistrationRepository,
) {
    private val store = NativePushTokenStore(context)

    suspend fun sync(session: AuthSession): PushRegistrationResult {
        val installationId = firebaseInstallationId() ?: store.load()
            ?: return PushRegistrationResult.Failure("تعذر تسجيل جهاز الإشعارات.", session)
        store.save(installationId)
        return repository.register(session, "fcm:$installationId")
    }

    suspend fun disable(session: AuthSession): PushRegistrationResult {
        val installationId = store.load() ?: return PushRegistrationResult.Success(session)
        val result = repository.disable(session, "fcm:$installationId")
        if (result is PushRegistrationResult.Success) {
            store.clear()
            FirebaseMessaging.getInstance().unregister()
        }
        return result
    }

    private suspend fun firebaseInstallationId(): String? = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().register()
            .addOnSuccessListener {
                FirebaseInstallations.getInstance().id
                    .addOnSuccessListener { id ->
                        if (continuation.isActive) continuation.resume(id?.trim()?.takeIf(String::isNotEmpty))
                    }
                    .addOnFailureListener { if (continuation.isActive) continuation.resume(null) }
                    .addOnCanceledListener { if (continuation.isActive) continuation.resume(null) }
            }
            .addOnFailureListener { if (continuation.isActive) continuation.resume(null) }
            .addOnCanceledListener { if (continuation.isActive) continuation.resume(null) }
    }
}
