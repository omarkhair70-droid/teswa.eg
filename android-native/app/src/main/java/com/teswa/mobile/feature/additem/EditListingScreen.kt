package com.teswa.mobile.feature.additem

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import com.teswa.mobile.ui.LocalContentImage
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaBottomCommitBar
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import kotlinx.coroutines.launch

@Composable
fun EditListingScreen(
    itemId: String,
    initialSession: AuthSession,
    repository: EditListingRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val resolver = remember(context) { AddItemMediaResolver(context) }
    val holder = remember(itemId, initialSession.user.id, repository) {
        EditListingStateHolder(itemId, initialSession, repository)
    }
    val scope = rememberCoroutineScope()
    var cameraTarget by remember { mutableStateOf<CameraTarget?>(null) }

    fun addResolved(uris: List<android.net.Uri>) {
        val images = uris.mapNotNull(resolver::resolve)
        if (images.size != uris.size) holder.showError("في صورة مش قادرين نقرا بياناتها. اختار صورة تانية.")
        holder.addImages(images)
    }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { uri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        val free = AddItemDraft.MAX_IMAGES - (holder.draft?.images?.size ?: 0)
        addResolved(uris.take(free.coerceAtLeast(0)))
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val target = cameraTarget
        cameraTarget = null
        if (saved && target != null) addResolved(listOf(target.uri)) else target?.discard()
    }

    LaunchedEffect(initialSession.accessToken, itemId) {
        holder.updateSession(initialSession)
        if (holder.state is EditListingUiState.Loading) holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    when (val state = holder.state) {
        EditListingUiState.Loading -> EditCenteredState(
            title = "بنفتح نفس الحاجة…",
            body = "بنقرأ آخر نسخة منشورة قبل أي تعديل.",
            loading = true,
            modifier = modifier,
        )

        is EditListingUiState.Error -> EditCenteredState(
            title = "الحاجة ما فتحتش",
            body = state.message,
            modifier = modifier,
            onRetry = { scope.launch { holder.load() } },
            onBack = onBack,
        )

        is EditListingUiState.Ready -> {
            val draft = holder.draft ?: return
            Column(modifier.fillMaxSize()) {
                TeswaFocusedHeader(
                    title = "عدّل الحاجة",
                    onBack = onBack,
                )

                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(TeswaLayout.FocusedContentPadding),
                    verticalArrangement = Arrangement.spacedBy(TeswaLayout.SectionGap),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            TeswaArchiveLabel(
                                text = if (state.status == "active") "في اللعب" else "مؤرشفة",
                                tone = if (state.status == "active") {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                            )
                            Text(
                                text = "نفس الحاجة · نفس التاريخ",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        TeswaTraceNote(
                            if (state.status == "active") {
                                "التعديل يغيّر اللي الناس شايفاه، لكن ما يقطعش تاريخ الحاجة ولا عروضها الحالية."
                            } else {
                                "التعديل يحفظ النسخة الجديدة وهي مؤرشفة؛ مش بيرجعها للّعب تلقائيًا."
                            },
                        )
                    }

                    holder.message?.let { message ->
                        TeswaInlineMessage(
                            title = if (holder.messageIsError) "التعديل مكملش" else "اتحفظ",
                            body = message,
                            emphasis = if (holder.messageIsError) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
                        )
                    }

                    EditMemorySection(
                        title = "الصور اللي بتعرّف الحاجة",
                        supporting = "الغلاف هو أول لقطة. الصور الجديدة بتدخل نفس السجل بدل ما تعمل نسخة جديدة من الحاجة.",
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                            TeswaSecondaryAction(
                                text = "من الصور",
                                icon = TeswaIcons.Gallery,
                                enabled = !holder.saving && draft.images.size < AddItemDraft.MAX_IMAGES,
                                onClick = { gallery.launch(AddItemDraft.SUPPORTED_IMAGE_TYPES.toTypedArray()) },
                                modifier = Modifier.weight(1f),
                            )
                            TeswaSecondaryAction(
                                text = "كاميرا",
                                icon = TeswaIcons.Camera,
                                enabled = !holder.saving && draft.images.size < AddItemDraft.MAX_IMAGES,
                                onClick = {
                                    runCatching { resolver.createCameraTarget() }
                                        .onSuccess { target -> cameraTarget = target; camera.launch(target.uri) }
                                        .onFailure { holder.showError("تعذر فتح الكاميرا دلوقتي.") }
                                },
                                modifier = Modifier.weight(1f),
                            )
                        }

                        if (draft.images.isEmpty()) {
                            TeswaInlineMessage(
                                title = "الحاجة محتاجة صورة",
                                body = "لازم تفضل فيه لقطة واحدة على الأقل عشان النسخة العامة تفضل مفهومة.",
                                emphasis = TeswaEmphasis.Strong,
                            )
                        } else {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                            ) {
                                draft.images.forEachIndexed { index, image ->
                                    EditImageMemory(
                                        image = image,
                                        index = index,
                                        count = draft.images.size,
                                        enabled = !holder.saving,
                                        onPrimary = { holder.makePrimary(index) },
                                        onMoveBefore = { holder.moveImage(index, -1) },
                                        onMoveAfter = { holder.moveImage(index, 1) },
                                        onRemove = { holder.removeImage(index) },
                                    )
                                }
                            }
                        }

                        Text(
                            "${draft.images.size} من ${AddItemDraft.MAX_IMAGES} لقطات",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    EditMemorySection(
                        title = "اسمها ومكانها",
                        supporting = "دي نفس هوية الحاجة اللي الناس عرفوها قبل كده.",
                    ) {
                        TeswaTextField(
                            value = draft.title,
                            onValueChange = { holder.updateBasics(title = it) },
                            label = "اسم الحاجة",
                            supportingText = "${draft.title.length} / 160",
                            enabled = !holder.saving,
                        )
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                        ) {
                            state.categories.forEach { category ->
                                TeswaChoiceChip(
                                    label = category.nameAr,
                                    selected = draft.categoryId == category.id,
                                    enabled = !holder.saving,
                                    onClick = { holder.updateBasics(categoryId = category.id) },
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                            TeswaTextField(
                                value = draft.city,
                                onValueChange = { holder.updateDetails(city = it) },
                                label = "المدينة",
                                enabled = !holder.saving,
                                modifier = Modifier.weight(1f),
                            )
                            TeswaTextField(
                                value = draft.area,
                                onValueChange = { holder.updateDetails(area = it) },
                                label = "المنطقة",
                                enabled = !holder.saving,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        Text(
                            "الموقع التقريبي المحفوظ نفسه مش بيتغيّر من الشاشة دي.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    EditMemorySection(
                        title = "الأثر والحالة",
                        supporting = "أي علامة استخدام حقيقية جزء من قرار التبديل، مش عيب لازم نخبّيه.",
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                            ItemCondition.entries.forEach { condition ->
                                TeswaChoiceChip(
                                    label = condition.label,
                                    selected = draft.condition == condition,
                                    enabled = !holder.saving,
                                    onClick = { holder.updateDetails(condition = condition) },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        EditMemoryField("ملاحظات الحالة", draft.conditionNotes, 1_000, !holder.saving) {
                            holder.updateDetails(conditionNotes = it)
                        }
                        EditMemoryField("الوصف", draft.description, 4_000, !holder.saving, minLines = 4) {
                            holder.updateDetails(description = it)
                        }
                    }

                    EditMemorySection(
                        title = "إيه اللي مفتوحة له؟",
                        supporting = "النية دي بتشرح الاحتمال الجاي، لكنها مش عقد ولا سعر ولا تقييم للعدل.",
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                            DesireMode.entries.forEach { mode ->
                                TeswaChoiceChip(
                                    label = mode.label,
                                    selected = draft.desireMode == mode,
                                    enabled = !holder.saving,
                                    onClick = { holder.updateExchange(desireMode = mode) },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        EditMemoryField(
                            "تفاصيل المقابل${if (draft.desireMode == DesireMode.SPECIFIC) " *" else ""}",
                            draft.desireText,
                            1_000,
                            !holder.saving,
                        ) { holder.updateExchange(desireText = it) }
                    }

                    EditMemorySection(
                        title = "أثر من حياتها",
                        supporting = "اختياري. لو فيه سياق حقيقي خليه يفضل مع الحاجة؛ لو مفيش، سيب الواجهة هادية.",
                    ) {
                        EditMemoryField("حكاية الحاجة", draft.itemStory, 600, !holder.saving, minLines = 3) {
                            holder.updateExchange(itemStory = it)
                        }
                        EditMemoryField("ليه عايز تبدّلها؟", draft.swapReason, 240, !holder.saving) {
                            holder.updateExchange(swapReason = it)
                        }
                        EditMemoryField("مناسبة لمين؟", draft.goodFor, 240, !holder.saving) {
                            holder.updateExchange(goodFor = it)
                        }
                    }

                    TeswaInlineMessage(
                        title = "بتعدّل نفس الحاجة، مش بتخلق إعلان جديد",
                        body = "الحفظ يثبت التغييرات على نفس itemId ونفس تاريخها. الصور الجديدة بس هي اللي بتترفع، والصور القديمة تفضل مرتبطة بنفس الحاجة حسب ترتيبك.",
                        icon = TeswaIcons.Edit,
                        emphasis = TeswaEmphasis.Quiet,
                    )
                }

                holder.progress?.let { current ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = TeswaLayout.BottomCommitHorizontal),
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    ) {
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                        Text(
                            when (current) {
                                is EditListingProgress.Uploading -> "بنضيف لقطة جديدة ${current.current} من ${current.total} — ${current.percent}%"
                                EditListingProgress.Saving -> "بنثبت التعديلات على نفس الحاجة…"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                TeswaBottomCommitBar(
                    primaryLabel = "احفظ نفس الحاجة",
                    primaryIcon = TeswaIcons.Accepted,
                    primaryEnabled = !holder.saving,
                    primaryLoading = holder.saving,
                    onPrimary = { scope.launch { holder.save() } },
                )
            }
        }
    }
}

@Composable
private fun EditImageMemory(
    image: EditListingImageDraft,
    index: Int,
    count: Int,
    enabled: Boolean,
    onPrimary: () -> Unit,
    onMoveBefore: () -> Unit,
    onMoveAfter: () -> Unit,
    onRemove: () -> Unit,
) {
    Surface(
        modifier = Modifier.width(174.dp),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(TeswaRadius.lg),
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(TeswaSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            Box {
                when (image) {
                    is EditListingImageDraft.Existing -> NetworkImage(
                        url = image.image.imageUrl,
                        contentDescription = "لقطة ${index + 1}",
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(TeswaRadius.md)),
                    )
                    is EditListingImageDraft.New -> LocalContentImage(
                        uri = image.image.uri,
                        contentDescription = image.image.displayName,
                        resolver = LocalContext.current.contentResolver,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(TeswaRadius.md)),
                    )
                }
                TeswaArchiveLabel(
                    text = when {
                        index == 0 -> "الغلاف"
                        image is EditListingImageDraft.New -> "جديدة"
                        else -> "محفوظة"
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(TeswaSpacing.xs),
                )
            }

            Text(
                text = if (index == 0) "اللقطة الأساسية" else "لقطة ${index + 1}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            if (index > 0) {
                TeswaSecondaryAction(
                    text = "خليها الغلاف",
                    enabled = enabled,
                    onClick = onPrimary,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                TextButton(
                    onClick = onMoveBefore,
                    enabled = enabled && index > 0,
                    modifier = Modifier.weight(1f),
                ) { Text("قبل") }
                TextButton(
                    onClick = onMoveAfter,
                    enabled = enabled && index < count - 1,
                    modifier = Modifier.weight(1f),
                ) { Text("بعد") }
            }
            TextButton(
                onClick = onRemove,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("شيل اللقطة", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun EditMemorySection(
    title: String,
    supporting: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaSectionHeader(title)
        Text(
            text = supporting,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
    }
}

@Composable
private fun EditMemoryField(
    label: String,
    value: String,
    max: Int,
    enabled: Boolean,
    minLines: Int = 2,
    onValue: (String) -> Unit,
) {
    TeswaTextField(
        value = value,
        onValueChange = { onValue(it.take(max)) },
        label = label,
        supportingText = "${value.length} / $max",
        enabled = enabled,
        singleLine = false,
        minLines = minLines,
        maxLines = maxOf(minLines, 6),
    )
}

@Composable
private fun EditCenteredState(
    title: String,
    body: String,
    modifier: Modifier,
    loading: Boolean = false,
    onRetry: (() -> Unit)? = null,
    onBack: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (loading) {
            TeswaInlineLoading(title)
            Spacer(Modifier.height(TeswaSpacing.xs))
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            TeswaInlineMessage(
                title = title,
                body = body,
                emphasis = TeswaEmphasis.Strong,
                actionLabel = if (onRetry != null) "حاول تاني" else null,
                onAction = onRetry,
            )
            if (onBack != null) {
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(text = "رجوع", onClick = onBack)
            }
        }
    }
}
