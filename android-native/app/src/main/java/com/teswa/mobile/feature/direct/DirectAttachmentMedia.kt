package com.teswa.mobile.feature.direct

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
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
import java.io.FileNotFoundException
import java.io.InputStream
import java.util.UUID

data class DirectPendingAttachment(
    val uri: String,
    val displayName: String,
    val kind: String,
    val mimeType: String,
    val sizeBytes: Long,
    val openStream: () -> InputStream,
) {
    fun validate(): String? = when {
        kind !in setOf("image", "video", "file") -> "نوع المرفق غير مدعوم."
        sizeBytes <= 0L -> "تعذر قراءة حجم المرفق."
        sizeBytes > MAX_BYTES -> "المرفق أكبر من 50 ميجابايت."
        displayName.isBlank() -> "اسم المرفق غير صالح."
        else -> null
    }

    companion object {
        const val MAX_BYTES = 50L * 1024L * 1024L
    }
}

sealed interface DirectMediaResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : DirectMediaResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : DirectMediaResult<Nothing>
}

interface DirectAttachmentMediaRepository {
    suspend fun upload(
        session: AuthSession,
        conversationId: String,
        pending: DirectPendingAttachment,
        onProgress: (Int) -> Unit = {},
    ): DirectMediaResult<DirectAttachment>

    suspend fun signedUrl(
        session: AuthSession,
        attachment: DirectAttachment,
    ): DirectMediaResult<String>

    suspend fun discard(
        session: AuthSession,
        attachment: DirectAttachment,
    ): AuthSession

    suspend fun discardPaths(
        session: AuthSession,
        paths: List<String>,
    ): AuthSession
}

class AndroidDirectAttachmentResolver(
    private val resolver: ContentResolver,
) {
    fun resolve(uri: Uri): DirectPendingAttachment? {
        var displayName = "attachment"
        var sizeBytes = -1L
        resolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
            null,
            null,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    .takeIf { it >= 0 }
                    ?.let { column ->
                        displayName = cursor.getString(column)?.takeIf(String::isNotBlank) ?: displayName
                    }
                cursor.getColumnIndex(OpenableColumns.SIZE)
                    .takeIf { it >= 0 }
                    ?.let { column ->
                        if (!cursor.isNull(column)) sizeBytes = cursor.getLong(column)
                    }
            }
        }

        if (sizeBytes <= 0L) {
            sizeBytes = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        }
        if (sizeBytes <= 0L || sizeBytes > DirectPendingAttachment.MAX_BYTES) return null

        val mime = resolver.getType(uri)?.lowercase()?.takeIf { '/' in it } ?: "application/octet-stream"
        val kind = when {
            mime.startsWith("image/") -> "image"
            mime.startsWith("video/") -> "video"
            else -> "file"
        }

        return DirectPendingAttachment(
            uri = uri.toString(),
            displayName = displayName.take(180),
            kind = kind,
            mimeType = mime,
            sizeBytes = sizeBytes,
            openStream = {
                resolver.openInputStream(uri)
                    ?: throw FileNotFoundException("The selected Direct attachment is no longer available.")
            },
        )
    }
}

class OracleDirectAttachmentMediaRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val uploader: BinaryUploader = StreamingBinaryUploader(),
) : DirectAttachmentMediaRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun upload(
        session: AuthSession,
        conversationId: String,
        pending: DirectPendingAttachment,
        onProgress: (Int) -> Unit,
    ): DirectMediaResult<DirectAttachment> {
        pending.validate()?.let { return DirectMediaResult.Failure(it, session) }
        val conversation = conversationId.validId()
            ?: return DirectMediaResult.Failure("المحادثة غير صالحة.", session)
        val objectKey = "direct/$conversation/${session.user.id}/${UUID.randomUUID()}-${safeName(pending.displayName)}"
        val body = mediaBody(objectKey, pending.mimeType, pending.sizeBytes)
        var active = session
        var granted = false

        try {
            val grant = executor.execute(active, OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", body))
            val uploadUrl = when (grant) {
                is AuthenticatedOracleResult.Response -> {
                    active = grant.session
                    if (grant.value.status == 401) return expired(grant.session)
                    if (grant.value.status != 201) {
                        return DirectMediaResult.Failure("تعذر تجهيز رفع المرفق (${grant.value.status}).", grant.session)
                    }
                    grant.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                        ?: return DirectMediaResult.Failure("الخادم أعاد تصريح رفع غير صالح.", grant.session)
                }
                else -> return grant.failure("تعذر تجهيز رفع المرفق الآن.")
            }

            granted = true
            val upload = uploader.upload(
                BinaryUploadRequest(
                    uploadUrl = uploadUrl,
                    contentType = pending.mimeType,
                    sizeBytes = pending.sizeBytes,
                    openStream = pending.openStream,
                    onProgress = { sent, total ->
                        onProgress(if (total <= 0) 0 else ((sent * 100) / total).toInt().coerceIn(0, 100))
                    },
                ),
            )
            if (upload is BinaryUploadResult.Failure) {
                active = cleanup(active, listOf(objectKey))
                return DirectMediaResult.Failure(
                    "تعذر رفع المرفق. حاول تاني.",
                    active,
                    network = upload.retryable,
                )
            }

            return when (
                val complete = executor.execute(
                    active,
                    OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", body),
                )
            ) {
                is AuthenticatedOracleResult.Response -> {
                    active = complete.session
                    if (
                        complete.value.status != 200 ||
                        complete.value.body.optString("objectKey") != objectKey
                    ) {
                        active = cleanup(active, listOf(objectKey))
                        DirectMediaResult.Failure("تعذر تثبيت المرفق.", active)
                    } else {
                        DirectMediaResult.Success(
                            DirectAttachment(
                                id = null,
                                kind = pending.kind,
                                storagePath = objectKey,
                                storageBucket = "direct-chat-media",
                                fileName = pending.displayName,
                                mimeType = pending.mimeType,
                                sizeBytes = pending.sizeBytes,
                                durationMs = null,
                                width = null,
                                height = null,
                            ),
                            active,
                        )
                    }
                }
                else -> {
                    val failure = complete.failure("تعذر تثبيت المرفق الآن.")
                    active = cleanup(failure.session ?: active, listOf(objectKey))
                    failure.copy(session = active)
                }
            }
        } catch (cancelled: CancellationException) {
            if (granted) withContext(NonCancellable) { cleanup(active, listOf(objectKey)) }
            throw cancelled
        }
    }

    override suspend fun signedUrl(
        session: AuthSession,
        attachment: DirectAttachment,
    ): DirectMediaResult<String> {
        if (attachment.storageBucket != null && attachment.storageBucket != "direct-chat-media") {
            return DirectMediaResult.Failure("نوع المرفق غير مدعوم هنا.", session)
        }
        val body = mediaBody(attachment.storagePath, null, null)
            .put("expiresInSeconds", 900)
        return when (
            val result = executor.execute(
                session,
                OracleRequest(OracleHttpMethod.POST, "/v1/media/signed-url", body),
            )
        ) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> result.value.body.optString("signedUrl")
                    .takeIf { it.startsWith("https://") }
                    ?.let { DirectMediaResult.Success(it, result.session) }
                    ?: DirectMediaResult.Failure("الخادم أعاد رابط مرفق غير صالح.", result.session)
                401 -> expired(result.session)
                403, 404 -> DirectMediaResult.Failure("المرفق غير متاح.", result.session)
                else -> DirectMediaResult.Failure("تعذر فتح المرفق (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر فتح المرفق الآن.")
        }
    }

    override suspend fun discard(
        session: AuthSession,
        attachment: DirectAttachment,
    ): AuthSession = cleanup(session, listOf(attachment.storagePath))

    override suspend fun discardPaths(
        session: AuthSession,
        paths: List<String>,
    ): AuthSession = cleanup(session, paths)

    private suspend fun cleanup(session: AuthSession, paths: List<String>): AuthSession {
        val clean = paths.distinct().filter { it.isNotBlank() }.take(20)
        if (clean.isEmpty()) return session
        val objects = JSONArray()
        clean.forEach { objects.put(mediaBody(it, null, null)) }
        return when (
            val result = executor.execute(
                session,
                OracleRequest(
                    OracleHttpMethod.DELETE,
                    "/v1/media/objects",
                    JSONObject().put("objects", objects),
                ),
            )
        ) {
            is AuthenticatedOracleResult.Response -> result.session
            is AuthenticatedOracleResult.NetworkFailure -> result.session ?: session
            is AuthenticatedOracleResult.InvalidResponse -> result.session ?: session
            is AuthenticatedOracleResult.SessionFailure -> session
        }
    }

    private fun mediaBody(objectKey: String, contentType: String?, sizeBytes: Long?) =
        JSONObject()
            .put("purpose", "direct_chat_media")
            .put("objectKey", objectKey)
            .put("contentType", contentType ?: JSONObject.NULL)
            .put("sizeBytes", sizeBytes ?: JSONObject.NULL)

    private fun AuthenticatedOracleResult.failure(message: String): DirectMediaResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure ->
            DirectMediaResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse ->
            DirectMediaResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure ->
            DirectMediaResult.Failure(
                failure.message,
                unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            )
        is AuthenticatedOracleResult.Response -> error("HTTP response must be handled.")
    }

    private fun expired(session: AuthSession) =
        DirectMediaResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private fun safeName(value: String): String =
        value.trim()
            .replace(Regex("[^A-Za-z0-9._-]+"), "-")
            .trim('-')
            .take(120)
            .ifBlank { "attachment" }

    private fun String.validId() = trim().takeIf(UUID_LIKE::matches)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
    }
}
