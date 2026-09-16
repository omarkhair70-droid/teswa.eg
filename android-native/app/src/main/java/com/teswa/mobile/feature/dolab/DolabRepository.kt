package com.teswa.mobile.feature.dolab

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import org.json.JSONArray
import org.json.JSONObject

interface DolabRepository {
    suspend fun loadWorkspace(session: AuthSession): DolabResult<DolabWorkspace>
    suspend fun createItem(session: AuthSession, draft: DolabItemDraft): DolabResult<DolabItem>
    suspend fun updateItem(session: AuthSession, item: DolabItem, draft: DolabItemDraft): DolabResult<DolabItem>
    suspend fun deleteItem(session: AuthSession, itemId: String): DolabResult<Unit>
    suspend fun createNote(session: AuthSession, itemId: String, body: String): DolabResult<DolabNote>
    suspend fun deleteNote(session: AuthSession, noteId: String): DolabResult<Unit>
}

class OracleDolabRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
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
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("input", draft.toJson())
        return itemWrite(session, "/v1/dolab/items", body, expectedStatus = 201, fallback = "تعذر حفظ الحاجة في دولابك.")
    }

    override suspend fun updateItem(
        session: AuthSession,
        item: DolabItem,
        draft: DolabItemDraft,
    ): DolabResult<DolabItem> {
        if (!item.status.editable) return DolabResult.Failure("الحاجة دي خرجت من مرحلة التجهيز ومش هتتعدل من الدولاب.", session)
        validateEditableDraft(draft)?.let { return DolabResult.Failure(it, session) }
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("input", draft.toJson())
        return itemWrite(
            session,
            "/v1/dolab/items/${item.id}/update",
            body,
            expectedStatus = 200,
            fallback = "تعذر تحديث الحاجة.",
        )
    }

    override suspend fun deleteItem(session: AuthSession, itemId: String): DolabResult<Unit> {
        val request = OracleRequest(
            OracleHttpMethod.POST,
            "/v1/dolab/items/$itemId/delete",
            JSONObject().put("userId", session.user.id),
        )
        return unitWrite(session, request, "تعذر حذف الحاجة من الدولاب.")
    }

    override suspend fun createNote(session: AuthSession, itemId: String, body: String): DolabResult<DolabNote> {
        val clean = body.trim()
        if (clean.isEmpty() || clean.length > 8_000) {
            return DolabResult.Failure("الملاحظة لازم تكون من 1 إلى 8000 حرف.", session)
        }
        val request = OracleRequest(
            OracleHttpMethod.POST,
            "/v1/dolab/notes",
            JSONObject()
                .put("userId", session.user.id)
                .put("body", clean)
                .put("noteType", "text")
                .put("dolabItemId", itemId)
                .put("mediaId", JSONObject.NULL),
        )
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> parseNote(result.value.body.optJSONObject("note"))?.let { DolabResult.Success(it, result.session) }
                    ?: DolabResult.Failure("الخادم رجّع ملاحظة غير مكتملة.", result.session)
                401 -> expired(result.session)
                404 -> DolabResult.Failure("الحاجة دي مش موجودة في دولابك.", result.session)
                else -> DolabResult.Failure("تعذر إضافة الملاحظة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر إضافة الملاحظة الآن.")
        }
    }

    override suspend fun deleteNote(session: AuthSession, noteId: String): DolabResult<Unit> {
        val request = OracleRequest(
            OracleHttpMethod.POST,
            "/v1/dolab/notes/$noteId/delete",
            JSONObject().put("userId", session.user.id),
        )
        return unitWrite(session, request, "تعذر حذف الملاحظة.")
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
                    // The current Oracle Dolab compatibility API returns all three list routes under "items".
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
}
