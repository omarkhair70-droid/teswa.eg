package com.teswa.mobile.feature.dolab

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import com.teswa.mobile.feature.voice.VoiceDraft
import java.io.File
import java.io.FileNotFoundException

class DolabMediaResolver(private val context: Context) {
    private val resolver = context.contentResolver

    fun resolveImage(
        uri: Uri,
        fallbackName: String = "dolab-image.jpg",
        fallbackContentType: String? = null,
    ): DolabPendingMedia? {
        val contentType = (resolver.getType(uri) ?: fallbackContentType)?.lowercase() ?: return null
        if (contentType !in SUPPORTED_IMAGE_TYPES) return null
        var displayName = fallbackName
        var sizeBytes = -1L
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { column ->
                    displayName = cursor.getString(column)?.takeIf(String::isNotBlank) ?: displayName
                }
                cursor.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { column ->
                    if (!cursor.isNull(column)) sizeBytes = cursor.getLong(column)
                }
            }
        }
        if (sizeBytes <= 0L) {
            sizeBytes = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        }
        if (sizeBytes <= 0L) return null
        return DolabPendingMedia(
            uri = uri.toString(),
            displayName = displayName,
            mediaType = "image",
            mimeType = contentType,
            sizeBytes = sizeBytes,
            openStream = {
                resolver.openInputStream(uri)
                    ?: throw FileNotFoundException("The selected Dolab image is no longer available.")
            },
        )
    }

    fun resolveVideo(
        uri: Uri,
        fallbackName: String = "dolab-video.mp4",
    ): DolabPendingMedia? {
        val contentType = resolver.getType(uri)?.lowercase() ?: return null
        if (contentType !in SUPPORTED_VIDEO_TYPES) return null
        var displayName = fallbackName
        var sizeBytes = -1L
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { column ->
                    displayName = cursor.getString(column)?.takeIf(String::isNotBlank) ?: displayName
                }
                cursor.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { column ->
                    if (!cursor.isNull(column)) sizeBytes = cursor.getLong(column)
                }
            }
        }
        if (sizeBytes <= 0L) {
            sizeBytes = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        }
        if (sizeBytes <= 0L) return null
        return DolabPendingMedia(
            uri = uri.toString(),
            displayName = displayName,
            mediaType = "video",
            mimeType = contentType,
            sizeBytes = sizeBytes,
            openStream = {
                resolver.openInputStream(uri)
                    ?: throw FileNotFoundException("The selected Dolab video is no longer available.")
            },
        )
    }

    fun createCameraTarget(): DolabCameraTarget {
        // Reuse the already-whitelisted FileProvider cache directory instead of creating another media path.
        val directory = File(context.cacheDir, "listing-camera").apply { mkdirs() }
        val file = File.createTempFile("teswa-dolab-", ".jpg", directory)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return DolabCameraTarget(uri, file)
    }

    fun resolveVoice(draft: VoiceDraft): DolabPendingMedia? {
        if (draft.validate() != null || !draft.file.isFile) return null
        return DolabPendingMedia(
            uri = draft.file.toURI().toString(),
            displayName = draft.file.name,
            mediaType = "audio",
            mimeType = draft.mimeType,
            sizeBytes = draft.sizeBytes,
            durationMs = draft.durationMs.toLong(),
            openStream = { draft.file.inputStream() },
        )
    }

    companion object {
        val SUPPORTED_IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")
        val SUPPORTED_VIDEO_TYPES = setOf("video/mp4", "video/webm", "video/3gpp")
    }
}

data class DolabCameraTarget(val uri: Uri, val file: File) {
    fun discard() {
        file.delete()
    }
}
