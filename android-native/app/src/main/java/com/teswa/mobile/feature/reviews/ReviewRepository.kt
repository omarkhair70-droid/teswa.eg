package com.teswa.mobile.feature.reviews

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

interface ReviewRepository {
    suspend fun load(session: AuthSession, dealId: String): ReviewResult<DealReviewContext>
    suspend fun submit(session: AuthSession, context: DealReviewContext, draft: ReviewDraft): ReviewResult<ExistingReview>
}

class OracleReviewRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : ReviewRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession, dealId: String): ReviewResult<DealReviewContext> {
        val id = dealId.validId() ?: return ReviewResult.Failure("معرّف الصفقة غير صالح.", session)
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/reviews/deals/$id"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseContext(result.value.body, result.session)
                401 -> expired(result.session)
                404 -> ReviewResult.Failure("الصفقة غير موجودة أو غير متاحة.", result.session)
                409 -> ReviewResult.Failure("التقييم متاح بعد اكتمال الصفقة فقط.", result.session)
                else -> ReviewResult.Failure("تعذر تحميل التقييم (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل التقييم الآن.")
        }
    }

    override suspend fun submit(
        session: AuthSession,
        context: DealReviewContext,
        draft: ReviewDraft,
    ): ReviewResult<ExistingReview> {
        draft.validate()?.let { return ReviewResult.Failure(it, session) }
        if (context.reviewerId != session.user.id) return ReviewResult.Failure("هوية التقييم غير صالحة.", session)
        val body = JSONObject()
            .put("dealId", context.dealId)
            .put("reviewerId", session.user.id)
            .put("revieweeId", context.reviewee.id)
            .put("rating", draft.rating)
            .put("comment", draft.comment.trim().takeIf(String::isNotEmpty) ?: JSONObject.NULL)
            .put("clearDescription", draft.clearDescription)
            .put("goodCommunication", draft.goodCommunication)
            .put("onTime", draft.onTime)
            .put("respectfulSwapper", draft.respectfulSwapper)
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/reviews", body))) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 201 && result.value.body.optBoolean("ok") -> ReviewResult.Success(
                    ExistingReview(
                        id = "submitted:${context.dealId}",
                        rating = draft.rating,
                        comment = draft.comment.trim().takeIf(String::isNotEmpty),
                        clearDescription = draft.clearDescription,
                        goodCommunication = draft.goodCommunication,
                        onTime = draft.onTime,
                        respectfulSwapper = draft.respectfulSwapper,
                        createdAt = null,
                    ),
                    result.session,
                )
                result.value.status == 401 -> expired(result.session)
                result.value.status == 409 -> ReviewResult.Failure("تم إرسال تقييم للصفقة دي بالفعل.", result.session)
                else -> ReviewResult.Failure("تعذر إرسال التقييم (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر إرسال التقييم الآن.")
        }
    }

    private fun parseContext(body: JSONObject, session: AuthSession): ReviewResult<DealReviewContext> {
        val dealId = body.optString("dealId").validId() ?: return invalid(session)
        val reviewerId = body.optString("reviewerId").validId() ?: return invalid(session)
        if (reviewerId != session.user.id) return invalid(session)
        val person = body.optJSONObject("reviewee") ?: return invalid(session)
        val revieweeId = person.optString("id").validId() ?: return invalid(session)
        val displayName = person.optString("displayName").trim().takeIf(String::isNotEmpty) ?: "مستخدم تِسوى"
        val reviewee = Reviewee(revieweeId, displayName, nullable(person, "username"), nullable(person, "avatarUrl"))
        val existing = if (body.isNull("existingReview")) null else {
            val raw = body.optJSONObject("existingReview") ?: return invalid(session)
            val id = raw.optString("id").validId() ?: return invalid(session)
            val rating = raw.optInt("rating", 0).takeIf { it in 1..5 } ?: return invalid(session)
            ExistingReview(
                id, rating, nullable(raw, "comment"), raw.optBoolean("clearDescription"),
                raw.optBoolean("goodCommunication"), raw.optBoolean("onTime"),
                raw.optBoolean("respectfulSwapper"), nullable(raw, "createdAt"),
            )
        }
        return ReviewResult.Success(DealReviewContext(dealId, reviewerId, reviewee, existing), session)
    }

    private fun AuthenticatedOracleResult.failure(message: String): ReviewResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> ReviewResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> ReviewResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> ReviewResult.Failure(
            failure.message,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            network = failure.reason == AuthResult.Reason.NETWORK,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP response handled at call site.")
    }

    private fun expired(session: AuthSession) = ReviewResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)
    private fun invalid(session: AuthSession) = ReviewResult.Failure("استجابة التقييم غير مكتملة.", session)
    private fun nullable(body: JSONObject, key: String) = if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)
    private fun String.validId() = trim().takeIf(UUID::matches)

    private companion object {
        val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    }
}
