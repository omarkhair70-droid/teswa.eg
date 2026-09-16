package com.teswa.mobile.feature.reviews

import com.teswa.mobile.auth.AuthSession

data class Reviewee(
    val id: String,
    val displayName: String,
    val username: String?,
    val avatarUrl: String?,
)

data class ExistingReview(
    val id: String,
    val rating: Int,
    val comment: String?,
    val clearDescription: Boolean,
    val goodCommunication: Boolean,
    val onTime: Boolean,
    val respectfulSwapper: Boolean,
    val createdAt: String?,
)

data class DealReviewContext(
    val dealId: String,
    val reviewerId: String,
    val reviewee: Reviewee,
    val existingReview: ExistingReview?,
)

data class ReviewDraft(
    val rating: Int = 0,
    val comment: String = "",
    val clearDescription: Boolean = false,
    val goodCommunication: Boolean = false,
    val onTime: Boolean = false,
    val respectfulSwapper: Boolean = false,
) {
    fun validate(): String? = when {
        rating !in 1..5 -> "اختار تقييم من نجمة لخمسة."
        comment.trim().length > 1_000 -> "التعليق لازم يكون 1000 حرف أو أقل."
        else -> null
    }
}

sealed interface ReviewResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : ReviewResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : ReviewResult<Nothing>
}
