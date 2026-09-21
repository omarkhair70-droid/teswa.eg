package com.teswa.mobile.feature.safety

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

interface ReportingRepository {
    suspend fun prepare(session: AuthSession, target: ReportTarget): ReportingResult<PreparedReportContext>

    suspend fun submit(
        session: AuthSession,
        target: ReportTarget,
        reason: ReportReason,
        details: String?,
    ): ReportingResult<Unit>
}

class OracleReportingRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : ReportingRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun prepare(session: AuthSession, target: ReportTarget): ReportingResult<PreparedReportContext> {
        return when (target) {
            is ReportTarget.User -> prepareUser(session, target)
            is ReportTarget.Item -> prepareItem(session, target)
            is ReportTarget.Story -> prepareStory(session, target)
            is ReportTarget.DirectMessage -> prepareDirect(session, target)
            is ReportTarget.ContextualMessage -> prepareContextual(session, target)
            is ReportTarget.Deal -> prepareDeal(session, target.dealId, target.fallbackSubject)
            is ReportTarget.DealMessage -> prepareDeal(session, target.dealId, target.fallbackSubject)
        }
    }

    override suspend fun submit(
        session: AuthSession,
        target: ReportTarget,
        reason: ReportReason,
        details: String?,
    ): ReportingResult<Unit> {
        val request = reportRequest(target, reason, details)
            ?: return ReportingResult.Failure("بيانات البلاغ غير مكتملة.", session)
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status in 200..299 -> ReportingResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> mapReportHttpFailure(result)
            }
            else -> result.toReportingFailure("تعذر إرسال البلاغ حاليًا.")
        }
    }

    private suspend fun prepareUser(
        session: AuthSession,
        target: ReportTarget.User,
    ): ReportingResult<PreparedReportContext> {
        val userId = target.userId.trim()
        if (userId.isEmpty()) return ReportingResult.Failure("بيانات المستخدم غير مكتملة.", session)
        if (userId == session.user.id) return ReportingResult.Failure("لا يمكنك الإبلاغ عن نفسك.", session)
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/moderation/profiles/$userId"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val item = result.value.body.optJSONObject("item")
                    if (item == null) {
                        ReportingResult.Failure("المستخدم غير موجود.", result.session)
                    } else if (item.optString("id") != userId) {
                        ReportingResult.Failure("تعذر التحقق من المستخدم.", result.session)
                    } else {
                        ReportingResult.Success(
                            PreparedReportContext(participantName(item) ?: target.fallbackSubject),
                            result.session,
                        )
                    }
                }
                401 -> expired(result.session)
                404 -> ReportingResult.Failure("المستخدم غير موجود.", result.session)
                else -> ReportingResult.Failure("تعذر تحميل بيانات البلاغ (${result.value.status}).", result.session)
            }
            else -> result.toReportingFailure("تعذر تحميل بيانات المستخدم الآن.")
        }
    }

    private suspend fun prepareItem(
        session: AuthSession,
        target: ReportTarget.Item,
    ): ReportingResult<PreparedReportContext> {
        val itemId = target.itemId.trim()
        if (itemId.isEmpty()) return ReportingResult.Failure("بيانات العنصر غير مكتملة.", session)
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/moderation/items/$itemId/context"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val item = result.value.body.optJSONObject("item")
                    if (item == null) {
                        ReportingResult.Failure("العنصر غير موجود.", result.session)
                    } else {
                        val ownerId = item.optString("ownerId").trim()
                        if (ownerId == session.user.id) {
                            ReportingResult.Failure("لا يمكنك الإبلاغ عن عنصرك.", result.session)
                        } else {
                            val title = item.optString("title").trim().ifEmpty { target.fallbackSubject }
                            val owner = item.optJSONObject("owner")?.let(::participantName)
                            ReportingResult.Success(
                                PreparedReportContext(title, owner?.let { "صاحب العنصر: $it" }),
                                result.session,
                            )
                        }
                    }
                }
                401 -> expired(result.session)
                404 -> ReportingResult.Failure("العنصر غير موجود.", result.session)
                else -> ReportingResult.Failure("تعذر تحميل بيانات العنصر (${result.value.status}).", result.session)
            }
            else -> result.toReportingFailure("تعذر تحميل بيانات العنصر الآن.")
        }
    }

    private suspend fun prepareDirect(
        session: AuthSession,
        target: ReportTarget.DirectMessage,
    ): ReportingResult<PreparedReportContext> {
        if (target.conversationId.isBlank() || target.messageId.isBlank() || target.reportedUserId.isBlank()) {
            return ReportingResult.Failure("بيانات الرسالة غير مكتملة.", session)
        }
        if (target.reportedUserId == session.user.id) return ReportingResult.Failure("لا يمكنك الإبلاغ عن رسالتك.", session)
        val body = JSONObject()
            .put("conversationId", target.conversationId)
            .put("messageId", target.messageId)
            .put("reportedUserId", target.reportedUserId)
            .put("currentUserId", session.user.id)
        return prepareContext(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/moderation/direct-context", body),
            target.fallbackSubject,
        ) { item ->
            val user = item.optJSONObject("reportedUser")
            PreparedReportContext(
                participantName(user) ?: target.fallbackSubject,
                item.optString("preview").trim().takeIf(String::isNotEmpty),
            )
        }
    }

    private suspend fun prepareContextual(
        session: AuthSession,
        target: ReportTarget.ContextualMessage,
    ): ReportingResult<PreparedReportContext> {
        if (target.conversationId.isBlank() || target.messageId.isBlank() || target.reportedUserId.isBlank()) {
            return ReportingResult.Failure("بيانات الرسالة غير مكتملة.", session)
        }
        if (target.reportedUserId == session.user.id) {
            return ReportingResult.Failure("لا يمكنك الإبلاغ عن رسالتك.", session)
        }
        val body = JSONObject()
            .put("conversationId", target.conversationId)
            .put("messageId", target.messageId)
            .put("reportedUserId", target.reportedUserId)
            .put("currentUserId", session.user.id)
        return prepareContext(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/moderation/contextual-context", body),
            target.fallbackSubject,
        ) { item ->
            val user = item.optJSONObject("reportedUser")
            PreparedReportContext(
                participantName(user) ?: target.fallbackSubject,
                item.optString("preview").trim().takeIf(String::isNotEmpty),
            )
        }
    }

    private suspend fun prepareStory(
        session: AuthSession,
        target: ReportTarget.Story,
    ): ReportingResult<PreparedReportContext> {
        if (target.storyId.isBlank()) return ReportingResult.Failure("بيانات القصة غير مكتملة.", session)
        val body = JSONObject().put("storyId", target.storyId).put("currentUserId", session.user.id)
        return prepareContext(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/moderation/story-context", body),
            target.fallbackSubject,
        ) { item ->
            val author = item.optJSONObject("author")
            PreparedReportContext(
                participantName(author)?.let { "قصة $it" } ?: target.fallbackSubject,
                item.optString("caption").trim().takeIf(String::isNotEmpty),
            )
        }
    }

    private suspend fun prepareDeal(
        session: AuthSession,
        dealId: String,
        fallback: String,
    ): ReportingResult<PreparedReportContext> {
        if (dealId.isBlank()) return ReportingResult.Failure("بيانات الصفقة غير مكتملة.", session)
        val body = JSONObject().put("dealId", dealId).put("currentUserId", session.user.id)
        return prepareContext(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/moderation/deal-context", body),
            fallback,
        ) { item ->
            val user = item.optJSONObject("reportedUser")
            PreparedReportContext(participantName(user)?.let { "الطرف الآخر: $it" } ?: fallback)
        }
    }

    private suspend fun prepareContext(
        session: AuthSession,
        request: OracleRequest,
        fallback: String,
        parse: (JSONObject) -> PreparedReportContext,
    ): ReportingResult<PreparedReportContext> {
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 401 -> expired(result.session)
                result.value.status == 404 -> ReportingResult.Failure("المحتوى المطلوب لم يعد متاحًا.", result.session)
                result.value.status !in 200..299 -> mapContextHttpFailure(result, fallback)
                !result.value.body.optBoolean("ok", false) -> mapContextBodyFailure(result.value.body, result.session, fallback)
                else -> {
                    val item = result.value.body.optJSONObject("item")
                    if (item == null) ReportingResult.Failure("تعذر التحقق من بيانات البلاغ.", result.session)
                    else ReportingResult.Success(parse(item), result.session)
                }
            }
            else -> result.toReportingFailure("تعذر التحقق من بيانات البلاغ الآن.")
        }
    }

    private fun mapContextHttpFailure(
        result: AuthenticatedOracleResult.Response,
        fallback: String,
    ): ReportingResult.Failure {
        val bodyReason = result.value.body.optString("reason")
        return when {
            result.value.status == 403 || bodyReason == "unauthorized" -> ReportingResult.Failure("غير مسموح لك بإرسال بلاغ من هذا السياق.", result.session)
            bodyReason == "self_target" -> ReportingResult.Failure("لا يمكنك الإبلاغ عن محتواك.", result.session)
            bodyReason == "invalid_target" -> ReportingResult.Failure("تعذر التحقق من الطرف المُبلّغ عنه.", result.session)
            else -> ReportingResult.Failure("تعذر التحقق من $fallback.", result.session)
        }
    }

    private fun mapContextBodyFailure(
        body: JSONObject,
        session: AuthSession,
        fallback: String,
    ): ReportingResult.Failure = when (body.optString("reason")) {
        "not_found" -> ReportingResult.Failure("المحتوى المطلوب لم يعد متاحًا.", session)
        "unauthorized" -> ReportingResult.Failure("غير مسموح لك بإرسال بلاغ من هذا السياق.", session)
        "self_target" -> ReportingResult.Failure("لا يمكنك الإبلاغ عن محتواك.", session)
        "invalid_target" -> ReportingResult.Failure("تعذر التحقق من الطرف المُبلّغ عنه.", session)
        else -> ReportingResult.Failure("تعذر التحقق من $fallback.", session)
    }

    private fun mapReportHttpFailure(result: AuthenticatedOracleResult.Response): ReportingResult.Failure {
        val reason = result.value.body.optString("reason")
        return when {
            result.value.status == 429 || reason == "rate_limited" -> ReportingResult.Failure("وصلت للحد المسموح من البلاغات مؤقتًا.", result.session)
            reason == "invalid_reason" -> ReportingResult.Failure("اختار سبب بلاغ صالح وحاول تاني.", result.session)
            reason == "self_target" -> ReportingResult.Failure("لا يمكنك الإبلاغ عن محتواك.", result.session)
            reason == "invalid_target" -> ReportingResult.Failure("تعذر التحقق من الطرف المُبلّغ عنه.", result.session)
            result.value.status == 403 || reason == "unauthorized" -> ReportingResult.Failure("غير مسموح لك بإرسال بلاغ من هذا السياق.", result.session)
            result.value.status == 404 || reason == "not_found" -> ReportingResult.Failure("المحتوى المطلوب لم يعد متاحًا.", result.session)
            else -> ReportingResult.Failure("تعذر إرسال البلاغ (${result.value.status}).", result.session)
        }
    }

    private fun AuthenticatedOracleResult.toReportingFailure(message: String): ReportingResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> ReportingResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> ReportingResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> ReportingResult.Failure(
            failure.message,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            network = failure.reason == AuthResult.Reason.NETWORK,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP response must be handled by caller")
    }

    private fun expired(session: AuthSession) = ReportingResult.Failure(
        "انتهت جلسة تِسوى.",
        session = session,
        unauthorized = true,
    )

    private fun participantName(value: JSONObject?): String? {
        if (value == null) return null
        return value.optString("displayName").trim().takeIf(String::isNotEmpty)
            ?: value.optString("username").trim().takeIf(String::isNotEmpty)?.let { "@$it" }
    }
}

internal fun reportRequest(
    target: ReportTarget,
    reason: ReportReason,
    details: String?,
): OracleRequest? {
    val cleanDetails = details?.trim()?.takeIf(String::isNotEmpty)
    val body = JSONObject().put("reason", reason.apiValue).put("details", cleanDetails ?: JSONObject.NULL)
    val path = when (target) {
        is ReportTarget.User -> {
            if (target.userId.isBlank()) return null
            body.put("reportedUserId", target.userId)
            "/v1/moderation/reports/user"
        }
        is ReportTarget.Item -> {
            if (target.itemId.isBlank()) return null
            body.put("itemId", target.itemId)
            "/v1/moderation/reports/item"
        }
        is ReportTarget.Story -> {
            if (target.storyId.isBlank()) return null
            body.put("storyId", target.storyId)
            "/v1/moderation/reports/story"
        }
        is ReportTarget.DirectMessage -> {
            if (target.conversationId.isBlank() || target.messageId.isBlank() || target.reportedUserId.isBlank()) return null
            body.put("conversationId", target.conversationId)
                .put("messageId", target.messageId)
                .put("reportedUserId", target.reportedUserId)
            "/v1/moderation/reports/direct-message"
        }
        is ReportTarget.ContextualMessage -> {
            if (target.conversationId.isBlank() || target.messageId.isBlank() || target.reportedUserId.isBlank()) return null
            body.put("conversationId", target.conversationId)
                .put("contextualMessageId", target.messageId)
            "/v1/moderation/reports/contextual-message"
        }
        is ReportTarget.Deal -> {
            if (target.dealId.isBlank()) return null
            body.put("dealId", target.dealId)
            "/v1/moderation/reports/deal"
        }
        is ReportTarget.DealMessage -> {
            if (target.dealId.isBlank() || target.messageId.isBlank()) return null
            body.put("dealId", target.dealId).put("dealMessageId", target.messageId)
            "/v1/moderation/reports/deal-message"
        }
    }
    return OracleRequest(OracleHttpMethod.POST, path, body)
}
