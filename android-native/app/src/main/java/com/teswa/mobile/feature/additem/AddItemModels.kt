package com.teswa.mobile.feature.additem

import com.teswa.mobile.auth.AuthSession

data class AddItemCategory(
    val id: String,
    val nameAr: String,
)

data class AddItemImage(
    val uri: String,
    val displayName: String,
    val contentType: String,
    val sizeBytes: Long,
)

enum class ItemCondition(val apiValue: String, val label: String) {
    ALMOST_NEW("almost_new", "شبه جديد"),
    GOOD_USED("good_used", "مستعمل بحالة كويسة"),
    MINOR_ISSUES("minor_issues", "فيه ملاحظات بسيطة"),
    NEEDS_REPAIR("needs_repair", "محتاج تصليح"),
}

enum class DesireMode(val apiValue: String, val label: String) {
    SPECIFIC("specific", "حاجة محددة"),
    FLEXIBLE("flexible", "مرن في الاختيار"),
    SURPRISE("surprise", "مفتوح للمفاجآت"),
}

data class AddItemDraft(
    val images: List<AddItemImage> = emptyList(),
    val title: String = "",
    val categoryId: String? = null,
    val city: String = "",
    val area: String = "",
    val locationLatitude: Double? = null,
    val locationLongitude: Double? = null,
    val condition: ItemCondition = ItemCondition.GOOD_USED,
    val conditionNotes: String = "",
    val description: String = "",
    val itemStory: String = "",
    val swapReason: String = "",
    val goodFor: String = "",
    val desireMode: DesireMode = DesireMode.FLEXIBLE,
    val desireText: String = "",
) {
    fun validate(): String? = when {
        images.isEmpty() -> "اختار صورة واحدة على الأقل."
        images.size > MAX_IMAGES -> "الحد الأقصى $MAX_IMAGES صور."
        images.any { it.sizeBytes !in 1..MAX_IMAGE_BYTES } -> "في صورة حجمها غير صالح أو أكبر من الحد المسموح."
        images.any { it.contentType !in SUPPORTED_IMAGE_TYPES } -> "استخدم صور JPG أو PNG أو WebP."
        title.trim().isEmpty() -> "اكتب اسم واضح للعنصر."
        title.trim().length > 160 -> "اسم العنصر لازم يكون 160 حرف أو أقل."
        categoryId.isNullOrBlank() -> "اختار الفئة المناسبة."
        description.length > 4_000 -> "الوصف أطول من الحد المسموح."
        conditionNotes.length > 1_000 -> "ملاحظات الحالة أطول من الحد المسموح."
        city.length > 120 -> "اسم المدينة لازم يكون 120 حرف أو أقل."
        area.length > 120 -> "اسم المنطقة لازم يكون 120 حرف أو أقل."
        (locationLatitude == null) != (locationLongitude == null) -> "بيانات الموقع غير مكتملة."
        locationLatitude != null && (!locationLatitude.isFinite() || locationLatitude !in -90.0..90.0) -> "خط العرض غير صالح."
        locationLongitude != null && (!locationLongitude.isFinite() || locationLongitude !in -180.0..180.0) -> "خط الطول غير صالح."
        itemStory.length > 600 -> "قصة العنصر لازم تكون 600 حرف أو أقل."
        swapReason.length > 240 -> "سبب التبديل لازم يكون 240 حرف أو أقل."
        goodFor.length > 240 -> "حقل مناسب لمين لازم يكون 240 حرف أو أقل."
        desireText.length > 1_000 -> "تفاصيل المقابل أطول من الحد المسموح."
        desireMode == DesireMode.SPECIFIC && desireText.isBlank() -> "اكتب الحاجة المحددة اللي بتدور عليها."
        else -> null
    }

    companion object {
        const val MAX_IMAGES = 4
        const val MAX_IMAGE_BYTES = 25L * 1024L * 1024L
        val SUPPORTED_IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")
    }
}

sealed interface AddItemResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : AddItemResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : AddItemResult<Nothing>
}

data class PublishedItem(val itemId: String)

sealed interface AddItemPublishProgress {
    data class Uploading(val current: Int, val total: Int, val percent: Int) : AddItemPublishProgress
    data object SavingListing : AddItemPublishProgress
}
