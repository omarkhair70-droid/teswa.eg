package com.teswa.mobile.feature.additem

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
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.util.UUID

fun interface AddItemContentSource {
    fun open(image: AddItemImage): InputStream
}

interface AddItemRepository {
    suspend fun loadCategories(session: AuthSession): AddItemResult<List<AddItemCategory>>

    suspend fun publish(
        session: AuthSession,
        draft: AddItemDraft,
        onProgress: (AddItemPublishProgress) -> Unit,
    ): AddItemResult<PublishedItem>
}

class OracleAddItemRepository(
    authenticator: SessionAuthenticator,
    private val contentSource: AddItemContentSource,
    private val transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val binaryUploader: BinaryUploader = StreamingBinaryUploader(),
) : AddItemRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadCategories(session: AuthSession): AddItemResult<List<AddItemCategory>> {
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/marketplace/categories"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return AddItemResult.Failure("استجابة الفئات غير مكتملة.", result.session)
                    val categories = buildList {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            val id = row.optString("id").trim()
                            val name = row.optString("nameAr").trim()
                            if (id.isNotEmpty() && name.isNotEmpty()) add(AddItemCategory(id, name))
                        }
                    }
                    AddItemResult.Success(categories, result.session)
                }
                401 -> expired(result.session)
                else -> AddItemResult.Failure("تعذر تحميل الفئات (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل الفئات الآن.")
        }
    }

    override suspend fun publish(
        session: AuthSession,
        draft: AddItemDraft,
        onProgress: (AddItemPublishProgress) -> Unit,
    ): AddItemResult<PublishedItem> {
        draft.validate()?.let { return AddItemResult.Failure(it, session) }

        val itemId = UUID.randomUUID().toString()
        var activeSession = session
        val grantedObjects = mutableListOf<MediaObject>()
        val publicUrls = mutableListOf<String>()

        try {
            for ((index, image) in draft.images.withIndex()) {
            val media = MediaObject(
                purpose = "item_image",
                objectKey = "items/${session.user.id}/$itemId/${UUID.randomUUID()}-${safeFileName(image.displayName)}",
                contentType = image.contentType,
                sizeBytes = image.sizeBytes,
            )
            val grant = requestUploadGrant(activeSession, media)
            if (grant is AddItemResult.Failure) {
                cleanup(activeSession, grantedObjects)
                return grant
            }
            grant as AddItemResult.Success
            activeSession = grant.session
            grantedObjects += media

            val upload = binaryUploader.upload(
                BinaryUploadRequest(
                    uploadUrl = grant.value,
                    contentType = media.contentType,
                    sizeBytes = media.sizeBytes,
                    openStream = { contentSource.open(image) },
                    onProgress = { sent, total ->
                        val percent = if (total <= 0L) 0 else ((sent * 100L) / total).toInt().coerceIn(0, 100)
                        onProgress(AddItemPublishProgress.Uploading(index + 1, draft.images.size, percent))
                    },
                ),
            )
            if (upload is BinaryUploadResult.Failure) {
                val cleanup = cleanup(activeSession, grantedObjects)
                return AddItemResult.Failure(
                    message = if (cleanup.complete) {
                        "تعذر رفع الصورة ${index + 1}. تأكد من الاتصال وحاول تاني."
                    } else {
                        "تعذر رفع الصورة وتنظيف الملفات المؤقتة بأمان. حاول تاني بعد شوية."
                    },
                    session = cleanup.session,
                    network = upload.retryable,
                )
            }

            when (val complete = completeUpload(activeSession, media)) {
                is AddItemResult.Success -> {
                    activeSession = complete.session
                    publicUrls += complete.value
                }
                is AddItemResult.Failure -> {
                    val cleanup = cleanup(complete.session ?: activeSession, grantedObjects)
                    return complete.copy(
                        message = if (cleanup.complete) complete.message
                        else "اكتمل الرفع لكن تعذر التحقق أو التنظيف بأمان. حاول تاني بعد شوية.",
                        session = cleanup.session,
                    )
                }
            }
            }

            onProgress(AddItemPublishProgress.SavingListing)
            val listing = publishListing(activeSession, itemId, draft, publicUrls)
            if (listing is AddItemResult.Success) return listing

            listing as AddItemResult.Failure
            val cleanup = cleanup(listing.session ?: activeSession, grantedObjects)
            return listing.copy(
                message = if (cleanup.complete) listing.message
                else "تعذر نشر العنصر وتنظيف صوره بأمان. بياناتك ما زالت محفوظة للمحاولة لاحقًا.",
                session = cleanup.session,
            )
        } catch (cancelled: CancellationException) {
            withContext(NonCancellable) { cleanup(activeSession, grantedObjects) }
            throw cancelled
        }
    }

    private suspend fun requestUploadGrant(
        session: AuthSession,
        media: MediaObject,
    ): AddItemResult<String> {
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", media.toJson()),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> result.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                    ?.let { AddItemResult.Success(it, result.session) }
                    ?: AddItemResult.Failure("الخادم أعاد تصريح رفع غير صالح.", result.session)
                401 -> expired(result.session)
                409 -> AddItemResult.Failure("تعذر تجهيز اسم فريد للصورة. حاول تاني.", result.session)
                else -> AddItemResult.Failure("تعذر تجهيز رفع الصور (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تجهيز رفع الصور الآن.")
        }
    }

    private suspend fun completeUpload(
        session: AuthSession,
        media: MediaObject,
    ): AddItemResult<String> {
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", media.toJson()),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val objectKey = result.value.body.optString("objectKey")
                    val publicUrl = result.value.body.optString("publicUrl")
                    if (objectKey == media.objectKey && publicUrl.startsWith("https://")) {
                        AddItemResult.Success(publicUrl, result.session)
                    } else {
                        AddItemResult.Failure("تعذر التحقق من الصورة المرفوعة.", result.session)
                    }
                }
                401 -> expired(result.session)
                else -> AddItemResult.Failure("تعذر تثبيت الصورة المرفوعة (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر التحقق من الصورة المرفوعة الآن.")
        }
    }

    private suspend fun publishListing(
        session: AuthSession,
        itemId: String,
        draft: AddItemDraft,
        publicUrls: List<String>,
    ): AddItemResult<PublishedItem> {
        val images = JSONArray()
        publicUrls.forEachIndexed { index, url ->
            images.put(
                JSONObject()
                    .put("imageUrl", url)
                    .put("isPrimary", index == 0)
                    .put("sortOrder", index),
            )
        }
        val body = JSONObject()
            .put("itemId", itemId)
            .put("ownerId", session.user.id)
            .put("title", draft.title.trim())
            .putNullable("categoryId", draft.categoryId)
            .putNullable("description", draft.description.clean())
            .put("condition", draft.condition.apiValue)
            .putNullable("conditionNotes", draft.conditionNotes.clean())
            .putNullable("city", draft.city.clean())
            .putNullable("area", draft.area.clean())
            .put("locationLatitude", JSONObject.NULL)
            .put("locationLongitude", JSONObject.NULL)
            .put("desireMode", draft.desireMode.apiValue)
            .putNullable("desireText", draft.desireText.clean())
            .putNullable("itemStory", draft.itemStory.clean())
            .putNullable("swapReason", draft.swapReason.clean())
            .putNullable("goodFor", draft.goodFor.clean())
            .put("images", images)

        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/marketplace/items", body),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 201 && result.value.body.optString("itemId") == itemId ->
                    AddItemResult.Success(PublishedItem(itemId), result.session)
                result.value.status == 401 -> expired(result.session)
                else -> AddItemResult.Failure("تعذر نشر العنصر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر نشر العنصر الآن.")
        }
    }

    private suspend fun cleanup(session: AuthSession, objects: List<MediaObject>): CleanupResult {
        if (objects.isEmpty()) return CleanupResult(session, complete = true)
        val body = JSONObject().put("objects", JSONArray().apply { objects.forEach { put(it.toJson()) } })
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.DELETE, "/v1/media/objects", body),
        )) {
            is AuthenticatedOracleResult.Response -> CleanupResult(
                result.session,
                result.value.status == 200 && result.value.body.optInt("deleted") == objects.size,
            )
            is AuthenticatedOracleResult.NetworkFailure -> CleanupResult(result.session ?: session, false)
            is AuthenticatedOracleResult.InvalidResponse -> CleanupResult(result.session ?: session, false)
            is AuthenticatedOracleResult.SessionFailure -> CleanupResult(session, false)
        }
    }

    private fun AuthenticatedOracleResult.toFailure(message: String): AddItemResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> AddItemResult.Failure(
            message,
            session = session,
            network = true,
        )
        is AuthenticatedOracleResult.InvalidResponse -> AddItemResult.Failure(
            "الخادم أعاد استجابة غير صالحة.",
            session = session,
        )
        is AuthenticatedOracleResult.SessionFailure -> AddItemResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be mapped by the caller.")
    }

    private fun expired(session: AuthSession) = AddItemResult.Failure(
        "انتهت جلسة تِسوى.",
        session = session,
        unauthorized = true,
    )

    private fun safeFileName(value: String): String {
        val clean = value.trim().lowercase().replace(Regex("[^a-z0-9._-]"), "-").replace(Regex("-+"), "-")
        return clean.trim('-').takeIf { it.isNotBlank() }?.take(80) ?: "item-image.jpg"
    }

    private fun String.clean() = trim().takeIf { it.isNotEmpty() }

    private fun JSONObject.putNullable(key: String, value: String?): JSONObject {
        return put(key, value ?: JSONObject.NULL)
    }
}

private data class MediaObject(
    val purpose: String,
    val objectKey: String,
    val contentType: String,
    val sizeBytes: Long,
) {
    fun toJson() = JSONObject()
        .put("purpose", purpose)
        .put("objectKey", objectKey)
        .put("contentType", contentType)
        .put("sizeBytes", sizeBytes)
}

private data class CleanupResult(val session: AuthSession, val complete: Boolean)
