package com.teswa.mobile.feature.voice

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.media.BinaryUploadRequest
import com.teswa.mobile.core.media.BinaryUploadResult
import com.teswa.mobile.core.media.BinaryUploader
import com.teswa.mobile.core.media.StreamingBinaryUploader
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray
import java.io.FileInputStream
import java.util.UUID

interface VoiceMediaRepository {
    suspend fun upload(
        session: AuthSession,
        purpose: String,
        objectPrefix: String,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit = {},
    ): VoiceMediaResult<UploadedVoice>

    suspend fun discard(session: AuthSession, purpose: String, voice: UploadedVoice): AuthSession

    suspend fun signedUrl(session: AuthSession, purpose: String, objectKey: String): VoiceMediaResult<String> =
        VoiceMediaResult.Failure("تشغيل التسجيل غير متاح الآن.", session)
}

class OracleVoiceMediaRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val uploader: BinaryUploader = StreamingBinaryUploader(),
) : VoiceMediaRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun upload(
        session: AuthSession,
        purpose: String,
        objectPrefix: String,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit,
    ): VoiceMediaResult<UploadedVoice> {
        draft.validate()?.let { return VoiceMediaResult.Failure(it, session) }
        if (purpose !in PURPOSES || !PREFIX.matches(objectPrefix)) {
            return VoiceMediaResult.Failure("مسار التسجيل غير صالح.", session)
        }
        val objectKey = "$objectPrefix/${UUID.randomUUID()}.m4a"
        val body = JSONObject()
            .put("purpose", purpose)
            .put("objectKey", objectKey)
            .put("contentType", draft.mimeType)
            .put("sizeBytes", draft.sizeBytes)
        var active = session
        var granted = false
        try {
            val grant = executor.execute(active, OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", body))
            val uploadUrl = when (grant) {
                is AuthenticatedOracleResult.Response -> {
                    active = grant.session
                    if (grant.value.status == 401) return expired(grant.session)
                    if (grant.value.status != 201) return VoiceMediaResult.Failure("تعذر تجهيز رفع التسجيل (${grant.value.status}).", grant.session)
                    grant.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                        ?: return VoiceMediaResult.Failure("الخادم أعاد تصريح رفع غير صالح.", grant.session)
                }
                else -> return grant.failure("تعذر تجهيز رفع التسجيل الآن.")
            }
            granted = true
            val upload = uploader.upload(
                BinaryUploadRequest(uploadUrl, draft.mimeType, draft.sizeBytes, { FileInputStream(draft.file) }) { sent, total ->
                    onProgress(if (total <= 0) 0 else ((sent * 100) / total).toInt().coerceIn(0, 100))
                },
            )
            if (upload is BinaryUploadResult.Failure) {
                active = cleanup(active, body)
                return VoiceMediaResult.Failure("تعذر رفع التسجيل. حاول تاني.", active, network = upload.retryable)
            }
            return when (val complete = executor.execute(active, OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", body))) {
                is AuthenticatedOracleResult.Response -> {
                    active = complete.session
                    if (complete.value.status == 401) {
                        cleanup(active, body)
                        expired(active)
                    } else if (complete.value.status != 200 || complete.value.body.optString("objectKey") != objectKey) {
                        active = cleanup(active, body)
                        VoiceMediaResult.Failure("تعذر تثبيت التسجيل.", active)
                    } else {
                        VoiceMediaResult.Success(UploadedVoice(objectKey, draft.durationMs, draft.mimeType, draft.sizeBytes), active)
                    }
                }
                else -> {
                    val failure = complete.failure("تعذر تثبيت التسجيل الآن.")
                    active = cleanup(failure.session ?: active, body)
                    failure.copy(session = active)
                }
            }
        } catch (cancelled: CancellationException) {
            if (granted) withContext(NonCancellable) { cleanup(active, body) }
            throw cancelled
        }
    }

    override suspend fun discard(session: AuthSession, purpose: String, voice: UploadedVoice): AuthSession = cleanup(
        session,
        JSONObject()
            .put("purpose", purpose)
            .put("objectKey", voice.objectKey)
            .put("contentType", voice.mimeType)
            .put("sizeBytes", voice.sizeBytes),
    )

    override suspend fun signedUrl(session: AuthSession, purpose: String, objectKey: String): VoiceMediaResult<String> {
        if (purpose !in PURPOSES || objectKey.isBlank()) return VoiceMediaResult.Failure("مسار التسجيل غير صالح.", session)
        val body = JSONObject()
            .put("purpose", purpose)
            .put("objectKey", objectKey)
            .put("contentType", JSONObject.NULL)
            .put("sizeBytes", JSONObject.NULL)
            .put("expiresInSeconds", 900)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/signed-url", body),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> result.value.body.optString("signedUrl").takeIf { it.startsWith("https://") }
                    ?.let { VoiceMediaResult.Success(it, result.session) }
                    ?: VoiceMediaResult.Failure("الخادم أعاد رابط تشغيل غير صالح.", result.session)
                401 -> expired(result.session)
                403, 404 -> VoiceMediaResult.Failure("التسجيل غير متاح.", result.session)
                else -> VoiceMediaResult.Failure("تعذر تشغيل التسجيل (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تشغيل التسجيل الآن.")
        }
    }

    private suspend fun cleanup(session: AuthSession, body: JSONObject): AuthSession =
        when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.DELETE, "/v1/media/objects", JSONObject().put("objects", JSONArray().put(body))),
        )) {
            is AuthenticatedOracleResult.Response -> result.session
            is AuthenticatedOracleResult.NetworkFailure -> result.session ?: session
            is AuthenticatedOracleResult.InvalidResponse -> result.session ?: session
            is AuthenticatedOracleResult.SessionFailure -> session
        }

    private fun AuthenticatedOracleResult.failure(message: String): VoiceMediaResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> VoiceMediaResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> VoiceMediaResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> VoiceMediaResult.Failure(failure.message, unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED)
        is AuthenticatedOracleResult.Response -> error("HTTP response must be handled.")
    }

    private fun expired(session: AuthSession) = VoiceMediaResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private companion object {
        val PURPOSES = setOf("deal_voice", "direct_voice", "contextual_voice")
        val PREFIX = Regex("^(deals|direct|contextual)/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}$")
    }
}
