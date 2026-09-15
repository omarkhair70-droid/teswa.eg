package com.teswa.mobile.feature.offers

import com.teswa.mobile.auth.AuthSession

enum class OfferDirection { INCOMING, SENT }
enum class OfferAction { THINKING, SOFT_REJECT, ACCEPT }

data class OfferItemSummary(
    val id: String,
    val title: String,
    val imageUrl: String?,
)

data class OfferSummary(
    val id: String,
    val status: String,
    val message: String?,
    val requestedItem: OfferItemSummary,
    val offeredItem: OfferItemSummary,
    val senderId: String,
    val receiverId: String,
    val dealId: String?,
    val createdAt: String?,
    val direction: OfferDirection,
)

data class OffersInbox(
    val incoming: List<OfferSummary>,
    val sent: List<OfferSummary>,
)

data class OfferActionOutcome(val dealId: String? = null)

data class OfferCreationContext(
    val requestedItem: OfferItemSummary,
    val myActiveItems: List<OfferItemSummary>,
    val receiverId: String,
)

data class CreatedOffer(val offerId: String)

sealed interface OffersResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : OffersResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : OffersResult<Nothing>
}

fun offerStatusLabel(status: String): String = when (status) {
    "pending" -> "مستني الرد"
    "thinking" -> "محتاج وقت للتفكير"
    "accepted" -> "اتقبل"
    "soft_rejected" -> "ما اتقبلش المرة دي"
    "redirected" -> "في اقتراح بديل"
    "withdrawn" -> "اتسحب"
    "expired" -> "انتهت صلاحيته"
    "cancelled_after_accept" -> "اتلغى بعد القبول"
    else -> status.ifBlank { "حالة غير معروفة" }
}
