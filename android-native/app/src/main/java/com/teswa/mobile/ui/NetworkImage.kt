package com.teswa.mobile.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private val imageMemoryCache = object : LruCache<String, Bitmap>(24) {}

@Composable
fun NetworkImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val normalized = url?.trim()?.takeIf { it.startsWith("https://") }
    var bitmap by remember(normalized) { mutableStateOf(normalized?.let(imageMemoryCache::get)) }
    var failed by remember(normalized) { mutableStateOf(false) }

    LaunchedEffect(normalized) {
        if (normalized == null || bitmap != null) return@LaunchedEffect
        val loaded = withContext(Dispatchers.IO) { loadBitmap(normalized) }
        if (loaded != null) {
            imageMemoryCache.put(normalized, loaded)
            bitmap = loaded
        } else {
            failed = true
        }
    }

    val current = bitmap
    if (current != null) {
        Image(
            bitmap = current.asImageBitmap(),
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
        )
    } else {
        Box(
            modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = if (failed || normalized == null) "بدون صورة" else "جاري تحميل الصورة…",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

private fun loadBitmap(url: String): Bitmap? {
    var connection: HttpURLConnection? = null
    return try {
        connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 6_000
            readTimeout = 10_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "image/*")
            setRequestProperty("User-Agent", "TeswaNative/Android")
        }
        if (connection.responseCode !in 200..299) return null
        connection.inputStream.use(BitmapFactory::decodeStream)
    } catch (_: Exception) {
        null
    } finally {
        connection?.disconnect()
    }
}
