package com.teswa.mobile.feature.profile

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream

fun interface ProfileImageContentSource {
    fun open(asset: ProfileImageAsset): InputStream
}

class AndroidProfileImageContentSource(
    private val resolver: ContentResolver,
) : ProfileImageContentSource {
    override fun open(asset: ProfileImageAsset): InputStream = resolver.openInputStream(asset.uri.toUri())
        ?: throw FileNotFoundException("The selected profile image is no longer available.")
}

class ProfileImageResolver(private val context: Context) {
    private val resolver = context.contentResolver

    fun resolve(uri: Uri, fallbackName: String): ProfileImageAsset? {
        val contentType = resolver.getType(uri)?.lowercase() ?: return null
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
        return ProfileImageAsset(uri.toString(), displayName, contentType, sizeBytes)
            .takeIf { it.validate() == null }
    }

    fun createCameraTarget(kind: ProfileImageKind): ProfileImageCameraTarget {
        val directory = File(context.cacheDir, "profile-camera").apply { mkdirs() }
        val file = File.createTempFile("teswa-${kind.pathSegment}-", ".jpg", directory)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return ProfileImageCameraTarget(uri, file)
    }
}

data class ProfileImageCameraTarget(val uri: Uri, val file: File) {
    fun discard() {
        file.delete()
    }
}
