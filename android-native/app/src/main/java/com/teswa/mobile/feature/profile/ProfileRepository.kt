package com.teswa.mobile.feature.profile

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

interface ProfileRepository {
    suspend fun load(session: AuthSession): ProfileResult<ProfileOverview>
    suspend fun update(session: AuthSession, draft: ProfileEditDraft): ProfileResult<MyProfile>
    suspend fun updateListing(session: AuthSession, listingId: String, action: ListingAction): ProfileResult<String>
}

class OracleProfileRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : ProfileRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession): ProfileResult<ProfileOverview> {
        val profile = when (val result = executor.execute(session, OracleRequest(path = "/v1/profiles/me"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseProfile(result.value.body, result.session)
                401 -> expired(result.session)
                404 -> ProfileResult.Failure("ملفك الشخصي مش موجود.", result.session)
                else -> ProfileResult.Failure("تعذر تحميل ملفك (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل ملفك الآن.")
        }
        if (profile is ProfileResult.Failure) return profile
        profile as ProfileResult.Success

        return when (val result = executor.execute(profile.session, OracleRequest(path = "/v1/marketplace/mine"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return ProfileResult.Failure("استجابة عناصر حسابك غير مكتملة.", result.session)
                    val listings = buildList {
                        for (index in 0 until raw.length()) {
                            raw.optJSONObject(index)?.let(::parseListing)?.let(::add)
                        }
                    }
                    ProfileResult.Success(ProfileOverview(profile.value, listings), result.session)
                }
                401 -> expired(result.session)
                else -> ProfileResult.Failure("تعذر تحميل عناصر حسابك (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل عناصر حسابك الآن.")
        }
    }

    override suspend fun update(session: AuthSession, draft: ProfileEditDraft): ProfileResult<MyProfile> {
        draft.validate()?.let { return ProfileResult.Failure(it, session) }
        val body = JSONObject()
            .put("userId", session.user.id)
            .put("displayName", draft.displayName.trim())
            .put("username", draft.username.trim().lowercase())
            .putNullable("profileTagline", draft.profileTagline)
            .putNullable("bio", draft.bio)
            .putNullable("city", draft.city)
            .putNullable("area", draft.area)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/profiles/update", body),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseProfile(result.value.body, result.session)
                401 -> expired(result.session)
                404 -> ProfileResult.Failure("ملفك الشخصي مش موجود.", result.session)
                409 -> ProfileResult.Failure("اسم المستخدم مستخدم بالفعل. جرّب اسم تاني.", result.session)
                else -> ProfileResult.Failure("تعذر حفظ الملف (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر حفظ الملف الآن.")
        }
    }

    override suspend fun updateListing(
        session: AuthSession,
        listingId: String,
        action: ListingAction,
    ): ProfileResult<String> {
        val id = listingId.trim().takeIf(UUID_LIKE::matches)
            ?: return ProfileResult.Failure("معرّف العنصر غير صالح.", session)
        val segment = when (action) {
            ListingAction.ARCHIVE -> "archive"
            ListingAction.REACTIVATE -> "reactivate"
            ListingAction.DELETE_ARCHIVED -> "delete-archived"
        }
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/marketplace/items/$id/$segment", JSONObject()),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val code = result.value.body.optString("code")
                    val expected = when (action) {
                        ListingAction.ARCHIVE -> "archived"
                        ListingAction.REACTIVATE -> "reactivated"
                        ListingAction.DELETE_ARCHIVED -> "deleted"
                    }
                    if (code == expected) ProfileResult.Success(code, result.session)
                    else ProfileResult.Failure(lifecycleMessage(code), result.session)
                }
                401 -> expired(result.session)
                else -> ProfileResult.Failure("تعذر تحديث العنصر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحديث العنصر الآن.")
        }
    }

    private fun parseProfile(body: JSONObject, session: AuthSession): ProfileResult<MyProfile> {
        val id = body.optString("id").trim()
        val displayName = body.optString("displayName").trim()
        val username = body.optString("username").trim()
        if (!UUID_LIKE.matches(id) || displayName.isBlank() || username.isBlank()) {
            return ProfileResult.Failure("استجابة الملف الشخصي غير مكتملة.", session)
        }
        val swaps = body.optInt("successfulSwapsCount", 0).coerceAtLeast(0)
        val response = if (body.has("responseRate") && !body.isNull("responseRate")) {
            body.optInt("responseRate").coerceIn(0, 100)
        } else null
        return ProfileResult.Success(
            MyProfile(
                id, displayName, username, nullable(body, "bio"), nullable(body, "avatarUrl"),
                nullable(body, "coverUrl"), nullable(body, "city"), nullable(body, "area"),
                nullable(body, "profileTagline"), swaps, response, nullable(body, "createdAt"),
            ),
            session,
        )
    }

    private fun parseListing(body: JSONObject): MyListing? {
        val id = body.optString("id").trim().takeIf(UUID_LIKE::matches) ?: return null
        val title = body.optString("title").trim().takeIf(String::isNotEmpty) ?: return null
        val status = body.optString("status")
        if (status !in LISTING_STATUSES) return null
        val offers = body.optInt("openIncomingOffersCount", -1).takeIf { it >= 0 } ?: return null
        return MyListing(
            id, title, nullable(body, "imageUrl"), nullable(body, "category"), nullable(body, "condition"),
            nullable(body, "city"), nullable(body, "area"), status, nullable(body, "createdAt"), offers,
        )
    }

    private fun lifecycleMessage(code: String): String = when (code) {
        "has_open_offers" -> "ما ينفعش تأرشف العنصر وفيه عروض مفتوحة. رد على العروض الأول."
        "has_deal_history" -> "العنصر مرتبط بتاريخ صفقة، فمش ممكن حذفه نهائيًا."
        "not_active" -> "العنصر مش نشط حاليًا."
        "not_archived" -> "العنصر لازم يكون مؤرشف قبل الحذف."
        "not_found_or_unauthorized" -> "العنصر مش موجود أو مش مملوك لحسابك."
        else -> "الخادم رفض تغيير حالة العنصر."
    }

    private fun AuthenticatedOracleResult.toFailure(message: String): ProfileResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> ProfileResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> ProfileResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> ProfileResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by the caller.")
    }

    private fun JSONObject.putNullable(key: String, value: String): JSONObject =
        put(key, value.trim().takeIf(String::isNotEmpty) ?: JSONObject.NULL)
    private fun nullable(json: JSONObject, key: String): String? =
        if (!json.has(key) || json.isNull(key)) null else json.optString(key).trim().takeIf(String::isNotEmpty)
    private fun expired(session: AuthSession) = ProfileResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
        val LISTING_STATUSES = setOf("active", "reserved", "swapped", "archived")
    }
}
