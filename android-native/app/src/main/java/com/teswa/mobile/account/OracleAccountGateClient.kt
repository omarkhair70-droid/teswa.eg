package com.teswa.mobile.account

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
import java.net.URLEncoder

class OracleAccountGateClient(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    suspend fun fetchProfile(session: AuthSession): AccountGateResult<AccountProfile?> {
        return when (val result = execute(session, OracleRequest(path = "/v1/profiles/me"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> AccountGateResult.Success(mapProfile(result.value.body), result.session)
                401 -> expired(result.session)
                404 -> AccountGateResult.Success(null, result.session)
                else -> AccountGateResult.Failure(
                    "تعذر تحميل بيانات الحساب (${result.value.status}).",
                    session = result.session,
                )
            }
            else -> result.toFailure("تعذر التحقق من بيانات الحساب الآن.")
        }
    }

    suspend fun setupProfile(
        session: AuthSession,
        displayName: String,
        username: String,
    ): AccountGateResult<Unit> {
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("displayName", displayName.trim())
            .put("username", username.trim().lowercase())
        return when (val result = execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/profiles/setup", body),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> AccountGateResult.Success(Unit, result.session)
                401 -> expired(result.session)
                409 -> AccountGateResult.Failure("اسم المستخدم مستخدم بالفعل.", session = result.session)
                else -> AccountGateResult.Failure(
                    result.value.body.optString("error", "تعذر حفظ الملف."),
                    session = result.session,
                )
            }
            else -> result.toFailure("تعذر حفظ الملف الآن.")
        }
    }

    suspend fun fetchPolicyAcceptances(
        session: AuthSession,
    ): AccountGateResult<List<PolicyAcceptance>> {
        val encodedUserId = URLEncoder.encode(session.user.id, Charsets.UTF_8.name())
        val encodedKeys = URLEncoder.encode(RequiredPolicies.keys.joinToString(","), Charsets.UTF_8.name())
        val path = "/v1/policies/acceptances?userId=$encodedUserId&keys=$encodedKeys"
        return when (val result = execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val items = result.value.body.optJSONArray("items") ?: JSONArray()
                    val mapped = buildList {
                        for (index in 0 until items.length()) {
                            val item = items.optJSONObject(index) ?: continue
                            val key = item.optString("policyKey")
                            val version = item.optString("policyVersion")
                            if (key.isNotBlank() && version.isNotBlank()) add(PolicyAcceptance(key, version))
                        }
                    }
                    AccountGateResult.Success(mapped, result.session)
                }
                401 -> expired(result.session)
                else -> AccountGateResult.Failure(
                    "تعذر التحقق من السياسات (${result.value.status}).",
                    session = result.session,
                )
            }
            else -> result.toFailure("تعذر التحقق من موافقات السياسات الآن.")
        }
    }

    suspend fun recordRequiredPolicies(session: AuthSession): AccountGateResult<Unit> {
        val policies = JSONArray()
            .put(JSONObject().put("policyKey", RequiredPolicies.TERMS_KEY).put("policyVersion", RequiredPolicies.VERSION))
            .put(JSONObject().put("policyKey", RequiredPolicies.COMMUNITY_KEY).put("policyVersion", RequiredPolicies.VERSION))
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("policies", policies)

        return when (val result = execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/policies/acceptances", body),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> AccountGateResult.Success(Unit, result.session)
                401 -> expired(result.session)
                403 -> AccountGateResult.Failure(
                    "ليس لديك صلاحية لحفظ الموافقات الآن.",
                    session = result.session,
                )
                else -> AccountGateResult.Failure(
                    "تعذر حفظ موافقات السياسات (${result.value.status}).",
                    session = result.session,
                )
            }
            else -> result.toFailure("تعذر حفظ موافقات السياسات الآن.")
        }
    }

    private suspend fun execute(
        session: AuthSession,
        request: OracleRequest,
    ) = executor.execute(session, request)

    private fun AuthenticatedOracleResult.toFailure(networkMessage: String): AccountGateResult.Failure {
        return when (this) {
            is AuthenticatedOracleResult.NetworkFailure -> AccountGateResult.Failure(
                networkMessage,
                network = true,
                session = session,
            )
            is AuthenticatedOracleResult.InvalidResponse -> AccountGateResult.Failure(
                "الخادم أعاد استجابة غير صالحة.",
                session = session,
            )
            is AuthenticatedOracleResult.SessionFailure -> AccountGateResult.Failure(
                failure.message,
                network = failure.reason == AuthResult.Reason.NETWORK,
                unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            )
            is AuthenticatedOracleResult.Response -> error("HTTP responses must be mapped by the caller.")
        }
    }

    private fun expired(session: AuthSession) = AccountGateResult.Failure(
        "انتهت جلسة تِسوى.",
        unauthorized = true,
        session = session,
    )

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
}
