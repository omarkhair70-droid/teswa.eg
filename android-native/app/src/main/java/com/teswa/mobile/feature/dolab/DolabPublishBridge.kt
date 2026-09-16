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

data class DolabPublishSource(
    val item: DolabItem,
    val media: List<DolabMedia>,
)

interface DolabPublishBridgeRepository {
    suspend fun loadSource(session: AuthSession, dolabItemId: String): DolabResult<DolabPublishSource>
    suspend fun markPublished(session: AuthSession, dolabItemId: String, publishedItemId: String): DolabResult<DolabItem>
}

class OracleDolabPublishBridgeRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : DolabPublishBridgeRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadSource(session: AuthSession, dolabItemId: String): DolabResult<DolabPublishSource> {
        val request = OracleRequest(path = "/v1/dolab/items/$dolabItemId/publish-source?userId=${session.user.id}")
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val item = parseItem(result.value.body.optJSONObject("item"))
                        ?: return DolabResult.Failure("الحاجة دي مش موجودة في دولابك.", result.session)
                    val rows = result.value.body.optJSONArray("media") ?: JSONArray()
                    val media = buildList {
                        for (index in 0 until rows.length()) parseMedia(rows.optJSONObject(index))?.let(::add)
                    }
                    DolabResult.Success(DolabPublishSource(item, media.sortedBy(DolabMedia::sortOrder)), result.session)
                }
                401 -> expired(result.session)
                404 -> DolabResult.Failure("الحاجة دي مش موجودة في دولابك.", result.session)
                else -> DolabResult.Failure("تعذر تجهيز الحاجة للنشر (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تجهيز الحاجة للنشر الآن.")
        }
    }

    override suspend fun markPublished(
        session: AuthSession,
        dolabItemId: String,
        publishedItemId: String,
    ): DolabResult<DolabItem> {
        val request = OracleRequest(
            OracleHttpMethod.POST,
            "/v1/dolab/items/$dolabItemId/published",
            JSONObject().put("userId", session.user.id).put("publishedItemId", publishedItemId),
        )
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseItem(result.value.body.optJSONObject("item"))?.let {
                    DolabResult.Success(it, result.session)
                } ?: DolabResult.Failure("تم النشر لكن استجابة ربط الدولاب غير مكتملة.", result.session)
                401 -> expired(result.session)
                404 -> DolabResult.Failure("تم النشر لكن الحاجة الأصلية مش موجودة في الدولاب.", result.session)
                else -> DolabResult.Failure("تم النشر لكن تعذر ربط الإعلان بالدولاب (${result.value.status}).", result.session)
            }
            else -> result.failure("تم النشر لكن تعذر تحديث الدولاب الآن.")
        }
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

    private fun JSONObject.string(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).trim().takeIf(String::isNotEmpty)

    private fun JSONObject.longOrNull(key: String): Long? =
        if (!has(key) || isNull(key)) null else optLong(key).takeIf { it >= 0L }

    private fun JSONObject.intOrNull(key: String): Int? =
        if (!has(key) || isNull(key)) null else optInt(key).takeIf { it >= 0 }
}
