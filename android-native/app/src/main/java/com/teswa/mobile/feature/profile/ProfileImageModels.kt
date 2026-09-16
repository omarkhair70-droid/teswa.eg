package com.teswa.mobile.feature.profile

enum class ProfileImageKind(val apiValue: String, val pathSegment: String) {
    AVATAR("avatar", "avatar"),
    COVER("cover", "cover"),
}

data class ProfileImageAsset(
    val uri: String,
    val displayName: String,
    val contentType: String,
    val sizeBytes: Long,
) {
    fun validate(): String? = when {
        contentType.lowercase() !in SUPPORTED_TYPES -> "نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WEBP."
        sizeBytes <= 0L -> "تعذر قراءة حجم الصورة."
        sizeBytes > MAX_BYTES -> "الصورة أكبر من 15 ميجابايت. اختار صورة أصغر."
        else -> null
    }

    companion object {
        const val MAX_BYTES = 15L * 1024L * 1024L
        val SUPPORTED_TYPES = setOf("image/jpeg", "image/png", "image/webp")
    }
}

data class ProfileImageMutation(
    val imageUrl: String?,
    val message: String,
    val cleanupComplete: Boolean = true,
)
