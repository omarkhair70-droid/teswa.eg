package com.teswa.mobile.feature.safety

import com.teswa.mobile.auth.AuthSession

enum class ReportReason(val apiValue: String, val labelAr: String) {
    MISLEADING_ITEM("misleading_item", "معلومات مضللة عن العنصر"),
    INAPPROPRIATE_CONTENT("inappropriate_content", "محتوى غير مناسب"),
    SPAM_OFFER("spam_offer", "سبام أو عرض مزعج"),
    UNSAFE_BEHAVIOR("unsafe_behavior", "سلوك غير آمن"),
    NO_SHOW("no_show", "عدم الالتزام أو عدم الحضور"),
    HARASSMENT("harassment", "تحرش أو إساءة"),
    FRAUD("fraud", "احتيال أو محاولة خداع"),
    OTHER("other", "سبب آخر"),
}

sealed interface ReportTarget {
    val key: String
    val fallbackSubject: String

    data class User(val userId: String, override val fallbackSubject: String = "هذا المستخدم") : ReportTarget { override val key = "user:$userId" }
    data class Item(val itemId: String, override val fallbackSubject: String = "هذا العنصر") : ReportTarget { override val key = "item:$itemId" }
    data class Story(val storyId: String, override val fallbackSubject: String = "هذه القصة") : ReportTarget { override val key = "story:$storyId" }
    data class DirectMessage(val conversationId: String, val messageId: String, val reportedUserId: String, override val fallbackSubject: String = "هذه الرسالة") : ReportTarget { override val key = "direct:$conversationId:$messageId" }
    data class ContextualMessage(val conversationId: String, val messageId: String, val reportedUserId: String, override val fallbackSubject: String = "هذه الرسالة") : ReportTarget { override val key = "contextual:$conversationId:$messageId" }
    data class Deal(val dealId: String, override val fallbackSubject: String = "هذه الصفقة") : ReportTarget { override val key = "deal:$dealId" }
    data class DealMessage(val dealId: String, val messageId: String, override val fallbackSubject: String = "هذه الرسالة") : ReportTarget { override val key = "deal-message:$dealId:$messageId" }
}

data class PreparedReportContext(val subject: String, val preview: String? = null)

fun reasonsFor(target: ReportTarget): List<ReportReason> = when (target) {
    is ReportTarget.Item -> listOf(ReportReason.MISLEADING_ITEM, ReportReason.INAPPROPRIATE_CONTENT, ReportReason.FRAUD, ReportReason.UNSAFE_BEHAVIOR, ReportReason.OTHER)
    is ReportTarget.User -> listOf(ReportReason.HARASSMENT, ReportReason.INAPPROPRIATE_CONTENT, ReportReason.FRAUD, ReportReason.UNSAFE_BEHAVIOR, ReportReason.OTHER)
    is ReportTarget.Story -> listOf(ReportReason.INAPPROPRIATE_CONTENT, ReportReason.HARASSMENT, ReportReason.FRAUD, ReportReason.UNSAFE_BEHAVIOR, ReportReason.OTHER)
    is ReportTarget.DirectMessage, is ReportTarget.ContextualMessage -> listOf(ReportReason.HARASSMENT, ReportReason.SPAM_OFFER, ReportReason.FRAUD, ReportReason.UNSAFE_BEHAVIOR, ReportReason.INAPPROPRIATE_CONTENT, ReportReason.OTHER)
    is ReportTarget.Deal, is ReportTarget.DealMessage -> listOf(ReportReason.NO_SHOW, ReportReason.HARASSMENT, ReportReason.FRAUD, ReportReason.UNSAFE_BEHAVIOR, ReportReason.SPAM_OFFER, ReportReason.OTHER)
}

sealed interface ReportingResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : ReportingResult<T>
    data class Failure(val message: String, val session: AuthSession? = null, val unauthorized: Boolean = false, val network: Boolean = false) : ReportingResult<Nothing>
}
