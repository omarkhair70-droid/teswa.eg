package com.teswa.mobile.feature.profile

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
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

interface ProfileImageRepository {
    suspend fun replace(
        session: AuthSession,
        kind: ProfileImageKind,
        asset: ProfileImageAsset,
        previousUrl: String?,
        onProgress: (Int) -> Unit = {},
    ): ProfileResult<ProfileImageMutation>

    suspend fun remove(
        session: AuthSession,
        kind: ProfileImageKind,
        currentUrl: String?,
    ): ProfileResult<ProfileImageMutation>
}

class OracleProfileImageRepository(
    authenticator: SessionAuthenticator,
    private val contentSource: ProfileImageContentSource,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val uploader: BinaryUploader = StreamingBinaryUploader(),
) : ProfileImageRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun replace(
        session: AuthSession,
        kind: ProfileImageKind,
        asset: ProfileImageAsset,
        previousUrl: String?,
        onProgress: (Int) -> Unit,
    ): ProfileResult<ProfileImageMutation> {
        asset.validate()?.let { return ProfileResult.Failure(it, session) }
        val media = ProfileMediaObject(
            objectKey = "profiles/${session.user.id}/${kind.pathSegment}/${UUID.randomUUID()}-${safeFileName(asset.displayName)}",
            contentType = asset.contentType.lowercase(),
            sizeBytes = asset.sizeBytes,
        )
        var active = session
        try {
            val grant = requestGrant(active, media)
            if (grant is ProfileResult.Failure) return grant
            grant as ProfileResult.Success
            active = grant.session

            val upload = uploader.upload(
                BinaryUploadRequest(
                    uploadUrl = grant.value,
                    contentType = media.contentType,
                    sizeBytes = media.sizeBytes,
                    openStream = { contentSource.open(asset) },
                    onProgress = { sent, total ->
                        onProgress(if (total <= 0L) 0 else ((sent * 100L) / total).toInt().coerceIn(0, 100))
                    },
                ),
            )
            if (upload is BinaryUploadResult.Failure) {
                val cleanup = cleanup(active, media.cleanupJson())
                return ProfileResult.Failure(
                    if (cleanup.second) "تعذر رفع الصورة. تأكد من الاتصال وحاول تاني."
                    else "تعذر رفع الصورة وتنظيف الملف المؤقت بأمان. حاول بعد شوية.",
                    cleanup.first,
                    network = upload.retryable,
                )
            }

            val completed = complete(active, media)
            if (completed is ProfileResult.Failure) {
                val cleanup = cleanup(completed.session ?: active, media.cleanupJson())
                return completed.copy(session = cleanup.first)
            }
            completed as ProfileResult.Success
            active = completed.session

            val saved = setImage(active, kind, completed.value)
            if (saved is ProfileResult.Failure) {
                val cleanup = cleanup(saved.session ?: active, media.cleanupJson())
                return saved.copy(session = cleanup.first)
            }
            saved as ProfileResult.Success
            active = saved.session

            val oldObject = ownedObjectFrom(previousUrl, session.user.id)
            val oldCleanup = oldObject?.let { cleanup(active, it) } ?: (active to true)
            val label = if (kind == ProfileImageKind.AVATAR) "صورة الملف" else "الغلاف"
            return ProfileResult.Success(
                ProfileImageMutation(
                    imageUrl = completed.value,
                    message = if (oldCleanup.second) "تم تحديث $label." else "تم تحديث $label، لكن تنظيف الصورة القديمة هيتعاد لاحقًا.",
                    cleanupComplete = oldCleanup.second,
                ),
                oldCleanup.first,
            )
        } catch (cancelled: CancellationException) {
            withContext(NonCancellable) { cleanup(active, media.cleanupJson()) }
            throw cancelled
        }
    }

    override suspend fun remove(
        session: AuthSession,
        kind: ProfileImageKind,
        currentUrl: String?,
    ): ProfileResult<ProfileImageMutation> {
        val saved = setImage(session, kind, null)
        if (saved is ProfileResult.Failure) return saved
        saved as ProfileResult.Success
        val oldObject = ownedObjectFrom(currentUrl, session.user.id)
        val cleanup = oldObject?.let { cleanup(saved.session, it) } ?: (saved.session to true)
        val label = if (kind == ProfileImageKind.AVATAR) "صورة الملف" else "الغلاف"
        return ProfileResult.Success(
            ProfileImageMutation(
                imageUrl = null,
                message = if (cleanup.second) "تم حذف $label." else "تم حذف $label من الملف، لكن تنظيف التخزين هيتعاد لاحقًا.",
                cleanupComplete = cleanup.second,
            ),
            cleanup.first,
        )
    }

    private suspend fun requestGrant(session: AuthSession, media: ProfileMediaObject): ProfileResult<String> =
        when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", media.uploadJson()))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> result.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                    ?.let { ProfileResult.Success(it, result.session) }
                    ?: ProfileResult.Failure("الخادم أعاد تصريح رفع غير صالح.", result.session)
                401 -> expired(result.session)
                else -> ProfileResult.Failure("تعذر تجهيز رفع الصورة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تجهيز رفع الصورة الآن.")
        }

    private suspend fun complete(session: AuthSession, media: ProfileMediaObject): ProfileResult<String> =
        when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", media.uploadJson()))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val key = result.value.body.optString("objectKey")
                    val url = result.value.body.optString("publicUrl")
                    if (key == media.objectKey && url.startsWith("https://") && url.contains(PROFILE_MARKER)) {
                        ProfileResult.Success(url, result.session)
                    } else ProfileResult.Failure("تعذر التحقق من الصورة المرفوعة.", result.session)
                }
                401 -> expired(result.session)
                else -> ProfileResult.Failure("تعذر تثبيت الصورة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر التحقق من الصورة المرفوعة الآن.")
        }

    private suspend fun setImage(session: AuthSession, kind: ProfileImageKind, imageUrl: String?): ProfileResult<Unit> {
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("kind", kind.apiValue)
            .put("imageUrl", imageUrl ?: JSONObject.NULL)
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/profiles/image", body))) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> ProfileResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                result.value.status == 404 -> ProfileResult.Failure("ملفك الشخصي مش موجود.", result.session)
                else -> ProfileResult.Failure("تعذر حفظ صورة الملف (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر حفظ صورة الملف الآن.")
        }
    }

    private suspend fun cleanup(session: AuthSession, objectJson: JSONObject): Pair<AuthSession, Boolean> {
        val body = JSONObject().put("objects", JSONArray().put(objectJson))
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.DELETE, "/v1/media/objects", body))) {
            is AuthenticatedOracleResult.Response -> result.session to (result.value.status == 200 && result.value.body.optInt("deleted") == 1)
            is AuthenticatedOracleResult.NetworkFailure -> (result.session ?: session) to false
            is AuthenticatedOracleResult.InvalidResponse -> (result.session ?: session) to false
            is AuthenticatedOracleResult.SessionFailure -> session to false
        }
    }

    private fun ownedObjectFrom(url: String?, userId: String): JSONObject? {
        val key = url?.substringAfter(PROFILE_MARKER, "")?.trim()?.takeIf(String::isNotEmpty) ?: return null
        if (userId !in key.split('/') || key.startsWith('/') || key.contains("\\") || key.split('/').any { it.isBlank() || it == "." || it == ".." }) return null
        return JSONObject().put("purpose", "profile_image").put("objectKey", key)
    }

    private fun safeFileName(value: String): String {
        val clean = value.trim().lowercase().replace(Regex("[^a-z0-9._-]"), "-").replace(Regex("-+"), "-")
        return clean.trim('-').takeIf(String::isNotBlank)?.take(80) ?: "profile-image.jpg"
    }

    private fun AuthenticatedOracleResult.failure(message: String): ProfileResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> ProfileResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> ProfileResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> ProfileResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses are mapped at the call site.")
    }

    private fun expired(session: AuthSession) = ProfileResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private companion object {
        const val PROFILE_MARKER = "#teswa-object=profile_image:"
    }
}

private data class ProfileMediaObject(
    val objectKey: String,
    val contentType: String,
    val sizeBytes: Long,
) {
    fun uploadJson() = JSONObject()
        .put("purpose", "profile_image")
        .put("objectKey", objectKey)
        .put("contentType", contentType)
        .put("sizeBytes", sizeBytes)

    fun cleanupJson() = JSONObject()
        .put("purpose", "profile_image")
        .put("objectKey", objectKey)
}
