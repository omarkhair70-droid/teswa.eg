package com.teswa.mobile.feature.profile

import com.teswa.mobile.auth.AuthSession

data class MyProfile(
    val id: String,
    val displayName: String,
    val username: String,
    val bio: String?,
    val avatarUrl: String?,
    val coverUrl: String?,
    val city: String?,
    val area: String?,
    val profileTagline: String?,
    val successfulSwapsCount: Int,
    val responseRate: Int?,
    val createdAt: String?,
)

data class MyListing(
    val id: String,
    val title: String,
    val imageUrl: String?,
    val category: String?,
    val condition: String?,
    val city: String?,
    val area: String?,
    val status: String,
    val createdAt: String?,
    val openIncomingOffersCount: Int,
)

data class ProfileOverview(val profile: MyProfile, val listings: List<MyListing>)

data class ProfileEditDraft(
    val displayName: String,
    val username: String,
    val profileTagline: String,
    val bio: String,
    val city: String,
    val area: String,
) {
    fun validate(): String? = when {
        displayName.trim().isEmpty() || displayName.trim().length > 80 -> "الاسم لازم يكون من 1 إلى 80 حرف."
        !USERNAME.matches(username.trim().lowercase()) -> "اسم المستخدم من 3 إلى 30 حرف إنجليزي أو رقم أو _."
        profileTagline.length > 160 -> "الجملة التعريفية لازم تكون 160 حرف أو أقل."
        bio.length > 1_000 -> "النبذة لازم تكون 1000 حرف أو أقل."
        city.length > 120 || area.length > 120 -> "المدينة والمنطقة لازم يكونوا 120 حرف أو أقل."
        else -> null
    }

    private companion object {
        val USERNAME = Regex("^[a-z0-9_]{3,30}$")
    }
}

enum class ListingAction { ARCHIVE, REACTIVATE, DELETE_ARCHIVED }

sealed interface ProfileResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : ProfileResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : ProfileResult<Nothing>
}
