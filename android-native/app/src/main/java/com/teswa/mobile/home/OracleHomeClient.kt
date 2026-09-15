package com.teswa.mobile.home

import com.teswa.mobile.BuildConfig
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class OracleHomeClient(
    private val baseUrl: String = BuildConfig.TESWA_API_BASE_URL.trimEnd('/'),
) {
    suspend fun fetchFeed(
        session: AuthSession,
        offset: Int = 0,
        limit: Int = 20,
    ): HomeFeedResult<HomeFeedPage> = withContext(Dispatchers.IO) {
        val safeOffset = offset.coerceAtLeast(0)
        val safeLimit = limit.coerceIn(1, 40)
        when (val response = request(
            path = "/v1/marketplace/feed?offset=$safeOffset&limit=$safeLimit",
            accessToken = session.accessToken,
        )) {
            is Transport.Failure -> HomeFeedResult.Failure(
                message = "تعذر تحميل العناصر الآن. جرّب مرة تانية.",
                network = true,
            )
            is Transport.Response -> when (response.status) {
                200 -> parsePage(response.body)
                401 -> HomeFeedResult.Failure(
                    message = "انتهت الجلسة أثناء تحميل الرئيسية.",
                    unauthorized = true,
                )
                else -> HomeFeedResult.Failure(
                    message = "تعذر تحميل الرئيسية (${response.status}).",
                )
            }
        }
    }

    suspend fun fetchDetail(
        session: AuthSession,
        itemId: String,
    ): HomeFeedResult<ItemDetail> = withContext(Dispatchers.IO) {
        val normalizedId = itemId.trim()
        if (!UUID_LIKE.matches(normalizedId)) {
            return@withContext HomeFeedResult.Failure("معرّف العنصر غير صالح.")
        }

        when (val response = request(
            path = "/v1/marketplace/items/$normalizedId/detail",
            accessToken = session.accessToken,
        )) {
            is Transport.Failure -> HomeFeedResult.Failure(
                message = "تعذر تحميل تفاصيل العنصر الآن.",
                network = true,
            )
            is Transport.Response -> when (response.status) {
                200 -> parseDetail(response.body)
                401 -> HomeFeedResult.Failure(
                    message = "انتهت الجلسة أثناء تحميل العنصر.",
                    unauthorized = true,
                )
                404 -> HomeFeedResult.Failure("العنصر مش موجود أو لم يعد متاحًا.")
                else -> HomeFeedResult.Failure("تعذر تحميل تفاصيل العنصر (${response.status}).")
            }
        }
    }

    private fun parsePage(body: JSONObject): HomeFeedResult<HomeFeedPage> {
        val rawItems = body.optJSONArray("items")
            ?: return HomeFeedResult.Failure("استجابة الرئيسية غير مكتملة.")
        if (!body.has("hasMore")) {
            return HomeFeedResult.Failure("استجابة الرئيسية غير مكتملة.")
        }

        val items = buildList {
            for (index in 0 until rawItems.length()) {
                val row = rawItems.optJSONObject(index) ?: continue
                val id = row.optString("id").trim()
                if (id.isBlank()) continue
                add(
                    HomeFeedItem(
                        id = id,
                        title = nullable(row, "title") ?: "عنصر بدون عنوان",
                        description = nullable(row, "description"),
                        coverImageUrl = nullable(row, "coverImageUrl"),
                        category = nullable(row, "category"),
                        condition = nullable(row, "condition"),
                        city = nullable(row, "city"),
                        ownerDisplayName = nullable(row, "ownerDisplayName"),
                        createdAt = nullable(row, "createdAt"),
                    ),
                )
            }
        }

        return HomeFeedResult.Success(
            HomeFeedPage(
                items = items,
                hasMore = body.optBoolean("hasMore", false),
            ),
        )
    }

    private fun parseDetail(body: JSONObject): HomeFeedResult<ItemDetail> {
        val id = body.optString("id").trim()
        if (id.isBlank()) return HomeFeedResult.Failure("استجابة تفاصيل العنصر غير مكتملة.")

        val images = buildList {
            val raw = body.optJSONArray("images")
            if (raw != null) {
                for (index in 0 until raw.length()) {
                    val row = raw.optJSONObject(index) ?: continue
                    nullable(row, "imageUrl")?.let(::add)
                }
            }
        }
        val owner = body.optJSONObject("ownerPresence")

        return HomeFeedResult.Success(
            ItemDetail(
                id = id,
                title = nullable(body, "title") ?: "عنصر بدون عنوان",
                description = nullable(body, "description"),
                condition = nullable(body, "condition"),
                conditionNotes = nullable(body, "conditionNotes"),
                category = nullable(body, "category"),
                city = nullable(body, "city"),
                area = nullable(body, "area"),
                images = images,
                ownerDisplayName = owner?.let { nullable(it, "displayName") },
                ownerUsername = owner?.let { nullable(it, "username") },
                desireText = nullable(body, "desireText"),
                itemStory = nullable(body, "itemStory"),
                swapReason = nullable(body, "swapReason"),
                goodFor = nullable(body, "goodFor"),
            ),
        )
    }

    private fun nullable(body: JSONObject, key: String): String? {
        if (!body.has(key) || body.isNull(key)) return null
        return body.optString(key).trim().takeIf { it.isNotEmpty() }
    }

    private fun request(path: String, accessToken: String): Transport {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8_000
                readTimeout = 12_000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $accessToken")
                setRequestProperty("User-Agent", "TeswaNative/${BuildConfig.VERSION_NAME} Android")
            }
            val status = connection.responseCode
            val stream = if (status in 200..399) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val body = runCatching {
                if (raw.isBlank()) JSONObject() else JSONObject(raw)
            }.getOrElse { JSONObject() }
            Transport.Response(status, body)
        } catch (error: IOException) {
            Transport.Failure(error)
        } finally {
            connection?.disconnect()
        }
    }

    private sealed interface Transport {
        data class Response(val status: Int, val body: JSONObject) : Transport
        data class Failure(val error: IOException) : Transport
    }

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
    }
}
