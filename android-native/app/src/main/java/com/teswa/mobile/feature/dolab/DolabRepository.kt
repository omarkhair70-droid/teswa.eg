package com.teswa.mobile.feature.dolab

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

interface DolabRepository {
    suspend fun loadWorkspace(session: AuthSession): DolabResult<DolabWorkspace>
    suspend fun createItem(session: AuthSession, draft: DolabItemDraft): DolabResult<DolabItem>
    suspend fun updateItem(session: AuthSession, item: DolabItem, draft: DolabItemDraft): DolabResult<DolabItem>
    suspend fun deleteItem(session: AuthSession, itemId: String): DolabResult<Unit>
    suspend fun createNote(
        session: AuthSession,
        itemId: String?,
        body: String,
        noteType: String = "text",
        mediaId: String? = null,
    ): DolabResult<DolabNote>
    suspend fun deleteNote(session: AuthSession, noteId: String): DolabResult<Unit>
    suspend fun uploadMedia(
        session: AuthSession,
        itemId: String?,
        media: DolabPendingMedia,
        sortOrder: Int,
        onProgress: (Int) -> Unit,
    ): DolabResult<DolabMedia> = DolabResult.Failure("رفع الميديا غير متاح في الـrepository ده.", session)

    suspend fun deleteMedia(session: AuthSession, media: DolabMedia): DolabResult<Unit> =
        DolabResult.Failure("حذف الميديا غير متاح في الـrepository ده.", session)

    suspend fun signedMediaUrl(session: AuthSession, media: DolabMedia): DolabResult<String> =
        DolabResult.Failure("عرض الميديا غير متاح في الـrepository ده.", session)
}

class OracleDolabRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val binaryUploader: BinaryUploader = StreamingBinaryUploader(),
) : DolabRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadWorkspace(session: AuthSession): DolabResult<DolabWorkspace> {
        var current = session
        val items = when (val result = loadRows(current, "/v1/dolab/items", ::parseItem)) {
            is DolabResult.Success -> { current = result.session; result.value }
            is DolabResult.Failure -> return result
        }
        val media = when (val result = loadRows(current, "/v1/dolab/media", ::parseMedia)) {
            is DolabResult.Success -> { current = result.session; result.value }
            is DolabResult.Failure -> return result
        }
        val notes = when (val result = loadRows(current, "/v1/dolab/notes", ::parseNote)) {
            is DolabResult.Success -> { current = result.session; result.value }
            is DolabResult.Failure -> return result
        }
        return DolabResult.Success(DolabWorkspace(items, media, notes), current)
    }

    override suspend fun createItem(session: AuthSession, draft: DolabItemDraft): DolabResult<DolabItem> {
        validateEditableDraft(draft)?.let { return DolabResult.Failure(it, session) }
        val body = JSONObject().put("userId", session.user.id).put("input", draft.toJson())
        return itemWrite(session, "/v1/dolab/items", body, 201, "تعذر حفظ الحاجة في دولابك.")
    }

    override suspend fun updateItem(session: AuthSession, item: DolabItem, draft: DolabItemDraft): DolabResult<DolabItem> {
        if (!item.status.editable) return DolabResult.Failure("الحاجة دي خرجت من مرحلة التجهيز ومش هتتعدل من الدولاب.", session)
        validateEditableDraft(draft)?.let { return DolabResult.Failure(it, session) }
        val body = JSONObject().put("userId", session.user.id).put("input", draft.toJson())
        return itemWrite(session, "/v1/dolab/items/${item.id}/update", body, 200, "تعذر تحديث الحاجة.")
    }

    override suspend fun deleteItem(session: AuthSession, itemId: String): DolabResult<Unit> =
        unitWrite(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/dolab/items/$itemId/delete", JSONObject().put("userId", session.user.id)),
            "تعذر حذف الحاجة من الدولاب.",
        )

    override suspend fun createNote(
        session: AuthSession,
        itemId: String?,
        body: String,
        noteType: String,
        mediaId: String?,
    ): DolabResult<DolabNote> {
        val clean = body.trim()
        if (clean.isEmpty() || clean.length > 8_000) return DolabResult.Failure("الملاحظة لازم تكون من 1 إلى 8000 حرف.", session)
        if (noteType !in setOf("text", "voice", "idea", "checklist")) {
            return DolabResult.Failure("نوع الملاحظة غير مدعوم.", session)
        }
        val request = OracleRequest(
            OracleHttpMethod.POST,
            "/v1/dolab/notes",
            JSONObject()
                .put("userId", session.user.id)
                .put("body", clean)
                .put("noteType", noteType)
                .put("dolabItemId", itemId ?: JSONObject.NULL)
                .put("mediaId", mediaId ?: JSONObject.NULL),
        )
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> parseNote(result.value.body.optJSONObject("note"))?.let { DolabResult.Success(it, result.session) }
                    ?: DolabResult.Failure("الخادم رجّع ملاحظة غير مكتملة.", result.session)
                401 -> expired(result.session)
                404 -> DolabResult.Failure("الحاجة أو الميديا المرتبطة بالملاحظة مش موجودة في دولابك.", result.session)
                else -> DolabResult.Failure("تعذر إضافة الملاحظة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر إضافة الملاحظة الآن.")
        }
    }

    override suspend fun deleteNote(session: AuthSession, noteId: String): DolabResult<Unit> =
        unitWrite(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/dolab/notes/$noteId/delete", JSONObject().put("userId", session.user.id)),
            "تعذر حذف الملاحظة.",
        )

    override suspend fun uploadMedia(
        session: AuthSession,
        itemId: String?,
        media: DolabPendingMedia,
        sortOrder: Int,
        onProgress: (Int) -> Unit,
    ): DolabResult<DolabMedia> {
        media.validate()?.let { return DolabResult.Failure(it, session) }
        val objectRef = DolabMediaObject(
            purpose = "dolab_media",
            objectKey = "${session.user.id}/${itemId ?: "loose"}/${UUID.randomUUID()}-${safeFileName(media.displayName)}",
            contentType = media.mimeType,
            sizeBytes = media.sizeBytes,
        )
        var activeSession = session
        try {
            val grant = requestUploadGrant(activeSession, objectRef)
            if (grant is DolabResult.Failure) return grant
            grant as DolabResult.Success
            activeSession = grant.session

            when (val uploaded = binaryUploader.upload(
                BinaryUploadRequest(
                    uploadUrl = grant.value,
                    contentType = objectRef.contentType,
                    sizeBytes = objectRef.sizeBytes,
                    openStream = media.openStream,
                    onProgress = { sent, total ->
                        onProgress(if (total <= 0L) 0 else ((sent * 100L) / total).toInt().coerceIn(0, 100))
                    },
                ),
            )) {
                BinaryUploadResult.Success -> Unit
                is BinaryUploadResult.Failure -> {
                    cleanupObject(activeSession, objectRef)
                    return DolabResult.Failure(
                        "تعذر رفع الميديا. تأكد من الاتصال وحاول تاني.",
                        activeSession,
                        network = uploaded.retryable,
                    )
                }
            }

            when (val complete = completeUpload(activeSession, objectRef)) {
                is DolabResult.Success -> activeSession = complete.session
                is DolabResult.Failure -> {
                    cleanupObject(complete.session ?: activeSession, objectRef)
                    return complete
                }
            }

            val row = createMediaRow(activeSession, itemId, media, objectRef.objectKey, sortOrder)
            if (row is DolabResult.Success) return row
            row as DolabResult.Failure
            cleanupObject(row.session ?: activeSession, objectRef)
            return row
        } catch (cancelled: CancellationException) {
            withContext(NonCancellable) { cleanupObject(activeSession, objectRef) }
            throw cancelled
        }
    }

    override suspend fun deleteMedia(session: AuthSession, media: DolabMedia): DolabResult<Unit> {
        val deleteRow = unitWrite(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/dolab/media/${media.id}/delete",
                JSONObject().put("userId", session.user.id),
            ),
            "تعذر حذف الميديا من الدولاب.",
        )
        if (deleteRow is DolabResult.Failure) return deleteRow
        deleteRow as DolabResult.Success
        val cleanup = cleanupObject(
            deleteRow.session,
            DolabMediaObject(
                purpose = "dolab_media",
                objectKey = media.storagePath,
                contentType = media.mimeType ?: "application/octet-stream",
                sizeBytes = media.sizeBytes ?: 1L,
            ),
        )
        return if (cleanup.complete) {
            DolabResult.Success(Unit, cleanup.session)
        } else {
            DolabResult.Failure(
                "اتحذف سجل الميديا، لكن تنظيف ملف التخزين السحابي اتعطل.",
                cleanup.session,
            )
        }
    }

    override suspend fun signedMediaUrl(session: AuthSession, media: DolabMedia): DolabResult<String> {
        val body = DolabMediaObject(
            purpose = "dolab_media",
            objectKey = media.storagePath,
            contentType = media.mimeType ?: "application/octet-stream",
            sizeBytes = media.sizeBytes ?: 1L,
        ).toJson().put("expiresInSeconds", 3600)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/signed-url", body),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> result.value.body.optString("signedUrl").takeIf { it.startsWith("https://") }
                    ?.let { DolabResult.Success(it, result.session) }
                    ?: DolabResult.Failure("تعذر فتح الميديا.", result.session)
                401 -> expired(result.session)
                404 -> DolabResult.Failure("ملف الميديا مش موجود.", result.session)
                else -> DolabResult.Failure("تعذر فتح الميديا (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر فتح الميديا الآن.")
        }
    }

    private suspend fun requestUploadGrant(session: AuthSession, media: DolabMediaObject): DolabResult<String> =
        when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", media.toJson()),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> result.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                    ?.let { DolabResult.Success(it, result.session) }
                    ?: DolabResult.Failure("الخادم أعاد تصريح رفع غير صالح.", result.session)
                401 -> expired(result.session)
                409 -> DolabResult.Failure("تعذر تجهيز اسم فريد للملف. حاول تاني.", result.session)
                else -> DolabResult.Failure("تعذر تجهيز رفع الميديا (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تجهيز رفع الميديا الآن.")
        }

    private suspend fun completeUpload(session: AuthSession, media: DolabMediaObject): DolabResult<Unit> =
        when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", media.toJson()),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optString("objectKey") == media.objectKey ->
                    DolabResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> DolabResult.Failure("تعذر تثبيت الميديا المرفوعة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر التحقق من الميديا المرفوعة الآن.")
        }

    private suspend fun createMediaRow(
        session: AuthSession,
        itemId: String?,
        media: DolabPendingMedia,
        storagePath: String,
        sortOrder: Int,
    ): DolabResult<DolabMedia> {
        val input = JSONObject()
            .put("dolabItemId", itemId ?: JSONObject.NULL)
            .put("mediaType", media.mediaType)
            .put("storagePath", storagePath)
            .put("durationMs", media.durationMs ?: JSONObject.NULL)
            .put("width", media.width ?: JSONObject.NULL)
            .put("height", media.height ?: JSONObject.NULL)
            .put("mimeType", media.mimeType)
            .put("sizeBytes", media.sizeBytes)
            .put("sortOrder", sortOrder.coerceAtLeast(0))
        return when (val result = executor.execute(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/dolab/media",
                JSONObject().put("userId", session.user.id).put("input", input),
            ),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> parseMedia(result.value.body.optJSONObject("media"))?.let { DolabResult.Success(it, result.session) }
                    ?: DolabResult.Failure("الخادم رجّع ميديا غير مكتملة.", result.session)
                401 -> expired(result.session)
                404 -> DolabResult.Failure("الحاجة دي مش موجودة في دولابك.", result.session)
                else -> DolabResult.Failure("تعذر ربط الميديا بالدولاب (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر ربط الميديا بالدولاب الآن.")
        }
    }

    private suspend fun cleanupObject(session: AuthSession, media: DolabMediaObject): DolabCleanupResult {
        val body = JSONObject().put("objects", JSONArray().put(media.toJson()))
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.DELETE, "/v1/media/objects", body),
        )) {
            is AuthenticatedOracleResult.Response -> DolabCleanupResult(
                result.session,
                result.value.status == 200 && result.value.body.optInt("deleted") == 1,
            )
            is AuthenticatedOracleResult.NetworkFailure -> DolabCleanupResult(result.session ?: session, false)
            is AuthenticatedOracleResult.InvalidResponse -> DolabCleanupResult(result.session ?: session, false)
            is AuthenticatedOracleResult.SessionFailure -> DolabCleanupResult(session, false)
        }
    }

    private suspend fun itemWrite(
        session: AuthSession,
        path: String,
        body: JSONObject,
        expectedStatus: Int,
        fallback: String,
    ): DolabResult<DolabItem> = when (
        val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, path, body))
    ) {
        is AuthenticatedOracleResult.Response -> when (result.value.status) {
            expectedStatus -> parseItem(result.value.body.optJSONObject("item"))?.let {
                DolabResult.Success(it, result.session)
            } ?: DolabResult.Failure("الخادم رجّع بيانات دولاب غير مكتملة.", result.session)
            401 -> expired(result.session)
            404 -> DolabResult.Failure("الحاجة دي مش موجودة في دولابك.", result.session)
            else -> DolabResult.Failure("$fallback (${result.value.status})", result.session)
        }
        else -> result.failure("$fallback حاول تاني.")
    }

    private suspend fun unitWrite(
        session: AuthSession,
        request: OracleRequest,
        fallback: String,
    ): DolabResult<Unit> = when (val result = executor.execute(session, request)) {
        is AuthenticatedOracleResult.Response -> when {
            result.value.status == 401 -> expired(result.session)
            result.value.status == 200 && result.value.body.optBoolean("ok", false) -> DolabResult.Success(Unit, result.session)
            else -> DolabResult.Failure("$fallback (${result.value.status})", result.session)
        }
        else -> result.failure("$fallback حاول تاني.")
    }

    private suspend fun <T> loadRows(
        session: AuthSession,
        path: String,
        parser: (JSONObject?) -> T?,
    ): DolabResult<List<T>> {
        val request = OracleRequest(path = "$path?userId=${session.user.id}")
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val rows = result.value.body.optJSONArray("items")
                        ?: return DolabResult.Failure("استجابة الدولاب غير مكتملة.", result.session)
                    DolabResult.Success(rows.mapObjects(parser), result.session)
                }
                401 -> expired(result.session)
                else -> DolabResult.Failure("تعذر تحميل الدولاب (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل دولابك الآن.")
        }
    }

    private fun DolabItemDraft.toJson(): JSONObject = JSONObject()
        .putNullable("title", title.cleanOrNull())
        .putNullable("description", description.cleanOrNull())
        .putNullable("category", category.cleanOrNull())
        .putNullable("condition", condition.cleanOrNull())
        .putNullable("exchangeIntent", exchangeIntent.cleanOrNull())
        .put("status", status.wire)
        .put("source", source)

    private fun validateEditableDraft(draft: DolabItemDraft): String? {
        if (!draft.status.editable) return "حالة التجهيز لازم تكون مسودة أو جاهزة."
        if (draft.title.length > 160) return "اسم الحاجة طويل زيادة."
        if (draft.description.length > 4_000) return "الوصف طويل زيادة."
        if (draft.category.length > 120 || draft.condition.length > 120) return "بيانات الحاجة طويلة زيادة."
        if (draft.exchangeIntent.length > 1_000) return "فكرة التبديل طويلة زيادة."
        if (draft.title.isBlank() && draft.description.isBlank()) return "اكتب اسم الحاجة أو ملاحظة عنها على الأقل."
        return null
    }

    private fun parseItem(row: JSONObject?): DolabItem? {
        row ?: return null
        val id = row.string("id") ?: return null
        return DolabItem(
            id = id,
            title = row.string("title"),
            description = row.string("description"),
            category = row.string("category"),
            condition = row.string("condition"),
            exchangeIntent = row.string("exchange_intent"),
            status = DolabItemStatus.fromWire(row.optString("status")),
            source = row.optString("source").ifBlank { "manual" },
            publishedItemId = row.string("published_item_id"),
            createdAt = row.string("created_at"),
            updatedAt = row.string("updated_at"),
        )
    }

    private fun parseMedia(row: JSONObject?): DolabMedia? {
        row ?: return null
        val id = row.string("id") ?: return null
        val storagePath = row.string("storage_path") ?: return null
        return DolabMedia(
            id = id,
            dolabItemId = row.string("dolab_item_id"),
            mediaType = row.optString("media_type").ifBlank { "image" },
            storagePath = storagePath,
            thumbnailPath = row.string("thumbnail_path"),
            durationMs = row.longOrNull("duration_ms"),
            width = row.intOrNull("width"),
            height = row.intOrNull("height"),
            mimeType = row.string("mime_type"),
            sizeBytes = row.longOrNull("size_bytes"),
            sortOrder = row.optInt("sort_order", 0).coerceAtLeast(0),
            createdAt = row.string("created_at"),
        )
    }

    private fun parseNote(row: JSONObject?): DolabNote? {
        row ?: return null
        val id = row.string("id") ?: return null
        return DolabNote(
            id = id,
            body = row.string("body"),
            noteType = row.optString("note_type").ifBlank { "text" },
            dolabItemId = row.string("dolab_item_id"),
            mediaId = row.string("media_id"),
            sharedToConversationId = row.string("shared_to_conversation_id"),
            createdAt = row.string("created_at"),
        )
    }

    private fun AuthenticatedOracleResult.failure(message: String): DolabResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> DolabResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> DolabResult.Failure("الخادم أعاد استجابة غير صالحة للدولاب.", session)
        is AuthenticatedOracleResult.SessionFailure -> DolabResult.Failure(
            failure.message,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            network = failure.reason == AuthResult.Reason.NETWORK,
        )
        is AuthenticatedOracleResult.Response -> DolabResult.Failure(message, session)
    }

    private fun expired(session: AuthSession): DolabResult.Failure =
        DolabResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private fun <T> JSONArray.mapObjects(parser: (JSONObject?) -> T?): List<T> = buildList {
        for (index in 0 until length()) parser(optJSONObject(index))?.let(::add)
    }

    private fun JSONObject.string(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).trim().takeIf(String::isNotEmpty)

    private fun JSONObject.longOrNull(key: String): Long? =
        if (!has(key) || isNull(key)) null else optLong(key).takeIf { it >= 0L }

    private fun JSONObject.intOrNull(key: String): Int? =
        if (!has(key) || isNull(key)) null else optInt(key).takeIf { it >= 0 }

    private fun JSONObject.putNullable(key: String, value: String?): JSONObject = put(key, value ?: JSONObject.NULL)

    private fun String.cleanOrNull(): String? = trim().takeIf(String::isNotEmpty)

    private fun safeFileName(value: String): String {
        val clean = value.trim().lowercase().replace(Regex("[^a-z0-9._-]"), "-").replace(Regex("-+"), "-")
        return clean.trim('-').takeIf { it.isNotBlank() }?.take(80) ?: "dolab-media.bin"
    }
}

private data class DolabMediaObject(
    val purpose: String,
    val objectKey: String,
    val contentType: String,
    val sizeBytes: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("purpose", purpose)
        .put("objectKey", objectKey)
        .put("contentType", contentType)
        .put("sizeBytes", sizeBytes)
}

private data class DolabCleanupResult(val session: AuthSession, val complete: Boolean)
