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

    val paper = Color.rgb(251, 248, 243)
    val surface = Color.rgb(255, 253, 252)
    val ink = Color.rgb(33, 26, 23)
    val clay = Color.rgb(147, 72, 47)
    val sage = Color.rgb(70, 102, 91)
    val muted = Color.rgb(242, 232, 226)
    val outline = Color.rgb(136, 115, 106)
    canvas.drawColor(paper)

    // The share artifact behaves like one found object/photo on paper rather than a marketplace card.
    val photoPaper = RectF(54f, 54f, width - 54f, 874f)
    val photoPaperPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = surface }
    canvas.drawRoundRect(photoPaper, 42f, 42f, photoPaperPaint)

    val photo = RectF(84f, 84f, width - 84f, 806f)
    val image = item.images.firstOrNull()?.let(::downloadBitmap)
    if (image != null) {
        canvas.save()
        canvas.clipRoundRect(photo, 32f, 32f)
        drawCenterCrop(canvas, image, photo)
        canvas.restore()
        image.recycle()
    } else {
        val fieldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = muted }
        canvas.drawRoundRect(photo, 32f, 32f, fieldPaint)
        drawPossibleMark(canvas, left = 130f, top = 210f, size = 170f, color = clay)
        drawText(
            canvas = canvas,
            text = "الحاجة موجودة حتى لو الصورة مش موجودة",
            left = 130,
            top = 420,
            width = width - 260,
            textSize = 48f,
            color = sage,
            bold = true,
            maxLines = 2,
        )
    }

    // One archive label only: a trace, not a row of metadata pills.
    val place = listOfNotNull(item.city, item.area)
        .map(String::trim)
        .filter(String::isNotEmpty)
        .joinToString(" · ")
    val traceLabel = place.takeIf(String::isNotEmpty)
        ?: item.condition?.trim()?.takeIf(String::isNotEmpty)
        ?: "POSSIBILITY / TESWA"
    drawArchiveLabel(
        canvas = canvas,
        text = traceLabel,
        left = 108f,
        top = 770f,
        maxWidth = 640f,
        background = surface,
        ink = ink,
        outline = outline,
    )

    // Small authored opening mark + wordmark anchors the artifact without turning it into an ad banner.
    drawPossibleMark(canvas, left = 84f, top = 918f, size = 66f, color = clay)
    drawText(canvas, "تِسوى", 172, 920, width - 256, 42f, clay, true, 1)
    drawText(
        canvas,
        item.title.trim().ifBlank { "حاجة على تِسوى" },
        84,
        1000,
        width - 168,
        68f,
        ink,
        true,
        2,
    )

    val ownerLine = item.ownerDisplayName?.trim()?.takeIf(String::isNotEmpty)?.let { owner ->
        if (place.isNotBlank()) "عند $owner · $place" else "عند $owner"
    } ?: place
    if (ownerLine.isNotBlank()) {
        drawText(canvas, ownerLine, 84, 1168, width - 168, 34f, Color.rgb(83, 67, 60), false, 1)
    }

    val presentMeta = listOfNotNull(
        item.condition?.trim()?.takeIf(String::isNotEmpty),
        item.category?.trim()?.takeIf(String::isNotEmpty),
    ).joinToString(" · ")
    if (presentMeta.isNotBlank()) {
        drawText(canvas, presentMeta, 84, 1224, width - 168, 32f, clay, false, 1)
    }

    val exchangeCopy = item.desireText?.trim()?.takeIf(String::isNotEmpty)
        ?.let { "مفتوحة لـ: $it" }
        ?: "مفتوحة لاحتمال جديد مع حاجة تانية"
    val tracePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = clay
        strokeWidth = 5f
        strokeCap = Paint.Cap.ROUND
    }
    canvas.drawLine(86f, 1310f, 148f, 1310f, tracePaint)
    drawText(canvas, exchangeCopy, 172, 1282, width - 256, 38f, sage, true, 2)

    drawText(
        canvas,
        "OBJECT WITH A PAST · OBJECT WITH A NEXT",
        84,
        1435,
        width - 168,
        24f,
        Color.rgb(112, 92, 83),
        false,
        1,
    )

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

private fun drawArchiveLabel(
    canvas: Canvas,
    text: String,
    left: Float,
    top: Float,
    maxWidth: Float,
    background: Int,
    ink: Int,
    outline: Int,
) {
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = ink
        textSize = 27f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val measured = textPaint.measureText(text).coerceAtMost(maxWidth - 44f)
    val rect = RectF(left, top, left + measured + 44f, top + 58f)
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = background }
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(80, Color.red(outline), Color.green(outline), Color.blue(outline))
        style = Paint.Style.STROKE
        strokeWidth = 2f
    }
    canvas.drawRoundRect(rect, 14f, 14f, fill)
    canvas.drawRoundRect(rect, 14f, 14f, stroke)
    canvas.drawText(text, left + 22f, top + 38f, textPaint)
}

private fun drawPossibleMark(canvas: Canvas, left: Float, top: Float, size: Float, color: Int) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeWidth = (size * .055f).coerceAtLeast(3f)
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    val x0 = left + size * .08f
    val x1 = left + size * .55f
    val y0 = top + size * .16f
    val y1 = top + size * .84f
    canvas.drawLine(x0, y0, x0, y1, paint)
    canvas.drawLine(x0, y0, x1, y0, paint)
    canvas.drawLine(x0, y1, x1, y1, paint)
    val objectRect = RectF(
        left + size * .42f,
        top + size * .36f,
        left + size * .76f,
        top + size * .70f,
    )
    canvas.drawRoundRect(objectRect, size * .07f, size * .07f, paint)
    canvas.drawLine(left + size * .62f, top + size * .53f, left + size * .92f, top + size * .53f, paint)
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
