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
}
