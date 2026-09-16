package com.teswa.mobile.feature.additem

import com.teswa.mobile.auth.AuthSession


data class EditableListingImage(
    val id: String,
    val imageUrl: String,
    val isPrimary: Boolean,
    val sortOrder: Int?,
)

sealed interface EditListingImageDraft {
    data class Existing(val image: EditableListingImage) : EditListingImageDraft
    data class New(val image: AddItemImage) : EditListingImageDraft
}

data class EditableListing(
    val id: String,
    val status: String,
    val title: String,
    val categoryId: String?,
    val city: String?,
    val area: String?,
    val condition: ItemCondition,
    val conditionNotes: String?,
    val description: String?,
    val itemStory: String?,
    val swapReason: String?,
    val goodFor: String?,
    val desireMode: DesireMode,
    val desireText: String?,
    val wantedTags: List<String>,
    val images: List<EditableListingImage>,
)

data class EditListingBundle(
    val listing: EditableListing,
    val categories: List<AddItemCategory>,
)

data class EditListingDraft(
    val images: List<EditListingImageDraft>,
    val title: String,
    val categoryId: String?,
    val city: String,
    val area: String,
    val condition: ItemCondition,
    val conditionNotes: String,
    val description: String,
    val itemStory: String,
    val swapReason: String,
    val goodFor: String,
    val desireMode: DesireMode,
    val desireText: String,
    val wantedTags: List<String>,
) {
    fun validate(): String? = when {
        images.isEmpty() -> "لازم تحتفظ بصورة واحدة على الأقل."
        images.size > AddItemDraft.MAX_IMAGES -> "الحد الأقصى ${AddItemDraft.MAX_IMAGES} صور."
        images.filterIsInstance<EditListingImageDraft.New>().any {
            it.image.sizeBytes !in 1..AddItemDraft.MAX_IMAGE_BYTES
        } -> "في صورة جديدة حجمها غير صالح أو أكبر من الحد المسموح."
        images.filterIsInstance<EditListingImageDraft.New>().any {
            it.image.contentType !in AddItemDraft.SUPPORTED_IMAGE_TYPES
        } -> "استخدم صور JPG أو PNG أو WebP."
        title.trim().isEmpty() -> "اكتب اسم واضح للعنصر."
        title.trim().length > 160 -> "اسم العنصر لازم يكون 160 حرف أو أقل."
        categoryId.isNullOrBlank() -> "اختار الفئة المناسبة."
        description.length > 4_000 -> "الوصف أطول من الحد المسموح."
        conditionNotes.length > 1_000 -> "ملاحظات الحالة أطول من الحد المسموح."
        city.length > 120 -> "اسم المدينة لازم يكون 120 حرف أو أقل."
        area.length > 120 -> "اسم المنطقة لازم يكون 120 حرف أو أقل."
        itemStory.length > 600 -> "قصة العنصر لازم تكون 600 حرف أو أقل."
        swapReason.length > 240 -> "سبب التبديل لازم يكون 240 حرف أو أقل."
        goodFor.length > 240 -> "حقل مناسب لمين لازم يكون 240 حرف أو أقل."
        desireText.length > 1_000 -> "تفاصيل المقابل أطول من الحد المسموح."
        desireMode == DesireMode.SPECIFIC && desireText.isBlank() -> "اكتب الحاجة المحددة اللي بتدور عليها."
        else -> null
    }
}

fun EditableListing.toDraft(): EditListingDraft = EditListingDraft(
    images = images
        .sortedWith(compareBy<EditableListingImage> { if (it.isPrimary) 0 else 1 }.thenBy { it.sortOrder ?: Int.MAX_VALUE })
        .map(EditListingImageDraft::Existing),
    title = title,
    categoryId = categoryId,
    city = city.orEmpty(),
    area = area.orEmpty(),
    condition = condition,
    conditionNotes = conditionNotes.orEmpty(),
    description = description.orEmpty(),
    itemStory = itemStory.orEmpty(),
    swapReason = swapReason.orEmpty(),
    goodFor = goodFor.orEmpty(),
    desireMode = desireMode,
    desireText = desireText.orEmpty(),
    wantedTags = wantedTags,
)

fun <T> moveListingEntry(values: List<T>, from: Int, to: Int): List<T> {
    if (from !in values.indices || to !in values.indices || from == to) return values
    return values.toMutableList().apply { add(to, removeAt(from)) }
}

sealed interface EditListingResult<out T> {
    data class Success<T>(
        val value: T,
        val session: AuthSession,
        val storageCleanupWarning: Boolean = false,
    ) : EditListingResult<T>

    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
        val coreWasSaved: Boolean = false,
    ) : EditListingResult<Nothing>
}

sealed interface EditListingProgress {
    data class Uploading(val current: Int, val total: Int, val percent: Int) : EditListingProgress
    data object Saving : EditListingProgress
}
