package com.teswa.mobile.feature.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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

data class PublicListing(val id: String, val title: String, val imageUrl: String?, val category: String?, val city: String?, val area: String?)
data class FollowState(val followingByMe: Boolean, val followsMe: Boolean, val mutual: Boolean, val followerCount: Int, val followingCount: Int)
data class TrustMetrics(
    val completedDealsCount: Int,
    val cancelledDealsCount: Int,
    val totalReviewsReceived: Int,
    val averageRating: Double?,
    val clearDescriptionCount: Int,
    val goodCommunicationCount: Int,
    val onTimeCount: Int,
    val respectfulSwapperCount: Int,
    val responseRate: Double?,
    val avgResponseTimeMinutes: Double?,
    val trustLevelKey: String,
    val trustScore: Int,
)
data class ProfileBadge(
    val badgeKey: String,
    val labelAr: String,
    val descriptionAr: String,
    val category: String,
    val priority: Int,
    val awardedAt: String?,
)
data class PublicProfileOverview(
    val profile: MyProfile,
    val listings: List<PublicListing>,
    val follow: FollowState,
    val blockedByMe: Boolean,
    val blockedMe: Boolean,
    val trust: TrustMetrics?,
    val badges: List<ProfileBadge>,
)

interface PublicProfileRepository {
    suspend fun load(session: AuthSession, profileId: String): ProfileResult<PublicProfileOverview>
    suspend fun setFollowing(session: AuthSession, profileId: String, follow: Boolean): ProfileResult<Unit>
    suspend fun setBlocked(session: AuthSession, profileId: String, block: Boolean): ProfileResult<Unit>
}

class OraclePublicProfileRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : PublicProfileRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession, profileId: String): ProfileResult<PublicProfileOverview> {
        val id = profileId.validId() ?: return ProfileResult.Failure("معرّف الملف غير صالح.", session)
        if (id == session.user.id) return ProfileResult.Failure("ده ملفك أنت.", session)
        val profileResponse = response(session, "/v1/profiles/$id", "تعذر تحميل الملف العام.")
        if (profileResponse is ProfileResult.Failure) return profileResponse
        profileResponse as ProfileResult.Success
        val profile = parseProfile(profileResponse.value, profileResponse.session)
        if (profile is ProfileResult.Failure) return profile
        profile as ProfileResult.Success

        val listingsResponse = response(profile.session, "/v1/marketplace/owners/$id/active?limit=12", "تعذر تحميل عناصر المستخدم.")
        if (listingsResponse is ProfileResult.Failure) return listingsResponse
        listingsResponse as ProfileResult.Success
        val listingsArray = listingsResponse.value.optJSONArray("items")
            ?: return ProfileResult.Failure("استجابة عناصر المستخدم غير مكتملة.", listingsResponse.session)
        val listings = buildList {
            for (index in 0 until listingsArray.length()) {
                val row = listingsArray.optJSONObject(index) ?: continue
                val listingId = row.optString("id").validId() ?: continue
                val title = row.optString("title").trim().takeIf(String::isNotEmpty) ?: continue
                add(PublicListing(listingId, title, nullable(row, "imageUrl"), nullable(row, "category"), nullable(row, "city"), nullable(row, "area")))
            }
        }

        val followResponse = response(listingsResponse.session, "/v1/profiles/$id/follow-state", "تعذر تحميل حالة المتابعة.")
        if (followResponse is ProfileResult.Failure) return followResponse
        followResponse as ProfileResult.Success
        val followState = followResponse.value.let {
            if (!it.has("followingByMe") || !it.has("followsMe") || !it.has("mutual")) null else FollowState(
                it.optBoolean("followingByMe"), it.optBoolean("followsMe"), it.optBoolean("mutual"),
                it.optInt("followerCount", 0).coerceAtLeast(0), it.optInt("followingCount", 0).coerceAtLeast(0),
            )
        } ?: return ProfileResult.Failure("استجابة المتابعة غير مكتملة.", followResponse.session)

        val blockResponse = response(followResponse.session, "/v1/profiles/$id/block-state", "تعذر تحميل حالة الحظر.")
        if (blockResponse is ProfileResult.Failure) return blockResponse
        blockResponse as ProfileResult.Success

        val trustResponse = response(blockResponse.session, "/v1/profiles/$id/trust", "تعذر تحميل مؤشر الثقة.")
        if (trustResponse is ProfileResult.Failure) return trustResponse
        trustResponse as ProfileResult.Success
        val trust = if (trustResponse.value.isNull("metrics")) null else {
            val raw = trustResponse.value.optJSONObject("metrics")
                ?: return ProfileResult.Failure("استجابة مؤشر الثقة غير مكتملة.", trustResponse.session)
            parseTrust(raw) ?: return ProfileResult.Failure("استجابة مؤشر الثقة غير صالحة.", trustResponse.session)
        }

        val badgesResponse = response(trustResponse.session, "/v1/profiles/$id/badges", "تعذر تحميل شارات الملف.")
        if (badgesResponse is ProfileResult.Failure) return badgesResponse
        badgesResponse as ProfileResult.Success
        val badgesArray = badgesResponse.value.optJSONArray("items")
            ?: return ProfileResult.Failure("استجابة شارات الملف غير مكتملة.", badgesResponse.session)
        val badges = buildList {
            for (index in 0 until badgesArray.length()) badgesArray.optJSONObject(index)?.let(::parseBadge)?.let(::add)
        }
        return ProfileResult.Success(
            PublicProfileOverview(
                profile.value, listings, followState,
                blockResponse.value.optBoolean("blockedByMe"), blockResponse.value.optBoolean("blockedMe"),
                trust, badges,
            ),
            badgesResponse.session,
        )
    }

    override suspend fun setFollowing(session: AuthSession, profileId: String, follow: Boolean): ProfileResult<Unit> =
        social(session, profileId, if (follow) "follow" else "unfollow")

    override suspend fun setBlocked(session: AuthSession, profileId: String, block: Boolean): ProfileResult<Unit> =
        social(session, profileId, if (block) "block" else "unblock")

    private suspend fun social(session: AuthSession, profileId: String, action: String): ProfileResult<Unit> {
        val id = profileId.validId() ?: return ProfileResult.Failure("معرّف الملف غير صالح.", session)
        if (id == session.user.id) return ProfileResult.Failure("لا يمكن تنفيذ الإجراء على حسابك.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/profiles/$id/$action", JSONObject().put("userId", session.user.id)),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> ProfileResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                result.value.status == 409 -> ProfileResult.Failure("الإجراء غير متاح بسبب حالة الحسابين.", result.session)
                else -> ProfileResult.Failure("تعذر تحديث الملف (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحديث الملف الآن.")
        }
    }

    private suspend fun response(session: AuthSession, path: String, message: String): ProfileResult<JSONObject> =
        when (val result = executor.execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> ProfileResult.Success(result.value.body, result.session)
                401 -> expired(result.session)
                404 -> ProfileResult.Failure("الملف غير موجود أو غير متاح.", result.session)
                else -> ProfileResult.Failure("$message (${result.value.status})", result.session)
            }
            else -> result.failure(message)
        }

    private fun parseProfile(body: JSONObject, session: AuthSession): ProfileResult<MyProfile> {
        val id = body.optString("id").validId() ?: return ProfileResult.Failure("استجابة الملف غير مكتملة.", session)
        val name = body.optString("displayName").trim().takeIf(String::isNotEmpty) ?: return ProfileResult.Failure("استجابة الملف غير مكتملة.", session)
        val username = body.optString("username").trim().takeIf(String::isNotEmpty) ?: return ProfileResult.Failure("استجابة الملف غير مكتملة.", session)
        return ProfileResult.Success(
            MyProfile(
                id, name, username, nullable(body, "bio"), nullable(body, "avatarUrl"), nullable(body, "coverUrl"),
                nullable(body, "city"), nullable(body, "area"), nullable(body, "profileTagline"),
                body.optInt("successfulSwapsCount", 0).coerceAtLeast(0),
                if (body.has("responseRate") && !body.isNull("responseRate")) body.optInt("responseRate").coerceIn(0, 100) else null,
                nullable(body, "createdAt"),
            ),
            session,
        )
    }

    private fun parseTrust(body: JSONObject): TrustMetrics? {
        val level = body.optString("trustLevelKey").takeIf { it in TRUST_LEVELS } ?: return null
        val score = body.optInt("trustScore", -1).takeIf { it in 0..100 } ?: return null
        fun count(key: String) = body.optInt(key, -1).takeIf { it >= 0 }
        return TrustMetrics(
            completedDealsCount = count("completedDealsCount") ?: return null,
            cancelledDealsCount = count("cancelledDealsCount") ?: return null,
            totalReviewsReceived = count("totalReviewsReceived") ?: return null,
            averageRating = nullableDouble(body, "averageRating")?.coerceIn(0.0, 5.0),
            clearDescriptionCount = count("clearDescriptionCount") ?: return null,
            goodCommunicationCount = count("goodCommunicationCount") ?: return null,
            onTimeCount = count("onTimeCount") ?: return null,
            respectfulSwapperCount = count("respectfulSwapperCount") ?: return null,
            responseRate = nullableDouble(body, "responseRate")?.coerceIn(0.0, 100.0),
            avgResponseTimeMinutes = nullableDouble(body, "avgResponseTimeMinutes")?.coerceAtLeast(0.0),
            trustLevelKey = level,
            trustScore = score,
        )
    }

    private fun parseBadge(body: JSONObject): ProfileBadge? {
        val key = body.optString("badgeKey").trim().takeIf(String::isNotEmpty) ?: return null
        val label = body.optString("labelAr").trim().takeIf(String::isNotEmpty) ?: return null
        val description = body.optString("descriptionAr").trim().takeIf(String::isNotEmpty) ?: return null
        val category = body.optString("category").trim().takeIf(String::isNotEmpty) ?: return null
        return ProfileBadge(key, label, description, category, body.optInt("priority", 100).coerceAtLeast(0), nullable(body, "awardedAt"))
    }

    private fun AuthenticatedOracleResult.failure(message: String): ProfileResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> ProfileResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> ProfileResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> ProfileResult.Failure(failure.message, unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED)
        is AuthenticatedOracleResult.Response -> error("handled")
    }
    private fun expired(session: AuthSession) = ProfileResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)
    private fun nullable(body: JSONObject, key: String): String? = if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)
    private fun nullableDouble(body: JSONObject, key: String): Double? =
        if (!body.has(key) || body.isNull(key)) null else body.optDouble(key).takeIf(Double::isFinite)
    private fun String.validId() = trim().takeIf(UUID_LIKE::matches)
    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        val TRUST_LEVELS = setOf("new_swapper", "rising_swapper", "reliable_swapper", "trusted_swapper")
    }
}

sealed interface PublicProfileUiState {
    data object Loading : PublicProfileUiState
    data class Ready(val overview: PublicProfileOverview) : PublicProfileUiState
    data class Error(val message: String) : PublicProfileUiState
}

class PublicProfileStateHolder(
    initialSession: AuthSession,
    private val profileId: String,
    private val repository: PublicProfileRepository,
) {
    var session by mutableStateOf(initialSession); private set
    var state by mutableStateOf<PublicProfileUiState>(PublicProfileUiState.Loading); private set
    var workingAction by mutableStateOf<String?>(null); private set
    var message by mutableStateOf<String?>(null); private set
    var sessionExpired by mutableStateOf(false); private set

    fun updateSession(value: AuthSession) { if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value }
    suspend fun load() {
        state = PublicProfileUiState.Loading
        when (val result = repository.load(session, profileId)) {
            is ProfileResult.Success -> { session = result.session; state = PublicProfileUiState.Ready(result.value); message = null }
            is ProfileResult.Failure -> { result.session?.let { session = it }; sessionExpired = result.unauthorized; state = PublicProfileUiState.Error(result.message) }
        }
    }
    suspend fun toggleFollow() {
        val ready = state as? PublicProfileUiState.Ready ?: return
        if (workingAction != null || ready.overview.blockedByMe || ready.overview.blockedMe) return
        workingAction = "follow"; message = null
        val next = !ready.overview.follow.followingByMe
        when (val result = repository.setFollowing(session, profileId, next)) {
            is ProfileResult.Success -> { session = result.session; load() }
            is ProfileResult.Failure -> fail(result)
        }
        workingAction = null
    }
    suspend fun toggleBlock() {
        val ready = state as? PublicProfileUiState.Ready ?: return
        if (workingAction != null) return
        workingAction = "block"; message = null
        val next = !ready.overview.blockedByMe
        when (val result = repository.setBlocked(session, profileId, next)) {
            is ProfileResult.Success -> { session = result.session; load() }
            is ProfileResult.Failure -> fail(result)
        }
        workingAction = null
    }
    private fun fail(result: ProfileResult.Failure) { result.session?.let { session = it }; sessionExpired = result.unauthorized; message = if (result.unauthorized) null else result.message }
}
