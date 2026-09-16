package com.teswa.mobile.feature.people

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import org.json.JSONObject

interface PeopleRepository {
    suspend fun load(
        session: AuthSession,
        query: String = "",
        page: Int = 1,
        pageSize: Int = 24,
    ): PeopleResult<PeoplePage>
}

class OraclePeopleRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : PeopleRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(
        session: AuthSession,
        query: String,
        page: Int,
        pageSize: Int,
    ): PeopleResult<PeoplePage> {
        val safeQuery = sanitizePeopleQuery(query)
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 40)
        val path = "/v1/people?query=${safeQuery.encoded()}&page=$safePage&pageSize=$safePageSize"
        return when (val result = executor.execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parsePage(result.value.body, result.session)
                401 -> PeopleResult.Failure("انتهت جلسة تِسوى.", result.session, unauthorized = true)
                else -> PeopleResult.Failure("تعذر تحميل ناس تِسوى (${result.value.status}).", result.session)
            }
            is AuthenticatedOracleResult.NetworkFailure -> PeopleResult.Failure(
                "تعذر تحميل ناس تِسوى الآن.",
                result.session,
                network = true,
            )
            is AuthenticatedOracleResult.InvalidResponse -> PeopleResult.Failure(
                "الخادم أعاد استجابة غير صالحة لناس تِسوى.",
                result.session,
            )
            is AuthenticatedOracleResult.SessionFailure -> PeopleResult.Failure(
                result.failure.message,
                unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
                network = result.failure.reason == AuthResult.Reason.NETWORK,
            )
        }
    }

    private fun parsePage(body: JSONObject, session: AuthSession): PeopleResult<PeoplePage> {
        val rows = body.optJSONArray("entries")
            ?: return PeopleResult.Failure("استجابة ناس تِسوى غير مكتملة.", session)
        if (!body.has("hasMore")) return PeopleResult.Failure("استجابة ناس تِسوى غير مكتملة.", session)
        val entries = buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val id = row.optString("id").trim()
                val displayName = row.optString("displayName").trim()
                val username = row.optString("username").trim()
                if (id.isBlank() || displayName.isBlank() || username.isBlank()) continue
                add(
                    PeopleEntry(
                        id = id,
                        displayName = displayName,
                        username = username,
                        avatarUrl = nullable(row, "avatarUrl"),
                        coverUrl = nullable(row, "coverUrl"),
                        profileTagline = nullable(row, "profileTagline"),
                        bio = nullable(row, "bio"),
                        city = nullable(row, "city"),
                        area = nullable(row, "area"),
                        successfulSwapsCount = row.optInt("successfulSwapsCount", 0).coerceAtLeast(0),
                        responseRate = row.optDouble("responseRate", Double.NaN).takeIf { it.isFinite() },
                        activeItemsCount = row.optInt("activeItemsCount", 0).coerceAtLeast(0),
                        createdAt = nullable(row, "createdAt"),
                    ),
                )
            }
        }
        return PeopleResult.Success(PeoplePage(entries, body.optBoolean("hasMore", false)), session)
    }

    private fun nullable(body: JSONObject, key: String): String? =
        if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)

    private fun String.encoded(): String = URLEncoder.encode(this, StandardCharsets.UTF_8.name())
}

internal fun sanitizePeopleQuery(raw: String): String = raw
    .trim()
    .take(80)
    .replace("%", "")
    .replace(Regex("[(),]"), " ")
    .replace(Regex("\\s+"), " ")
    .trim()
