package com.teswa.mobile.home

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.text.Layout
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal const val TESWA_PUBLIC_ITEM_BASE_URL = "https://teswa.eg/item"

internal fun canonicalItemUrl(itemId: String): String =
    "$TESWA_PUBLIC_ITEM_BASE_URL/${URLEncoder.encode(itemId, StandardCharsets.UTF_8.name()).replace("+", "%20")}"

internal fun itemShareCaption(item: ItemDetail): String = buildString {
    append(item.title.trim().ifBlank { "حاجة على تِسوى" })
    append(" على تِسوى\n")
    item.desireText?.trim()?.takeIf(String::isNotEmpty)?.let {
        append("مفتوحة للتبديل: ")
        append(it)
        append('\n')
    }
    append("شوف الحاجة وقدّم عرضك من هنا:\n")
    append(canonicalItemUrl(item.id))
}

/** Opens Android's system Sharesheet. Image creation is best effort; the HTTPS URL is never lost. */
internal suspend fun sharePublicItem(context: Context, item: ItemDetail): Boolean {
    val caption = itemShareCaption(item)
    val imageUri = withContext(Dispatchers.IO) {
        runCatching { createShareImage(context.applicationContext, item) }.getOrNull()
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = if (imageUri != null) "image/png" else "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, item.title)
        putExtra(Intent.EXTRA_TEXT, caption)
        if (imageUri != null) {
            putExtra(Intent.EXTRA_STREAM, imageUri)
            clipData = ClipData.newUri(context.contentResolver, item.title, imageUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }
    context.startActivity(Intent.createChooser(send, "شارك الحاجة على تِسوى"))
    return imageUri != null
}

private fun createShareImage(context: Context, item: ItemDetail): Uri {
    val width = 1200
    val height = 1500
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.rgb(251, 248, 243))

    val imageBottom = 820f
    val image = item.images.firstOrNull()?.let(::downloadBitmap)
    if (image != null) {
        drawCenterCrop(canvas, image, RectF(0f, 0f, width.toFloat(), imageBottom))
        image.recycle()
    } else {
        val fieldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(242, 232, 226) }
        canvas.drawRect(0f, 0f, width.toFloat(), imageBottom, fieldPaint)
        drawText(
            canvas = canvas,
            text = "احتمال جديد لحاجة موجودة فعلًا",
            left = 96,
            top = 330,
            width = width - 192,
            textSize = 54f,
            color = Color.rgb(70, 102, 91),
            bold = true,
            maxLines = 2,
        )
    }

    val clay = Color.rgb(147, 72, 47)
    drawText(canvas, "تِسوى", 84, 858, width - 168, 46f, clay, true, 1)
    drawText(
        canvas,
        item.title.trim().ifBlank { "حاجة على تِسوى" },
        84,
        930,
        width - 168,
        72f,
        Color.rgb(33, 26, 23),
        true,
        2,
    )

    val meta = listOfNotNull(
        item.condition?.trim()?.takeIf(String::isNotEmpty),
        item.category?.trim()?.takeIf(String::isNotEmpty),
        listOfNotNull(item.city, item.area)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .joinToString(" · ")
            .takeIf(String::isNotEmpty),
    ).joinToString("  •  ")
    if (meta.isNotBlank()) {
        drawText(canvas, meta, 84, 1110, width - 168, 38f, Color.rgb(93, 79, 72), false, 2)
    }

    val exchangeCopy = item.desireText?.trim()?.takeIf(String::isNotEmpty)
        ?.let { "مفتوحة للتبديل: $it" }
        ?: "حاجة عامة مفتوحة لاحتمال تبديل واضح"
    drawText(canvas, exchangeCopy, 84, 1240, width - 168, 40f, Color.rgb(70, 102, 91), true, 2)
    drawText(canvas, "الحاجة أولًا · العرض هو لحظة الالتزام", 84, 1410, width - 168, 30f, clay, false, 1)

    val directory = File(context.cacheDir, "item-share").apply { mkdirs() }
    directory.listFiles()?.filter { it.name.startsWith("teswa-item-") }?.forEach { old ->
        if (System.currentTimeMillis() - old.lastModified() > SHARE_FILE_MAX_AGE_MS) old.delete()
    }
    val safeId = item.id.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val output = File(directory, "teswa-item-$safeId.png")
    FileOutputStream(output).use { stream ->
        check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) { "Unable to encode share image." }
    }
    bitmap.recycle()
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", output)
}

private fun downloadBitmap(value: String): Bitmap? {
    val connection = (URL(value).openConnection() as? HttpURLConnection) ?: return null
    return try {
        connection.connectTimeout = 8_000
        connection.readTimeout = 12_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Accept", "image/*")
        if (connection.responseCode !in 200..299) return null
        val declaredLength = connection.contentLengthLong
        if (declaredLength > MAX_SHARE_SOURCE_BYTES) return null
        val bytes = connection.inputStream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_SHARE_SOURCE_BYTES) return null
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } finally {
        connection.disconnect()
    }
}

private fun drawCenterCrop(canvas: Canvas, bitmap: Bitmap, destination: RectF) {
    val destinationRatio = destination.width() / destination.height()
    val sourceRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
    val source = if (sourceRatio > destinationRatio) {
        val cropWidth = (bitmap.height * destinationRatio).toInt()
        val left = (bitmap.width - cropWidth) / 2
        Rect(left, 0, left + cropWidth, bitmap.height)
    } else {
        val cropHeight = (bitmap.width / destinationRatio).toInt()
        val top = (bitmap.height - cropHeight) / 2
        Rect(0, top, bitmap.width, top + cropHeight)
    }
    canvas.drawBitmap(bitmap, source, destination, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
}

private fun drawText(
    canvas: Canvas,
    text: String,
    left: Int,
    top: Int,
    width: Int,
    textSize: Float,
    color: Int,
    bold: Boolean,
    maxLines: Int,
) {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        this.textSize = textSize
        this.color = color
        typeface = if (bold) Typeface.create(Typeface.DEFAULT, Typeface.BOLD) else Typeface.DEFAULT
    }
    val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
        .setAlignment(Layout.Alignment.ALIGN_OPPOSITE)
        .setTextDirection(TextDirectionHeuristics.RTL)
        .setIncludePad(false)
        .setMaxLines(maxLines)
        .setEllipsize(android.text.TextUtils.TruncateAt.END)
        .build()
    canvas.save()
    canvas.translate(left.toFloat(), top.toFloat())
    layout.draw(canvas)
    canvas.restore()
}

private const val MAX_SHARE_SOURCE_BYTES = 12 * 1024 * 1024
private const val SHARE_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000L
