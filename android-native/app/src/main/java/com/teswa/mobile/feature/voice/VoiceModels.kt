package com.teswa.mobile.feature.voice

import com.teswa.mobile.auth.AuthSession
import java.io.File

data class VoiceDraft(
    val file: File,
    val durationMs: Int,
    val mimeType: String = "audio/m4a",
) {
    val sizeBytes: Long get() = file.length()

    fun validate(): String? = when {
        durationMs !in 500..120_000 -> "التسجيل لازم يكون بين نصف ثانية ودقيقتين."
        sizeBytes !in 1..15_728_640 -> "حجم التسجيل غير صالح."
        else -> null
    }

    fun discard() {
        file.delete()
    }
}

data class UploadedVoice(
    val objectKey: String,
    val durationMs: Int,
    val mimeType: String,
    val sizeBytes: Long,
)

sealed interface VoiceMediaResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : VoiceMediaResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val unauthorized: Boolean = false,
        val network: Boolean = false,
    ) : VoiceMediaResult<Nothing>
}
