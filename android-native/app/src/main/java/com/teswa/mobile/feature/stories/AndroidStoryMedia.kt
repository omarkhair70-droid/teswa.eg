package com.teswa.mobile.feature.stories

import android.content.ContentResolver
import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.net.toUri
import java.io.FileNotFoundException
import java.io.InputStream

class AndroidStoryContentSource(
    private val resolver: ContentResolver,
) : StoryContentSource {
    override fun open(media: StoryMediaSelection): InputStream =
        resolver.openInputStream(media.uri.toUri())
            ?: throw FileNotFoundException("The selected story media is no longer available.")
}

class StoryMediaResolver(context: Context) {
    private val resolver = context.contentResolver

    fun resolve(uri: Uri): StoryMediaSelection? {
        val contentType = resolver.getType(uri)?.lowercase()?.takeIf { it in StoryDraft.SUPPORTED_TYPES } ?: return null
        var displayName = if (contentType.startsWith("video/")) "story.mp4" else "story.jpg"
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
        if (sizeBytes !in 1..StoryDraft.MAX_BYTES) return null
        val metadata = if (contentType.startsWith("video/")) videoMetadata(uri) else imageMetadata(uri)
        return StoryMediaSelection(
            uri = uri.toString(),
            displayName = displayName,
            contentType = contentType,
            sizeBytes = sizeBytes,
            width = metadata.first,
            height = metadata.second,
            durationMs = metadata.third,
        )
    }

    private fun imageMetadata(uri: Uri): Triple<Int?, Int?, Int?> {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        runCatching { resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } }
        return Triple(options.outWidth.takeIf { it > 0 }, options.outHeight.takeIf { it > 0 }, null)
    }

    private fun videoMetadata(uri: Uri): Triple<Int?, Int?, Int?> {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(resolver.openFileDescriptor(uri, "r")?.fileDescriptor)
            Triple(
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()?.takeIf { it > 0 },
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()?.takeIf { it > 0 },
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                    ?.coerceAtMost(Int.MAX_VALUE.toLong())?.toInt()?.takeIf { it > 0 },
            )
        } catch (_: Exception) {
            Triple(null, null, null)
        } finally {
            retriever.release()
        }
    }
}
