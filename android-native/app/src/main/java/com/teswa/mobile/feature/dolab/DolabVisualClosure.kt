package com.teswa.mobile.feature.dolab

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.LocalContentImage
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import kotlinx.coroutines.launch

/**
 * Real-device visual closure for MINE.
 *
 * The screen must read as a private collection first, not a listings dashboard:
 * object -> private shelf -> lifecycle -> public threshold.
 */
@Composable
internal fun DolabPrivateMasthead(
    holder: DolabStateHolder,
    onCreate: () -> Unit,
) {
    val items = holder.workspace()?.items.orEmpty()
    val ready = items.count { it.status == DolabItemStatus.READY }

    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.Mine,
                color = MaterialTheme.colorScheme.primary,
                size = 34.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "دولابي",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = when {
                        items.isEmpty() -> "كل حاجة تبدأ هنا"
                        ready > 0 -> "${items.size} حاجات عندك · ${ready} جاهزين للّعب"
                        else -> "${items.size} حاجات عندك"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onCreate) {
                Text("حط حاجة", fontWeight = FontWeight.SemiBold)
            }
        }

        DolabLifecycleRail(
            selected = holder.filter,
            onSelect = holder::selectFilter,
        )
    }
}

@Composable
private fun DolabLifecycleRail(
    selected: DolabFilter,
    onSelect: (DolabFilter) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
        verticalAlignment = Alignment.Bottom,
    ) {
        DolabFilter.entries.forEach { filter ->
            val active = selected == filter
            Column(
                modifier = Modifier
                    .clickable { onSelect(filter) }
                    .padding(vertical = TeswaSpacing.xs),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Text(
                    text = dolabFilterLabel(filter),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                Box(
                    modifier = Modifier
                        .height(2.dp)
                        .fillMaxWidth()
                        .background(
                            if (active) MaterialTheme.colorScheme.primary else Color.Transparent,
                            RoundedCornerShape(999.dp),
                        ),
                )
            }
        }
    }
}

@Composable
internal fun DolabPrivateCollection(
    holder: DolabStateHolder,
    items: List<DolabItem>,
    onOpen: (DolabItem) -> Unit,
) {
    val workspace = holder.workspace()
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
    ) {
        if (holder.filter != DolabFilter.ALL) {
            Text(
                text = dolabFilterHint(holder.filter),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        DolabShelfSnapshot(
            holder = holder,
            item = items.first(),
            media = workspace?.mediaFor(items.first().id).orEmpty(),
            notesCount = workspace?.notesFor(items.first().id)?.size ?: 0,
            large = true,
            onOpen = { onOpen(items.first()) },
        )

        if (items.size > 1) {
            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .7f),
                thickness = 1.dp,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                verticalAlignment = Alignment.Top,
            ) {
                items.drop(1).take(2).forEach { item ->
                    DolabShelfSnapshot(
                        holder = holder,
                        item = item,
                        media = workspace?.mediaFor(item.id).orEmpty(),
                        notesCount = workspace?.notesFor(item.id)?.size ?: 0,
                        large = false,
                        onOpen = { onOpen(item) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (items.size == 2) Spacer(Modifier.weight(1f))
            }
        }

        items.drop(3).forEach { item ->
            DolabDenseObject(
                holder = holder,
                item = item,
                media = workspace?.mediaFor(item.id).orEmpty(),
                notesCount = workspace?.notesFor(item.id)?.size ?: 0,
                onOpen = { onOpen(item) },
            )
        }
    }
}

@Composable
private fun DolabShelfSnapshot(
    holder: DolabStateHolder,
    item: DolabItem,
    media: List<DolabMedia>,
    notesCount: Int,
    large: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val firstImage = media.firstOrNull { it.mediaType == "image" }
    var imageUrl by remember(firstImage?.id, firstImage?.storagePath) { mutableStateOf<String?>(null) }

    LaunchedEffect(firstImage?.id, firstImage?.storagePath) {
        imageUrl = firstImage?.let { holder.mediaUrl(it) }
    }

    Column(
        modifier = modifier.clickable(onClick = onOpen),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(if (large) 248.dp else 156.dp)
                .clip(RoundedCornerShape(if (large) TeswaRadius.hero else TeswaRadius.lg))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)),
        ) {
            if (imageUrl != null) {
                NetworkImage(
                    url = imageUrl,
                    contentDescription = item.title ?: "حاجة من دولابك",
                    modifier = Modifier.fillMaxWidth().height(if (large) 248.dp else 156.dp),
                )
            } else {
                TeswaMarkIcon(
                    mark = TeswaMark.Mine,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = .55f),
                    size = if (large) 58.dp else 42.dp,
                    modifier = Modifier.align(Alignment.Center),
                )
            }

            TeswaArchiveLabel(
                text = dolabStatusLabel(item.status),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(TeswaSpacing.sm),
            )

            if (item.status == DolabItemStatus.PUBLISHED) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = TeswaSpacing.md)
                        .size(width = 42.dp, height = 3.dp)
                        .background(
                            MaterialTheme.colorScheme.primary,
                            RoundedCornerShape(999.dp),
                        ),
                )
            }
        }

        Text(
            text = item.title?.takeIf(String::isNotBlank) ?: "حاجة من غير اسم",
            style = if (large) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        val trace = buildList {
            item.category?.takeIf(String::isNotBlank)?.let(::add)
            if (media.isNotEmpty()) add("${media.size} ميديا")
            if (notesCount > 0) add("${notesCount} ملاحظات")
        }.joinToString(" · ")
        if (trace.isNotBlank()) {
            Text(
                text = trace,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun DolabDenseObject(
    holder: DolabStateHolder,
    item: DolabItem,
    media: List<DolabMedia>,
    notesCount: Int,
    onOpen: () -> Unit,
) {
    val firstImage = media.firstOrNull { it.mediaType == "image" }
    var imageUrl by remember(firstImage?.id, firstImage?.storagePath) { mutableStateOf<String?>(null) }

    LaunchedEffect(firstImage?.id, firstImage?.storagePath) {
        imageUrl = firstImage?.let { holder.mediaUrl(it) }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(78.dp)
                .clip(RoundedCornerShape(TeswaRadius.md))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f)),
            contentAlignment = Alignment.Center,
        ) {
            if (imageUrl != null) {
                NetworkImage(
                    url = imageUrl,
                    contentDescription = item.title ?: "حاجة من دولابك",
                    modifier = Modifier.size(78.dp),
                )
            } else {
                TeswaMarkIcon(
                    mark = TeswaMark.Mine,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = .55f),
                    size = 32.dp,
                )
            }
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
        ) {
            Text(
                text = item.title?.takeIf(String::isNotBlank) ?: "حاجة من غير اسم",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = buildList {
                    add(dolabStatusLabel(item.status))
                    if (notesCount > 0) add("${notesCount} ملاحظات")
                }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun DolabObjectCaptureSheet(
    holder: DolabStateHolder,
    onDismiss: () -> Unit,
    onCreated: (String) -> Unit,
) {
    val context = LocalContext.current
    val resolver = remember(context) { DolabMediaResolver(context) }
    val scope = rememberCoroutineScope()

    var pending by remember { mutableStateOf<DolabPendingMedia?>(null) }
    var title by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var localMessage by remember { mutableStateOf<String?>(null) }
    var cameraTarget by remember { mutableStateOf<DolabCameraTarget?>(null) }

    fun acceptUri(uri: android.net.Uri) {
        val resolved = resolver.resolveImage(uri)
        if (resolved == null) {
            localMessage = "الصورة دي مش متاحة أو نوعها مش مدعوم."
        } else {
            pending = resolved
            localMessage = null
        }
    }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            acceptUri(uri)
        }
    }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val target = cameraTarget
        if (saved && target != null) {
            val resolved = resolver.resolveImage(
                target.uri,
                fallbackName = target.file.name,
                fallbackContentType = "image/jpeg",
            )
            if (resolved == null) {
                target.discard()
                cameraTarget = null
                localMessage = "الصورة اللي اتصورت مش متاحة للحفظ."
            } else {
                pending = resolved
                localMessage = null
            }
        } else {
            target?.discard()
            cameraTarget = null
        }
    }

    DisposableEffect(Unit) {
        onDispose { cameraTarget?.discard() }
    }

    TeswaActionSheet(
        title = if (pending == null) "حط حاجة في دولابك" else "دي الحاجة",
        supporting = if (pending == null) {
            "ابدأ بالحاجة نفسها. صورة الأول، والتفاصيل تيجي بعدها."
        } else {
            "لسه خاصة بيك. سمّيها دلوقتي، وكمل أثرها براحتك بعد ما تدخل الدولاب."
        },
        onDismiss = { if (!holder.creating && holder.workingId == null) onDismiss() },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md)) {
            val current = pending
            if (current == null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1.45f)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .38f),
                            RoundedCornerShape(TeswaRadius.hero),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                    ) {
                        TeswaMarkIcon(
                            mark = TeswaMark.Mine,
                            color = MaterialTheme.colorScheme.primary,
                            size = 56.dp,
                        )
                        Text(
                            text = "الحاجة الأول",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                TeswaPrimaryAction(
                    text = "صورها دلوقتي",
                    onClick = {
                        runCatching { resolver.createCameraTarget() }
                            .onSuccess { target ->
                                cameraTarget = target
                                camera.launch(target.uri)
                            }
                            .onFailure { localMessage = "تعذر فتح الكاميرا دلوقتي." }
                    },
                )
                TeswaSecondaryAction(
                    text = "اختار من الصور",
                    onClick = { gallery.launch(DolabMediaResolver.SUPPORTED_IMAGE_TYPES.toTypedArray()) },
                )
            } else {
                LocalContentImage(
                    uri = current.uri,
                    contentDescription = title.ifBlank { "الحاجة اللي اخترتها" },
                    resolver = context.contentResolver,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(.92f)
                        .clip(RoundedCornerShape(TeswaRadius.hero)),
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                ) {
                    TeswaSecondaryAction(
                        text = "صورة تانية",
                        onClick = { gallery.launch(DolabMediaResolver.SUPPORTED_IMAGE_TYPES.toTypedArray()) },
                        modifier = Modifier.weight(1f),
                    )
                    TeswaSecondaryAction(
                        text = "صور من جديد",
                        onClick = {
                            runCatching { resolver.createCameraTarget() }
                                .onSuccess { target ->
                                    cameraTarget?.discard()
                                    cameraTarget = target
                                    camera.launch(target.uri)
                                }
                                .onFailure { localMessage = "تعذر فتح الكاميرا دلوقتي." }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }

                TeswaTextField(
                    value = title,
                    onValueChange = { title = it.take(160) },
                    label = "بتسميها إيه؟",
                    enabled = !holder.creating && holder.workingId == null,
                )
                TeswaTextField(
                    value = note,
                    onValueChange = { note = it.take(4_000) },
                    label = "ملاحظة ليك · اختياري",
                    singleLine = false,
                    minLines = 2,
                    maxLines = 4,
                    enabled = !holder.creating && holder.workingId == null,
                )

                TeswaPrimaryAction(
                    text = if (holder.workingId != null) "بنحفظ الصورة…" else "حفظها في دولابي",
                    loading = holder.creating || holder.workingId != null,
                    enabled = title.isNotBlank() && !holder.creating && holder.workingId == null,
                    onClick = {
                        scope.launch {
                            val before = holder.workspace()?.items.orEmpty().mapTo(mutableSetOf()) { it.id }
                            val created = if (
                                holder.create(
                                    DolabItemDraft(
                                        title = title.trim(),
                                        description = note.trim(),
                                    ),
                                )
                            ) {
                                holder.workspace()?.items?.firstOrNull { it.id !in before }
                            } else {
                                null
                            }

                            if (created != null) {
                                holder.addMedia(created, current)
                                onCreated(created.id)
                            }
                        }
                    },
                )
            }

            localMessage?.let {
                TeswaInlineMessage(
                    title = "الصورة مكملتش",
                    body = it,
                    emphasis = TeswaEmphasis.Strong,
                )
            }
        }
    }
}

private fun dolabFilterLabel(filter: DolabFilter): String = when (filter) {
    DolabFilter.ALL -> "الكل"
    DolabFilter.IN_PROGRESS -> "بجهزها"
    DolabFilter.READY -> "جاهزة"
    DolabFilter.PUBLISHED -> "في اللعب"
    DolabFilter.ARCHIVED -> "أرشيف"
}

private fun dolabFilterHint(filter: DolabFilter): String = when (filter) {
    DolabFilter.ALL -> ""
    DolabFilter.IN_PROGRESS -> "لسه خاصة بيك وبتاخد شكلها."
    DolabFilter.READY -> "جاهزة، ولسه قرار خروجها بإيدك."
    DolabFilter.PUBLISHED -> "عدّت حدود الدولاب وبقت في اللعب."
    DolabFilter.ARCHIVED -> "متحفظة بهدوء، ولسه جزء من تاريخها."
}

private fun dolabStatusLabel(status: DolabItemStatus): String = when (status) {
    DolabItemStatus.DRAFT -> "لسه بتتجهز"
    DolabItemStatus.READY -> "جاهزة"
    DolabItemStatus.PUBLISHED -> "في اللعب"
    DolabItemStatus.EXCHANGED -> "اتبدّلت"
    DolabItemStatus.ARCHIVED -> "في الأرشيف"
    DolabItemStatus.UNKNOWN -> "محفوظة"
}
