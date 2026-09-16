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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.feature.voice.VoiceMessagePlayer
import com.teswa.mobile.ui.NetworkImage
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
            onBack = onBack,
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
    onBack: () -> Unit,
    onCreate: () -> Unit,
    onOpen: (DolabItem) -> Unit,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    val workspace = holder.workspace()
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("رجوع") }
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("دولابي", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text("مساحتك الخاصة قبل السوق", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            Surface(
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .48f),
            ) {
                Column(Modifier.fillMaxWidth().padding(20.dp)) {
                    Text("هنا الحاجة لسه بتاعتك إنت", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(5.dp))
                    Text("صورة، فكرة، ملاحظة أو حاجة ناوي تبدّلها. جهّزها براحتك وبعدها قرر تعمل بيها إيه.")
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = onCreate) { Text("+ احفظ حاجة") }
                }
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                DolabFilter.entries.forEach { filter ->
                    FilterChip(
                        selected = holder.filter == filter,
                        onClick = { holder.selectFilter(filter) },
                        label = { Text(filterLabel(filter)) },
                    )
                }
            }
        }
        holder.message?.let { value -> item { DolabMessage(value, holder.messageIsError) } }
        when (val state = holder.state) {
            DolabUiState.Loading -> item { DolabCenter("بنفتح دولابك…", loading = true) }
            is DolabUiState.Error -> item {
                DolabCenter(state.message, primary = "حاول تاني" to { scope.launch { holder.load() } })
            }
            is DolabUiState.Empty -> item {
                DolabCenter(
                    "الدولاب فاضي دلوقتي. احفظ أول حاجة من غير ما تضطر تعرضها في السوق.",
                    primary = "احفظ أول حاجة" to onCreate,
                )
            }
            is DolabUiState.Ready -> {
                val visible = holder.visibleItems()
                if (visible.isEmpty()) {
                    item { DolabCenter("مفيش حاجات في الفلتر ده.") }
                } else {
                    items(visible, key = { it.id }) { item ->
                        DolabItemCard(
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
                TextButton(
                    onClick = { scope.launch { holder.load(refresh = true) } },
                    enabled = !holder.refreshing,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (holder.refreshing) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp)
                    else Text("حدّث الدولاب")
                }
            }
        }
    }
}

@Composable
private fun DolabItemCard(
    item: DolabItem,
    mediaCount: Int,
    notesCount: Int,
    onOpen: () -> Unit,
) {
    Card(onClick = onOpen, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .6f),
                ) {
                    Text("◫", modifier = Modifier.padding(horizontal = 15.dp, vertical = 12.dp), style = MaterialTheme.typography.headlineSmall)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.title ?: "حاجة من غير اسم", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(statusLabel(item.status), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                }
                Text("‹", style = MaterialTheme.typography.headlineSmall)
            }
            item.description?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (mediaCount > 0) MetaChip("ميديا $mediaCount")
                if (notesCount > 0) MetaChip("ملاحظات $notesCount")
                item.category?.let { MetaChip(it) }
            }
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
            runCatching { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
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
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack, enabled = !busy) { Text("رجوع") }
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.title ?: "حاجة من دولابك", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(statusLabel(item.status), color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        holder.message?.let { value -> item { DolabMessage(value, holder.messageIsError) } }
        item {
            Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .45f)) {
                Column(Modifier.fillMaxWidth().padding(18.dp)) {
                    Text("السياق كله في مكان واحد", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("${media.size} ميديا • ${notes.size} ملاحظة")
                    if (item.status == DolabItemStatus.READY) {
                        Spacer(Modifier.height(8.dp))
                        Text("دي جاهزة تتحول لإعلان من نفس البيانات والميديا.", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
        if (item.status.editable) {
            item { DolabEditFields(draft) { draft = it } }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { scope.launch { holder.save(item, draft) } },
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    ) { Text(if (holderBusy) "بنحفظ…" else "حفظ") }
                    OutlinedButton(
                        onClick = { scope.launch { holder.setReady(item, item.status != DolabItemStatus.READY) } },
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    ) { Text(if (item.status == DolabItemStatus.READY) "رجّعها مسودة" else "جاهزة") }
                }
            }
        } else {
            item {
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceVariant) {
                    Text("الحاجة دي خرجت من مرحلة التجهيز؛ الدولاب محتفظ بسياقها من غير ما يغيّر حالة السوق.", Modifier.padding(16.dp))
                }
            }
        }
        if (item.status == DolabItemStatus.READY && onContinueAsListing != null) {
            item {
                Button(
                    onClick = {
                        if (!continueWorking) scope.launch {
                            continueWorking = true
                            val error = onContinueAsListing(item)
                            continueWorking = false
                            if (error != null) holder.showError(error)
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (continueWorking) {
                        CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("بنجهز الإعلان…")
                    } else {
                        Text("كمّلها كإعلان")
                    }
                }
            }
        }

        item {
            Text("الميديا", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                if (item.status.editable) "خلي صور الحاجة وصوتك معاها هنا قبل ما تقرر تنشرها."
                else "الميديا محفوظة كسياق للحاجة بعد خروجها من مرحلة التجهيز.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (item.status.editable) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { gallery.launch(DolabMediaResolver.SUPPORTED_IMAGE_TYPES.toTypedArray()) },
                            enabled = !busy,
                            modifier = Modifier.weight(1f),
                        ) { Text("من الصور") }
                        OutlinedButton(
                            onClick = {
                                runCatching { mediaResolver.createCameraTarget() }
                                    .onSuccess { target -> cameraTarget = target; camera.launch(target.uri) }
                                    .onFailure { holder.showError("تعذر فتح الكاميرا دلوقتي.") }
                            },
                            enabled = !busy,
                            modifier = Modifier.weight(1f),
                        ) { Text("كاميرا") }
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
                        Text("بنحفظ الميديا… $uploadProgress%", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        if (media.isEmpty()) {
            item { Text("لسه مفيش ميديا محفوظة مع الحاجة دي.", style = MaterialTheme.typography.bodyMedium) }
        } else {
            items(media, key = { "media-${it.id}" }) { entry ->
                DolabMediaCard(
                    holder = holder,
                    media = entry,
                    editable = item.status.editable,
                    busy = busy,
                    onDelete = { scope.launch { holder.deleteMedia(entry) } },
                )
            }
        }

        item {
            Text("ملاحظاتك", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("مش شات منفصل؛ دي ذاكرة الحاجة نفسها.", style = MaterialTheme.typography.bodySmall)
        }
        if (notes.isEmpty()) {
            item { Text("لسه مفيش ملاحظات للحاجة دي.", style = MaterialTheme.typography.bodyMedium) }
        } else {
            items(notes, key = { it.id }) { entry ->
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f)) {
                    Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(entry.body ?: "ملاحظة ${entry.noteType}", Modifier.weight(1f))
                        TextButton(onClick = { scope.launch { holder.deleteNote(entry) } }, enabled = !busy) { Text("حذف") }
                    }
                }
            }
        }
        item {
            OutlinedTextField(
                value = note,
                onValueChange = { note = it.take(8_000) },
                label = { Text("اكتب حاجة عايز تفتكرها") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
                enabled = item.status.editable && !busy,
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { scope.launch { if (holder.addNote(item.id, note)) note = "" } },
                enabled = item.status.editable && note.isNotBlank() && !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("ضيف للمساحة") }
        }
        item {
            TextButton(onClick = { confirmDelete = true }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                Text("شيل الحاجة من الدولاب")
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("نشيل الحاجة؟") },
            text = { Text("هتتمسح الحاجة وسياقها من الدولاب.") },
            confirmButton = {
                Button(onClick = {
                    confirmDelete = false
                    scope.launch { if (holder.delete(item)) onDeleted() }
                }) { Text("حذف") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("رجوع") } },
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
) {
    var signedUrl by remember(media.id, media.storagePath) { mutableStateOf<String?>(null) }
    var imageUrlLoading by remember(media.id, media.storagePath) { mutableStateOf(media.mediaType == "image") }

    LaunchedEffect(media.id, media.storagePath, media.mediaType) {
        if (media.mediaType == "image") {
            signedUrl = holder.mediaUrl(media)
            imageUrlLoading = false
        }
    }

    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .5f)) {
        Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            when (media.mediaType) {
                "image" -> {
                    if (imageUrlLoading) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("بنفتح الصورة…", style = MaterialTheme.typography.bodySmall)
                        }
                    } else {
                        NetworkImage(
                            url = signedUrl,
                            contentDescription = "صورة محفوظة في الدولاب",
                            modifier = Modifier.fillMaxWidth().height(190.dp).clip(MaterialTheme.shapes.large),
                        )
                    }
                }
                "audio" -> VoiceMessagePlayer(
                    durationMs = media.durationMs?.coerceAtMost(Int.MAX_VALUE.toLong())?.toInt(),
                    loadUrl = { holder.mediaUrl(media) },
                )
                "video" -> Text("فيديو محفوظ مع الحاجة", style = MaterialTheme.typography.titleSmall)
                else -> Text("ملف محفوظ مع الحاجة", style = MaterialTheme.typography.titleSmall)
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(mediaTypeLabel(media.mediaType), fontWeight = FontWeight.SemiBold)
                    val details = listOfNotNull(media.mimeType, media.sizeBytes?.let(::formatFileSize)).joinToString(" • ")
                    if (details.isNotBlank()) Text(details, style = MaterialTheme.typography.bodySmall)
                }
                if (editable) {
                    TextButton(onClick = onDelete, enabled = !busy) { Text("حذف") }
                }
            }
        }
    }
}

@Composable
private fun DolabEditFields(draft: DolabItemDraft, onChange: (DolabItemDraft) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            value = draft.title,
            onValueChange = { onChange(draft.copy(title = it.take(160))) },
            label = { Text("اسم الحاجة") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = draft.description,
            onValueChange = { onChange(draft.copy(description = it.take(4_000))) },
            label = { Text("إيه قصتها أو إيه اللي فاكره عنها؟") },
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = draft.category,
                onValueChange = { onChange(draft.copy(category = it.take(120))) },
                label = { Text("النوع") },
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = draft.condition,
                onValueChange = { onChange(draft.copy(condition = it.take(120))) },
                label = { Text("الحالة") },
                modifier = Modifier.weight(1f),
            )
        }
        OutlinedTextField(
            value = draft.exchangeIntent,
            onValueChange = { onChange(draft.copy(exchangeIntent = it.take(1_000))) },
            label = { Text("لو بدّلتها، نفسك في إيه؟") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
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
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("مش لازم تبقى جاهزة للبيع أو التبديل. احفظها الأول.")
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it.take(160) },
                    label = { Text("اسم بسيط") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(4_000) },
                    label = { Text("ملاحظة أو فكرة") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onCreate(DolabItemDraft(title = title, description = description)) },
                enabled = !busy && (title.isNotBlank() || description.isNotBlank()),
            ) { Text(if (busy) "بنحفظ…" else "حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("رجوع") } },
    )
}

@Composable
private fun MetaChip(value: String) {
    Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.surfaceVariant) {
        Text(value, Modifier.padding(horizontal = 9.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun DolabMessage(value: String, error: Boolean) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
    ) {
        Text(value, Modifier.fillMaxWidth().padding(12.dp))
    }
}

@Composable
private fun DolabCenter(
    message: String,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 34.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (loading) CircularProgressIndicator()
        Text(message, style = MaterialTheme.typography.bodyLarge)
        primary?.let { Button(onClick = it.second) { Text(it.first) } }
    }
}

private fun filterLabel(filter: DolabFilter): String = when (filter) {
    DolabFilter.ALL -> "الكل"
    DolabFilter.IN_PROGRESS -> "بجهزها"
    DolabFilter.READY -> "جاهزة"
    DolabFilter.PUBLISHED -> "طلعت للسوق"
    DolabFilter.ARCHIVED -> "أرشيف"
}

private fun statusLabel(status: DolabItemStatus): String = when (status) {
    DolabItemStatus.DRAFT -> "لسه بتتجهز"
    DolabItemStatus.READY -> "جاهزة للخطوة الجاية"
    DolabItemStatus.PUBLISHED -> "منشورة"
    DolabItemStatus.EXCHANGED -> "اتبدّلت"
    DolabItemStatus.ARCHIVED -> "في الأرشيف"
    DolabItemStatus.UNKNOWN -> "محفوظة"
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
