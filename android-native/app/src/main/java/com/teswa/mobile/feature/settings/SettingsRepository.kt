package com.teswa.mobile.feature.settings

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import org.json.JSONObject

interface SettingsRepository {
    suspend fun load(session: AuthSession): SettingsResult<SettingsOverview>
    suspend fun updatePrivacy(session: AuthSession, value: DirectMessagePrivacy): SettingsResult<DirectMessagePrivacy>
    suspend fun updateNotification(session: AuthSession, toggle: NotificationToggle, enabled: Boolean): SettingsResult<NotificationPreferences>
    suspend fun unblock(session: AuthSession, targetUserId: String): SettingsResult<Unit>
    suspend fun deleteAccount(session: AuthSession): SettingsResult<Unit>
}

class OracleSettingsRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : SettingsRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession): SettingsResult<SettingsOverview> {
        val privacy = when (val result = executor.execute(session, OracleRequest(path = "/v1/profiles/privacy"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> DirectMessagePrivacy.fromWire(result.value.body.optString("value"))?.let {
                    SettingsResult.Success(it, result.session)
                } ?: SettingsResult.Failure("استجابة خصوصية الرسائل غير صالحة.", result.session)
                401 -> expired(result.session)
                else -> SettingsResult.Failure("تعذر تحميل خصوصية الرسائل (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل إعدادات الخصوصية الآن.")
        }
        if (privacy is SettingsResult.Failure) return privacy
        privacy as SettingsResult.Success

        val notifications = when (val result = executor.execute(
            privacy.session,
            OracleRequest(path = "/v1/notifications/preferences"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parsePreferences(result.value.body)?.let { SettingsResult.Success(it, result.session) }
                    ?: SettingsResult.Failure("استجابة تفضيلات الإشعارات غير صالحة.", result.session)
                401 -> expired(result.session)
                else -> SettingsResult.Failure("تعذر تحميل تفضيلات الإشعارات (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل تفضيلات الإشعارات الآن.")
        }
        if (notifications is SettingsResult.Failure) return notifications
        notifications as SettingsResult.Success

        return when (val result = executor.execute(
            notifications.session,
            OracleRequest(path = "/v1/profiles/blocked"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return SettingsResult.Failure("استجابة قائمة الحظر غير صالحة.", result.session)
                    val users = buildList {
                        for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::parseBlockedUser)?.let(::add)
                    }
                    SettingsResult.Success(SettingsOverview(privacy.value, notifications.value, users), result.session)
                }
                401 -> expired(result.session)
                else -> SettingsResult.Failure("تعذر تحميل قائمة الحظر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل قائمة الحظر الآن.")
        }
    }

    override suspend fun updatePrivacy(
        session: AuthSession,
        value: DirectMessagePrivacy,
    ): SettingsResult<DirectMessagePrivacy> = when (val result = executor.execute(
        session,
        OracleRequest(
            OracleHttpMethod.POST,
            "/v1/profiles/privacy",
            JSONObject().put("userId", session.user.id).put("value", value.wireValue),
        ),
    )) {
        is AuthenticatedOracleResult.Response -> when (result.value.status) {
            200 -> if (result.value.body.optBoolean("updated", false)) SettingsResult.Success(value, result.session)
            else SettingsResult.Failure("الخادم لم يؤكد حفظ الخصوصية.", result.session)
            401 -> expired(result.session)
            else -> SettingsResult.Failure("تعذر حفظ خصوصية الرسائل (${result.value.status}).", result.session)
        }
        else -> result.toFailure("تعذر حفظ خصوصية الرسائل الآن.")
    }

    override suspend fun updateNotification(
        session: AuthSession,
        toggle: NotificationToggle,
        enabled: Boolean,
    ): SettingsResult<NotificationPreferences> = when (val result = executor.execute(
        session,
        OracleRequest(
            OracleHttpMethod.POST,
            "/v1/notifications/preferences",
            JSONObject().put(toggle.wireKey, enabled),
        ),
    )) {
        is AuthenticatedOracleResult.Response -> when (result.value.status) {
            200 -> parsePreferences(result.value.body)?.let { SettingsResult.Success(it, result.session) }
                ?: SettingsResult.Failure("استجابة تفضيلات الإشعارات غير صالحة.", result.session)
            401 -> expired(result.session)
            else -> SettingsResult.Failure("تعذر حفظ تفضيلات الإشعارات (${result.value.status}).", result.session)
        }
        else -> result.toFailure("تعذر حفظ تفضيلات الإشعارات الآن.")
    }

    override suspend fun unblock(session: AuthSession, targetUserId: String): SettingsResult<Unit> {
        val target = targetUserId.takeIf(UUID_LIKE::matches)
            ?: return SettingsResult.Failure("معرّف المستخدم غير صالح.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/profiles/$target/unblock",
                JSONObject().put("userId", session.user.id),
            ),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> if (result.value.body.optBoolean("ok", false)) SettingsResult.Success(Unit, result.session)
                else SettingsResult.Failure("تعذر إلغاء الحظر.", result.session)
                401 -> expired(result.session)
                else -> SettingsResult.Failure("تعذر إلغاء الحظر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر إلغاء الحظر الآن.")
        }
    }

    override suspend fun deleteAccount(session: AuthSession): SettingsResult<Unit> = when (val result = executor.execute(
        session,
        OracleRequest(OracleHttpMethod.POST, "/v1/account/deletion-request", JSONObject()),
    )) {
        is AuthenticatedOracleResult.Response -> when (result.value.status) {
            200 -> if (result.value.body.optBoolean("ok", false)) SettingsResult.Success(Unit, result.session)
            else SettingsResult.Failure("الخادم لم يؤكد حذف الحساب.", result.session)
            401 -> expired(result.session)
            409 -> SettingsResult.Failure("تعذر حذف الحساب بأمان. لم يتم حذف هويتك.", result.session)
            else -> SettingsResult.Failure("تعذر حذف الحساب (${result.value.status}).", result.session)
        }
        else -> result.toFailure("تعذر حذف الحساب الآن. لم يتم تغيير حسابك.")
    }

    private fun parsePreferences(body: JSONObject): NotificationPreferences? {
        val required = listOf(
            "offersEnabled", "dealsEnabled", "messagesEnabled", "socialEnabled",
            "smartRemindersEnabled", "marketingEnabled", "quietHoursEnabled",
        )
        if (required.any { !body.has(it) || body.isNull(it) }) return null
        val start = body.optString("quietHoursStart").takeIf(CLOCK::matches) ?: return null
        val end = body.optString("quietHoursEnd").takeIf(CLOCK::matches) ?: return null
        return NotificationPreferences(
            body.getBoolean("offersEnabled"), body.getBoolean("dealsEnabled"),
            body.getBoolean("messagesEnabled"), body.getBoolean("socialEnabled"),
            body.getBoolean("smartRemindersEnabled"), body.getBoolean("marketingEnabled"),
            body.getBoolean("quietHoursEnabled"), start, end, nullable(body, "updatedAt"),
        )
    }

    private fun parseBlockedUser(body: JSONObject): BlockedUser? {
        val id = body.optString("id").takeIf(UUID_LIKE::matches) ?: return null
        return BlockedUser(
            id,
            nullable(body, "displayName"),
            nullable(body, "username"),
            nullable(body, "avatarUrl"),
            nullable(body, "blockedAt"),
        )
    }

    private fun nullable(body: JSONObject, key: String): String? =
        if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)

    private fun AuthenticatedOracleResult.toFailure(message: String): SettingsResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> SettingsResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> SettingsResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> SettingsResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by the caller.")
    }

    private fun expired(session: AuthSession) =
        SettingsResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
        val CLOCK = Regex("^[0-2][0-9]:[0-5][0-9]$")
    }
}
