package com.teswa.mobile.account

import com.teswa.mobile.BuildConfig
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class OracleAccountGateClient(
    private val baseUrl: String = BuildConfig.TESWA_API_BASE_URL.trimEnd('/'),
) {
    suspend fun fetchProfile(session: AuthSession): AccountGateResult<AccountProfile?> = withContext(Dispatchers.IO) {
        when (val response = request("GET", "/v1/profiles/me", session.accessToken)) {
            is Transport.Failure -> AccountGateResult.Failure("تعذر التحقق من بيانات الحساب الآن.", network = true)
            is Transport.Response -> when (response.status) {
                200 -> AccountGateResult.Success(mapProfile(response.body))
                401 -> AccountGateResult.Failure("انتهت جلسة تِسوى.", unauthorized = true)
                404 -> AccountGateResult.Success(null)
                else -> AccountGateResult.Failure("تعذر تحميل بيانات الحساب (${response.status}).")
            }
        }
    }

    suspend fun setupProfile(
        session: AuthSession,
        displayName: String,
        username: String,
    ): AccountGateResult<Unit> = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("displayName", displayName.trim())
            .put("username", username.trim().lowercase())
        when (val response = request("POST", "/v1/profiles/setup", session.accessToken, body)) {
            is Transport.Failure -> AccountGateResult.Failure("تعذر حفظ الملف الآن.", network = true)
            is Transport.Response -> when (response.status) {
                200 -> AccountGateResult.Success(Unit)
                401 -> AccountGateResult.Failure("انتهت جلسة تِسوى.", unauthorized = true)
                409 -> AccountGateResult.Failure("اسم المستخدم مستخدم بالفعل.")
                else -> AccountGateResult.Failure(response.body.optString("error", "تعذر حفظ الملف."))
            }
        }
    }

    suspend fun fetchPolicyAcceptances(
        session: AuthSession,
    ): AccountGateResult<List<PolicyAcceptance>> = withContext(Dispatchers.IO) {
        val encodedUserId = URLEncoder.encode(session.user.id, Charsets.UTF_8.name())
        val encodedKeys = URLEncoder.encode(RequiredPolicies.keys.joinToString(","), Charsets.UTF_8.name())
        val path = "/v1/policies/acceptances?userId=$encodedUserId&keys=$encodedKeys"
        when (val response = request("GET", path, session.accessToken)) {
            is Transport.Failure -> AccountGateResult.Failure("تعذر التحقق من موافقات السياسات الآن.", network = true)
            is Transport.Response -> when (response.status) {
                200 -> {
                    val items = response.body.optJSONArray("items") ?: JSONArray()
                    val mapped = buildList {
                        for (index in 0 until items.length()) {
                            val item = items.optJSONObject(index) ?: continue
                            val key = item.optString("policyKey")
                            val version = item.optString("policyVersion")
                            if (key.isNotBlank() && version.isNotBlank()) add(PolicyAcceptance(key, version))
                        }
                    }
                    AccountGateResult.Success(mapped)
                }
                401 -> AccountGateResult.Failure("انتهت جلسة تِسوى.", unauthorized = true)
                else -> AccountGateResult.Failure("تعذر التحقق من السياسات (${response.status}).")
            }
        }
    }

    suspend fun recordRequiredPolicies(session: AuthSession): AccountGateResult<Unit> = withContext(Dispatchers.IO) {
        val policies = JSONArray()
            .put(JSONObject().put("policyKey", RequiredPolicies.TERMS_KEY).put("policyVersion", RequiredPolicies.VERSION))
            .put(JSONObject().put("policyKey", RequiredPolicies.COMMUNITY_KEY).put("policyVersion", RequiredPolicies.VERSION))
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("policies", policies)

        when (val response = request("POST", "/v1/policies/acceptances", session.accessToken, body)) {
            is Transport.Failure -> AccountGateResult.Failure("تعذر حفظ موافقات السياسات الآن.", network = true)
            is Transport.Response -> when (response.status) {
                200 -> AccountGateResult.Success(Unit)
                401, 403 -> AccountGateResult.Failure("ليس لديك صلاحية لحفظ الموافقات الآن.", unauthorized = true)
                else -> AccountGateResult.Failure("تعذر حفظ موافقات السياسات (${response.status}).")
            }
        }
    }

    private fun mapProfile(body: JSONObject): AccountProfile? {
        val id = body.optString("id").takeIf { it.isNotBlank() } ?: return null
        return AccountProfile(
            id = id,
            displayName = nullable(body, "displayName"),
            username = nullable(body, "username"),
            city = nullable(body, "city"),
        )
    }

    private fun nullable(body: JSONObject, key: String): String? {
        if (!body.has(key) || body.isNull(key)) return null
        return body.optString(key).trim().takeIf { it.isNotEmpty() }
    }

    private fun request(
        method: String,
        path: String,
        accessToken: String,
        body: JSONObject? = null,
    ): Transport {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 8_000
                readTimeout = 12_000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $accessToken")
                setRequestProperty("User-Agent", "TeswaNative/${BuildConfig.VERSION_NAME} Android")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..399) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val parsed = runCatching { if (raw.isBlank()) JSONObject() else JSONObject(raw) }.getOrElse { JSONObject() }
            Transport.Response(status, parsed)
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
