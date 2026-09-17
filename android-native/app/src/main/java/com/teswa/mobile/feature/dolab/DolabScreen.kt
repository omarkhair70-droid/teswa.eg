package com.teswa.mobile.feature.dolab

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectRow
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaScreenHeading
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
import kotlinx.coroutines.launch

@Composable
fun DolabScreen(
    initialSession: AuthSession,
    repository: DolabRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onContinueAsListing: (suspend (DolabItem) -> String?)? = null,
    onFocusedStateChanged: (Boolean) -> Unit = {},
) {
    val holder = remember(initialSession.user.id, repository) { DolabStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()
    var selectedItemId by remember { mutableStateOf<String?>(null) }
    var showCreate by remember { mutableStateOf(false) }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        if (holder.workspace() == null) holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    val selected = selectedItemId?.let { id -> holder.workspace()?.items?.firstOrNull { it.id == id } }
    if (selectedItemId != null && selected == null && holder.workspace() != null) selectedItemId = null

    LaunchedEffect(selected != null) {
        onFocusedStateChanged(selected != null)
    }

    if (selected != null) {
        DolabItemDetail(
            holder = holder,
            item = selected,
            onBack = { selectedItemId = null },
            onDeleted = { selectedItemId = null },
            onContinueAsListing = onContinueAsListing,
            modifier = modifier,
        )
    } else {
        DolabShelf(
            holder = holder,
            onCreate = { showCreate = true },
            onOpen = { selectedItemId = it.id },
            modifier = modifier,
        )
    }

    if (showCreate) {
        DolabCreateDialog(
            busy = holder.creating,
            onDismiss = { if (!holder.creating) showCreate = false },
            onCreate = { draft ->
                scope.launch {
                    if (holder.create(draft)) showCreate = false
                }
            },
        )
    }
}

@Composable
private fun DolabShelf(
    holder: DolabStateHolder,
    onCreate: () -> Unit,
    onOpen: (DolabItem) -> Unit,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    val workspace = holder.workspace()

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = TeswaLayout.ScreenHorizontal,
            vertical = TeswaLayout.ScreenVertical,
        ),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
    ) {
        item {
            TeswaScreenHeading(
                title = "دولابي",
                eyebrow = "حاجاتي",
                supporting = "مساحتك الخاصة. الحاجة تبدأ هنا عندك قبل ما تختار تحطها في اللعب.",
            )
        }

        item {
            TeswaInlineMessage(
                title = "هنا الحاجة لسه بتاعتك إنت",
                body = "احفظ صورة أو فكرة أو ملاحظة، جهّز الحاجة براحتك، وبعدها إنت اللي تقرر إمتى تبقى احتمال بينك وبين حد تاني.",
                emphasis = TeswaEmphasis.Normal,
                icon = TeswaIcons.Mine,
                actionLabel = "احفظ حاجة",
                onAction = onCreate,
            )
        }

        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                DolabFilter.entries.forEach { filter ->
                    TeswaChoiceChip(
                        label = filterLabel(filter),
                        selected = holder.filter == filter,
                        onClick = { holder.selectFilter(filter) },
                    )
                }
            }
        }

        holder.message?.let { value ->
            item {
                DolabMessage(value, holder.messageIsError)
            }
        }

        when (val state = holder.state) {
            DolabUiState.Loading -> item {
                TeswaInlineLoading("بنفتح دولابك…")
            }

            is DolabUiState.Error -> item {
                TeswaInlineMessage(
                    title = "الدولاب ما اتفتحش",
                    body = state.message,
                    emphasis = TeswaEmphasis.Strong,
                    actionLabel = "حاول تاني",
                    onAction = { scope.launch { holder.load() } },
                )
            }

            is DolabUiState.Empty -> item {
                TeswaInlineMessage(
                    title = "الدولاب فاضي دلوقتي",
                    body = "ابدأ بحاجة واحدة حتى لو لسه مش ناوي تعرضها. الدولاب مكان تجهيز وذاكرة قبل النشر.",
                    actionLabel = "احفظ أول حاجة",
                    onAction = onCreate,
                )
            }

            is DolabUiState.Ready -> {
                val visible = holder.visibleItems()
                if (visible.isEmpty()) {
                    item {
                        TeswaInlineMessage(
                            title = "مفيش حاجة في الجزء ده",
                            body = "غيّر الفلتر أو ارجع للكل عشان تشوف باقي دولابك.",
                        )
                    }
                } else {
                    item {
                        TeswaSectionHeader(
                            title = when (holder.filter) {
                                DolabFilter.ALL -> "كل حاجاتك"
                                DolabFilter.IN_PROGRESS -> "لسه بتجهزها"
                                DolabFilter.READY -> "جاهزة للخطوة الجاية"
                                DolabFilter.PUBLISHED -> "خرجت للّعب"
                                DolabFilter.ARCHIVED -> "الأرشيف"
                            },
                        )
                    }
                    items(visible, key = { it.id }) { item ->
                        DolabItemRow(
                            item = item,
                            mediaCount = workspace?.mediaFor(item.id)?.size ?: 0,
                            notesCount = workspace?.notesFor(item.id)?.size ?: 0,
                            onOpen = { onOpen(item) },
                        )
                    }
                }
            }
        }

        if (workspace != null && holder.state !is DolabUiState.Loading) {
            item {
                TeswaSecondaryAction(
                    text = if (holder.refreshing) "بنحدّث دولابك…" else "حدّث دولابي",
                    icon = TeswaIcons.Refresh,
                    enabled = !holder.refreshing,
                    onClick = { scope.launch { holder.load(refresh = true) } },
                )
            }
        }
    }
}

@Composable
private fun DolabItemRow(
    item: DolabItem,
    mediaCount: Int,
    notesCount: Int,
    onOpen: () -> Unit,
) {
    val meta = buildList {
        item.category?.takeIf { it.isNotBlank() }?.let(::add)
        if (mediaCount > 0) add("$mediaCount ميديا")
        if (notesCount > 0) add("$notesCount ملاحظات")
    }.joinToString(" • ")

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
    ) {
        TeswaObjectRow(
            item = TeswaObjectIdentity(
                title = item.title?.takeIf { it.isNotBlank() } ?: "حاجة من غير اسم",
                meta = meta.takeIf { it.isNotBlank() },
            ),
            state = statusLabel(item.status),
            stateEmphasis = statusEmphasis(item.status),
            onClick = onOpen,
        )
        item.description?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = TeswaSpacing.xxl + TeswaSpacing.xxl + TeswaSpacing.sm),
            )
        }
    }
}

@Composable
private fun DolabItemDetail(
    holder: DolabStateHolder,
    item: DolabItem,
    onBack: () -> Unit,
    onDeleted: () -> Unit,
    onContinueAsListing: (suspend (DolabItem) -> String?)?,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val mediaResolver = remember(context) { DolabMediaResolver(context) }
    val scope = rememberCoroutineScope()
    var draft by remember(item.id, item.updatedAt, item.status) { mutableStateOf(item.toDraft()) }
    var note by remember(item.id) { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    var cameraTarget by remember(item.id) { mutableStateOf<DolabCameraTarget?>(null) }
    var continueWorking by remember(item.id) { mutableStateOf(false) }
    val workspace = holder.workspace() ?: DolabWorkspace(emptyList(), emptyList(), emptyList())
    val notes = workspace.notesFor(item.id)
    val media = workspace.mediaFor(item.id)
    val holderBusy = holder.workingId == item.id
    val busy = holderBusy || continueWorking
    val uploadProgress = holder.mediaUploadProgress?.takeIf { it.itemId == item.id }?.percent

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { uri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        scope.launch {
            for (uri in uris) {
                val pending = mediaResolver.resolveImage(uri)
                if (pending == null) {
                    holder.showError("الصورة دي مش JPG أو PNG أو WebP، أو مش قادرين نقراها.")
                    break
                }
                if (!holder.addMedia(item, pending)) break
            }
        }
    }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val target = cameraTarget
        cameraTarget = null
        if (!saved || target == null) {
            target?.discard()
        } else {
            scope.launch {
                val pending = mediaResolver.resolveImage(
                    target.uri,
                    fallbackName = target.file.name,
                    fallbackContentType = "image/jpeg",
                )
                if (pending == null) holder.showError("الصورة اللي اتصورت مش متاحة للحفظ.")
                else holder.addMedia(item, pending)
                target.discard()
            }
        }
    }

    DisposableEffect(item.id) {
        onDispose { cameraTarget?.discard() }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
    ) {
        item {
            TeswaFocusedHeader(
                title = item.title?.takeIf { it.isNotBlank() } ?: "حاجة من دولابك",
                onBack = onBack,
            )
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaStatePill(
                    text = statusLabel(item.status),
                    emphasis = statusEmphasis(item.status),
                )
                TeswaInlineMessage(
                    title = "ذاكرة الحاجة في مكان واحد",
                    body = buildString {
                        append("${media.size} ميديا • ${notes.size} ملاحظة")
                        if (item.status == DolabItemStatus.READY) {
                            append(". جاهزة تتحول لحاجة منشورة من نفس السياق.")
                        }
                    },
                    emphasis = TeswaEmphasis.Quiet,
                    icon = TeswaIcons.Mine,
                )
            }
        }

        holder.message?.let { value ->
            item {
                DolabMessage(
                    value = value,
                    error = holder.messageIsError,
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        }

        if (item.status.editable) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                ) {
                    TeswaSectionHeader("تفاصيل الحاجة")
                    DolabEditFields(draft) { draft = it }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        TeswaPrimaryAction(
                            text = "حفظ",
                            loading = holderBusy,
                            enabled = !busy,
                            onClick = { scope.launch { holder.save(item, draft) } },
                            modifier = Modifier.weight(1f),
                        )
                        TeswaSecondaryAction(
                            text = if (item.status == DolabItemStatus.READY) "رجّعها مسودة" else "علّمها جاهزة",
                            enabled = !busy,
                            onClick = {
                                scope.launch {
                                    holder.setReady(item, item.status != DolabItemStatus.READY)
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        } else {
            item {
                TeswaInlineMessage(
                    title = "الحاجة خرجت من مرحلة التجهيز",
                    body = "الدولاب محتفظ بسياقها، لكن حالتها العامة بقت مرتبطة بما حصل برا مساحتك الخاصة.",
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        }

        if (item.status == DolabItemStatus.READY && onContinueAsListing != null) {
            item {
                TeswaPrimaryAction(
                    text = if (continueWorking) "بنجهزها للنشر…" else "حطّها في اللعب",
                    icon = TeswaIcons.PutIntoPlay,
                    loading = continueWorking,
                    enabled = !busy,
                    onClick = {
                        if (!continueWorking) {
                            scope.launch {
                                continueWorking = true
                                val error = onContinueAsListing(item)
                                continueWorking = false
                                if (error != null) holder.showError(error)
                            }
                        }
                    },
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                TeswaSectionHeader("الميديا")
                Text(
                    text = if (item.status.editable) {
                        "صور الحاجة وصوتك جزء من ذاكرتها قبل ما تقرر تنشرها."
                    } else {
                        "الميديا محفوظة كسياق للحاجة بعد خروجها من مرحلة التجهيز."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (item.status.editable) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        TeswaSecondaryAction(
                            text = "من الصور",
                            icon = TeswaIcons.Gallery,
                            enabled = !busy,
                            onClick = {
                                gallery.launch(DolabMediaResolver.SUPPORTED_IMAGE_TYPES.toTypedArray())
                            },
                            modifier = Modifier.weight(1f),
                        )
                        TeswaSecondaryAction(
                            text = "كاميرا",
                            icon = TeswaIcons.Camera,
                            enabled = !busy,
                            onClick = {
                                runCatching { mediaResolver.createCameraTarget() }
                                    .onSuccess { target ->
                                        cameraTarget = target
                                        camera.launch(target.uri)
                                    }
                                    .onFailure { holder.showError("تعذر فتح الكاميرا دلوقتي.") }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    VoiceComposer(
                        enabled = !busy,
                        sending = holderBusy && uploadProgress != null,
                        uploadProgress = uploadProgress,
                        onSend = { voice ->
                            val pending = mediaResolver.resolveVoice(voice)
                            if (pending == null) {
                                holder.showError("التسجيل غير صالح أو لم يعد موجودًا.")
                                false
                            } else {
                                holder.addMedia(item, pending)
                            }
                        },
                        onError = holder::showError,
                    )
                    if (uploadProgress != null) {
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                        Text(
                            text = "بنحفظ الميديا… $uploadProgress%",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        if (media.isEmpty()) {
            item {
                TeswaInlineMessage(
                    title = "لسه مفيش ميديا",
                    body = "أضف صورة أو تسجيل لما يكون فيه حاجة تستاهل تفضل مرتبطة بالقطعة دي.",
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        } else {
            items(media, key = { "media-${it.id}" }) { entry ->
                DolabMediaCard(
                    holder = holder,
                    media = entry,
                    editable = item.status.editable,
                    busy = busy,
                    onDelete = { scope.launch { holder.deleteMedia(entry) } },
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                TeswaSectionHeader("ملاحظاتك")
                Text(
                    text = "مش شات منفصل؛ دي ذاكرة الحاجة نفسها.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (notes.isEmpty()) {
            item {
                TeswaInlineMessage(
                    title = "مفيش ملاحظات لسه",
                    body = "اكتب أي حاجة تحب تفضل فاكرها عن القطعة دي.",
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        } else {
            items(notes, key = { it.id }) { entry ->
                Surface(
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    shape = MaterialTheme.shapes.large,
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(TeswaSpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        Text(
                            text = entry.body ?: "ملاحظة ${entry.noteType}",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(
                            onClick = { scope.launch { holder.deleteNote(entry) } },
                            enabled = !busy,
                        ) {
                            Text("حذف")
                        }
                    }
                }
            }
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaTextField(
                    value = note,
                    onValueChange = { note = it.take(8_000) },
                    label = "اكتب حاجة عايز تفتكرها",
                    singleLine = false,
                    minLines = 2,
                    maxLines = 6,
                    enabled = item.status.editable && !busy,
                )
                TeswaPrimaryAction(
                    text = "ضيف للمساحة",
                    enabled = item.status.editable && note.isNotBlank() && !busy,
                    onClick = {
                        scope.launch {
                            if (holder.addNote(item.id, note)) note = ""
                        }
                    },
                )
            }
        }

        item {
            TextButton(
                onClick = { confirmDelete = true },
                enabled = !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
            ) {
                Text(
                    text = "شيل الحاجة من الدولاب",
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("نشيل الحاجة؟") },
            text = { Text("هتتمسح الحاجة وسياقها من الدولاب. لو حالتها العامة مرتبطة بتاريخ تبديل، السيرفر هو اللي هيحدد لو الحذف مسموح.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        scope.launch {
                            if (holder.delete(item)) onDeleted()
                        }
                    },
                ) {
                    Text("حذف", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text("رجوع")
                }
            },
        )
    }
}

@Composable
private fun DolabMediaCard(
    holder: DolabStateHolder,
    media: DolabMedia,
    editable: Boolean,
    busy: Boolean,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var signedUrl by remember(media.id, media.storagePath) { mutableStateOf<String?>(null) }
    var imageUrlLoading by remember(media.id, media.storagePath) { mutableStateOf(media.mediaType == "image") }

    LaunchedEffect(media.id, media.storagePath, media.mediaType) {
        if (media.mediaType == "image") {
            signedUrl = holder.mediaUrl(media)
            imageUrlLoading = false
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(TeswaSpacing.md),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            when (media.mediaType) {
                "image" -> {
                    if (imageUrlLoading) {
                        TeswaInlineLoading("بنفتح الصورة…")
                    } else {
                        NetworkImage(
                            url = signedUrl,
                            contentDescription = "صورة محفوظة في الدولاب",
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(TeswaLayout.MediaPreviewHeight)
                                .clip(MaterialTheme.shapes.large),
                        )
                    }
                }
                "audio" -> VoiceMessagePlayer(
                    durationMs = media.durationMs?.coerceAtMost(Int.MAX_VALUE.toLong())?.toInt(),
                    loadUrl = { holder.mediaUrl(media) },
                )
                "video" -> TeswaInlineMessage(
                    title = "فيديو محفوظ",
                    body = "الفيديو مرتبط بالحاجة دي ومحفوظ في دولابك.",
                )
                else -> TeswaInlineMessage(
                    title = "ميديا محفوظة",
                    body = "الملف مرتبط بالحاجة دي ومحفوظ في دولابك.",
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = mediaTypeLabel(media.mediaType),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    val details = listOfNotNull(
                        media.mimeType,
                        media.sizeBytes?.let(::formatFileSize),
                    ).joinToString(" • ")
                    if (details.isNotBlank()) {
                        Text(
                            text = details,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (editable) {
                    TextButton(onClick = onDelete, enabled = !busy) {
                        Text("حذف", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
private fun DolabEditFields(
    draft: DolabItemDraft,
    onChange: (DolabItemDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
        TeswaTextField(
            value = draft.title,
            onValueChange = { onChange(draft.copy(title = it.take(160))) },
            label = "اسم الحاجة",
        )
        TeswaTextField(
            value = draft.description,
            onValueChange = { onChange(draft.copy(description = it.take(4_000))) },
            label = "إيه قصتها أو إيه اللي فاكره عنها؟",
            singleLine = false,
            minLines = 3,
            maxLines = 8,
        )
        TeswaTextField(
            value = draft.category,
            onValueChange = { onChange(draft.copy(category = it.take(120))) },
            label = "النوع",
        )
        TeswaTextField(
            value = draft.condition,
            onValueChange = { onChange(draft.copy(condition = it.take(120))) },
            label = "الحالة",
        )
        TeswaTextField(
            value = draft.exchangeIntent,
            onValueChange = { onChange(draft.copy(exchangeIntent = it.take(1_000))) },
            label = "لو بدّلتها، نفسك في إيه؟",
            singleLine = false,
            minLines = 2,
            maxLines = 5,
        )
    }
}

@Composable
private fun DolabCreateDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onCreate: (DolabItemDraft) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("احفظ حاجة في دولابك") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
                Text(
                    text = "مش لازم تبقى جاهزة للنشر أو التبديل. احفظها الأول وخلي القرار عندك.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TeswaTextField(
                    value = title,
                    onValueChange = { title = it.take(160) },
                    label = "اسم بسيط",
                )
                TeswaTextField(
                    value = description,
                    onValueChange = { description = it.take(4_000) },
                    label = "ملاحظة أو فكرة",
                    singleLine = false,
                    minLines = 2,
                    maxLines = 5,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(DolabItemDraft(title = title, description = description)) },
                enabled = !busy && (title.isNotBlank() || description.isNotBlank()),
            ) {
                Text(if (busy) "بنحفظ…" else "حفظ")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text("رجوع")
            }
        },
    )
}

@Composable
private fun DolabMessage(
    value: String,
    error: Boolean,
    modifier: Modifier = Modifier,
) {
    TeswaInlineMessage(
        title = if (error) "الخطوة مكملتش" else "اتحفظت",
        body = value,
        emphasis = if (error) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
        modifier = modifier,
    )
}

private fun filterLabel(filter: DolabFilter): String = when (filter) {
    DolabFilter.ALL -> "الكل"
    DolabFilter.IN_PROGRESS -> "بجهزها"
    DolabFilter.READY -> "جاهزة"
    DolabFilter.PUBLISHED -> "في اللعب"
    DolabFilter.ARCHIVED -> "أرشيف"
}

private fun statusLabel(status: DolabItemStatus): String = when (status) {
    DolabItemStatus.DRAFT -> "لسه بتتجهز"
    DolabItemStatus.READY -> "جاهزة"
    DolabItemStatus.PUBLISHED -> "في اللعب"
    DolabItemStatus.EXCHANGED -> "اتبدّلت"
    DolabItemStatus.ARCHIVED -> "في الأرشيف"
    DolabItemStatus.UNKNOWN -> "محفوظة"
}

private fun statusEmphasis(status: DolabItemStatus): TeswaEmphasis = when (status) {
    DolabItemStatus.DRAFT -> TeswaEmphasis.Quiet
    DolabItemStatus.READY -> TeswaEmphasis.Normal
    DolabItemStatus.PUBLISHED -> TeswaEmphasis.Strong
    DolabItemStatus.EXCHANGED -> TeswaEmphasis.Commitment
    DolabItemStatus.ARCHIVED,
    DolabItemStatus.UNKNOWN -> TeswaEmphasis.Quiet
}

private fun mediaTypeLabel(value: String): String = when (value) {
    "image" -> "صورة"
    "audio" -> "صوت"
    "video" -> "فيديو"
    else -> "ميديا"
}

private fun formatFileSize(bytes: Long): String = when {
    bytes >= 1024L * 1024L -> "%.1f MB".format(bytes.toDouble() / (1024.0 * 1024.0))
    bytes >= 1024L -> "%.1f KB".format(bytes.toDouble() / 1024.0)
    else -> "$bytes B"
}
