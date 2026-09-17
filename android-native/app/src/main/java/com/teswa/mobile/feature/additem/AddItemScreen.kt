package com.teswa.mobile.feature.additem

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.ui.LocalContentImage
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSize
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import com.teswa.mobile.ui.system.performTeswa
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@Composable
fun AddItemScreen(
    initialSession: AuthSession,
    repository: AddItemRepository,
    locationProvider: CurrentLocationProvider,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onPublished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val resolver = remember(context) { AddItemMediaResolver(context) }
    val draftStore = remember(initialSession.user.id) { AddItemDraftStore(context, initialSession.user.id) }
    val holder = remember(initialSession.user.id, repository) {
        AddItemStateHolder(initialSession, repository, draftStore.load())
    }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var publishJob by remember { mutableStateOf<Job?>(null) }
    var cameraTarget by remember { mutableStateOf<CameraTarget?>(null) }

    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) scope.launch { holder.useCurrentLocation(locationProvider) }
        else holder.showMessage("إذن الموقع اترفض. تقدر تكتب المدينة والمنطقة يدويًا.")
    }

    fun useLocation() {
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (coarse || fine) scope.launch { holder.useCurrentLocation(locationProvider) }
        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
    }

    fun addResolved(uris: List<android.net.Uri>) {
        val images = uris.mapNotNull(resolver::resolve)
        if (images.size != uris.size) holder.showMessage("في صورة مش قادرين نقرا بياناتها. اختار صورة تانية.")
        holder.addImages(images)
    }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { uri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        addResolved(uris.take(AddItemDraft.MAX_IMAGES - holder.draft.images.size))
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val target = cameraTarget
        cameraTarget = null
        if (saved && target != null) addResolved(listOf(target.uri)) else target?.discard()
    }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        if (holder.categoriesState is AddItemCategoriesState.Loading) holder.loadCategories()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }
    LaunchedEffect(holder.draft) { draftStore.save(holder.draft) }
    LaunchedEffect(holder.submissionState) {
        if (holder.submissionState is AddItemSubmissionState.Success) {
            draftStore.clear()
            haptics.performTeswa(TeswaHapticEvent.Success)
        }
    }

    val success = holder.submissionState as? AddItemSubmissionState.Success
    if (success != null) {
        AddItemSuccess(
            modifier = modifier,
            onHome = onPublished,
            onAnother = holder::reset,
        )
        return
    }

    Column(modifier = modifier.fillMaxSize()) {
        AddItemHeader(step = holder.step)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
        ) {
            when (holder.step) {
                AddItemStep.BASICS -> BasicsSection(
                    draft = holder.draft,
                    categoriesState = holder.categoriesState,
                    onGallery = { gallery.launch(AddItemDraft.SUPPORTED_IMAGE_TYPES.toTypedArray()) },
                    onCamera = {
                        if (holder.draft.images.size >= AddItemDraft.MAX_IMAGES) {
                            holder.showMessage("الحد الأقصى ${AddItemDraft.MAX_IMAGES} صور.")
                        } else {
                            runCatching { resolver.createCameraTarget() }
                                .onSuccess { target -> cameraTarget = target; camera.launch(target.uri) }
                                .onFailure { holder.showMessage("تعذر فتح الكاميرا دلوقتي.") }
                        }
                    },
                    onRemoveImage = holder::removeImage,
                    onTitle = { holder.updateBasics(title = it) },
                    onCategory = { holder.updateBasics(categoryId = it) },
                    onRetryCategories = { scope.launch { holder.loadCategories() } },
                )
                AddItemStep.DETAILS -> DetailsSection(
                    draft = holder.draft,
                    update = holder::updateDetails,
                    locationWorking = holder.locationWorking,
                    onUseLocation = ::useLocation,
                    onClearLocation = holder::clearLocation,
                )
                AddItemStep.EXCHANGE -> ExchangeSection(holder.draft, holder::updateExchange)
            }
            holder.message?.let { InlineError(it) }
        }
        AddItemActions(
            step = holder.step,
            submission = holder.submissionState,
            onBack = holder::previous,
            onNext = holder::next,
            onPublish = {
                haptics.performTeswa(TeswaHapticEvent.Commit)
                publishJob = scope.launch { holder.publish() }
            },
            onCancel = { publishJob?.cancel() },
        )
    }
}

@Composable
private fun AddItemHeader(step: AddItemStep) {
    val index = AddItemStep.entries.indexOf(step) + 1
    Column(
        modifier = Modifier.padding(
            start = TeswaLayout.ScreenHorizontal,
            end = TeswaLayout.ScreenHorizontal,
            top = TeswaSpacing.lg,
            bottom = TeswaSpacing.sm,
        ),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.PutIntoPlay,
                color = MaterialTheme.colorScheme.primary,
                size = 30.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when (step) {
                        AddItemStep.BASICS -> "ابدأ بالحاجة"
                        AddItemStep.DETAILS -> "خلّيها مفهومة"
                        AddItemStep.EXCHANGE -> "افتحها لاحتمال جديد"
                    },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = when (step) {
                        AddItemStep.BASICS -> "الصورة والاسم أول أثر هيطلع من دولابك."
                        AddItemStep.DETAILS -> "الوضوح يحافظ على الحاجة وعلى اللي هيقابلها."
                        AddItemStep.EXCHANGE -> "دي آخر لحظة وهي عندك لوحدك قبل ما تبقى عامة."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TeswaArchiveLabel("0$index / 03")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
            repeat(3) { position ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(3.dp)
                        .clip(CircleShape)
                        .background(
                            if (position < index) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.surfaceVariant,
                        ),
                )
            }
        }
    }
}

@Composable
private fun BasicsSection(
    draft: AddItemDraft,
    categoriesState: AddItemCategoriesState,
    onGallery: () -> Unit,
    onCamera: () -> Unit,
    onRemoveImage: (String) -> Unit,
    onTitle: (String) -> Unit,
    onCategory: (String) -> Unit,
    onRetryCategories: () -> Unit,
) {
    FormSection("صورتها عندك", "مش كتالوج. صورة واضحة للحاجة زي ما هي دلوقتي.") {
        Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
            TeswaPrimaryAction(
                text = "اختار صور",
                icon = TeswaIcons.Gallery,
                onClick = onGallery,
                enabled = draft.images.size < AddItemDraft.MAX_IMAGES,
                modifier = Modifier.weight(1f),
            )
            TeswaSecondaryAction(
                text = "كاميرا",
                icon = TeswaIcons.Camera,
                onClick = onCamera,
                enabled = draft.images.size < AddItemDraft.MAX_IMAGES,
                modifier = Modifier.weight(1f),
            )
        }
        if (draft.images.isNotEmpty()) {
            Spacer(Modifier.height(TeswaSpacing.md))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                draft.images.forEachIndexed { index, image ->
                    Column(modifier = Modifier.width(if (index == 0) 152.dp else 112.dp)) {
                        Box {
                            LocalContentImage(
                                uri = image.uri,
                                contentDescription = image.displayName,
                                resolver = LocalContext.current.contentResolver,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(if (index == 0) .82f else 1f)
                                    .clip(RoundedCornerShape(if (index == 0) TeswaRadius.hero else TeswaRadius.md)),
                            )
                            Surface(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(TeswaSpacing.xs)
                                    .clickable { onRemoveImage(image.uri) },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surface.copy(alpha = .92f),
                            ) {
                                Icon(
                                    imageVector = TeswaIcons.Clear,
                                    contentDescription = "شيل الصورة",
                                    modifier = Modifier.padding(TeswaSpacing.xs).size(18.dp),
                                )
                            }
                            if (index == 0) {
                                TeswaArchiveLabel(
                                    text = "الغلاف",
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(TeswaSpacing.xs),
                                )
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(TeswaSpacing.xs))
        Text(
            "${draft.images.size} / ${AddItemDraft.MAX_IMAGES} صور",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    FormSection("اسمها ونوعها", "سمّي الحاجة زي ما إنت بتسميها، وبعدها حطها في أقرب نوع.") {
        TeswaTextField(
            value = draft.title,
            onValueChange = onTitle,
            label = "اسم الحاجة",
            supportingText = "${draft.title.length} / 160",
        )
        Spacer(Modifier.height(TeswaSpacing.md))
        when (categoriesState) {
            AddItemCategoriesState.Loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(TeswaSpacing.sm))
                Text("بنجيب الأنواع…")
            }
            is AddItemCategoriesState.Error -> Column {
                Text(categoriesState.message, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(text = "إعادة المحاولة", onClick = onRetryCategories)
            }
            is AddItemCategoriesState.Ready -> Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                categoriesState.values.forEach { category ->
                    TeswaChoiceChip(
                        label = category.nameAr,
                        selected = draft.categoryId == category.id,
                        onClick = { onCategory(category.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailsSection(
    draft: AddItemDraft,
    update: (ItemCondition, String, String, String, String) -> Unit,
    locationWorking: Boolean,
    onUseLocation: () -> Unit,
    onClearLocation: () -> Unit,
) {
    FormSection("أثر الاستخدام", "قول حالتها زي ما هي. الخدش أو الاستعمال جزء من ماضي الحاجة، مش حاجة نخبيها.") {
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            ItemCondition.entries.forEach { value ->
                TeswaChoiceChip(
                    label = value.label,
                    selected = draft.condition == value,
                    onClick = { update(value, draft.conditionNotes, draft.description, draft.city, draft.area) },
                )
            }
        }
        Spacer(Modifier.height(TeswaSpacing.md))
        LongField("ملاحظات عن الحالة", draft.conditionNotes, 1_000) {
            update(draft.condition, it, draft.description, draft.city, draft.area)
        }
    }

    FormSection("الحاجة نفسها", "المعلومة المفيدة أهم من كلام بيع. المقاس، العمر، الملحقات أو أي تفصيلة تفرق.") {
        LongField("الوصف", draft.description, 4_000, minLines = 4) {
            update(draft.condition, draft.conditionNotes, it, draft.city, draft.area)
        }
        Spacer(Modifier.height(TeswaSpacing.md))
        Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
            TeswaTextField(
                value = draft.city,
                onValueChange = { update(draft.condition, draft.conditionNotes, draft.description, it, draft.area) },
                label = "المدينة",
                modifier = Modifier.weight(1f),
            )
            TeswaTextField(
                value = draft.area,
                onValueChange = { update(draft.condition, draft.conditionNotes, draft.description, draft.city, it) },
                label = "المنطقة",
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(TeswaSpacing.sm))
        if (draft.locationLatitude == null) {
            TeswaSecondaryAction(
                text = if (locationWorking) "بنعرف موقعك…" else "استخدم موقعي التقريبي",
                icon = TeswaIcons.Location,
                enabled = !locationWorking,
                onClick = onUseLocation,
            )
            Text(
                "اختياري، ويُستخدم عشان يظهر القريب من غير ما نحول الموقع لعالم مستقل.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(TeswaIcons.Location, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                Text("الموقع التقريبي محفوظ", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Text(
                    "إزالة",
                    modifier = Modifier.clickable(onClick = onClearLocation).padding(TeswaSpacing.xs),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun ExchangeSection(
    draft: AddItemDraft,
    update: (DesireMode, String, String, String, String) -> Unit,
) {
    FormSection("مفتوح لإيه؟", "دي رغبتك، مش سعر ولا تقييم عدالة. سيب مساحة لاقتراح من حاجة ماجتش في بالك.") {
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            DesireMode.entries.forEach { value ->
                TeswaChoiceChip(
                    label = value.label,
                    selected = draft.desireMode == value,
                    onClick = { update(value, draft.desireText, draft.itemStory, draft.swapReason, draft.goodFor) },
                )
            }
        }
        Spacer(Modifier.height(TeswaSpacing.md))
        LongField(
            "تفاصيل المقابل${if (draft.desireMode == DesireMode.SPECIFIC) " *" else ""}",
            draft.desireText,
            1_000,
        ) {
            update(draft.desireMode, it, draft.itemStory, draft.swapReason, draft.goodFor)
        }
    }

    FormSection("أثر من حياتها", "اختياري. سطر صادق كفاية يخلي الحاجة تحس إنها جاية من حياة، مش من كتالوج.") {
        LongField("حكاية الحاجة", draft.itemStory, 600, minLines = 3) {
            update(draft.desireMode, draft.desireText, it, draft.swapReason, draft.goodFor)
        }
        Spacer(Modifier.height(TeswaSpacing.sm))
        LongField("ليه بتفتحها للتبديل؟", draft.swapReason, 240) {
            update(draft.desireMode, draft.desireText, draft.itemStory, it, draft.goodFor)
        }
        Spacer(Modifier.height(TeswaSpacing.sm))
        LongField("ممكن تناسب مين؟", draft.goodFor, 240) {
            update(draft.desireMode, draft.desireText, draft.itemStory, draft.swapReason, it)
        }
    }

    PublishSummary(draft)
}

@Composable
private fun PublishSummary(draft: AddItemDraft) {
    val context = LocalContext.current
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.PutIntoPlay,
                color = MaterialTheme.colorScheme.primary,
                size = 32.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text("آخر نظرة وهي عندك", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "بعد النشر نفس الحاجة هتسيب حدود دولابك وتظهر كاحتمال عام.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .28f),
            shape = MaterialTheme.shapes.extraLarge,
            tonalElevation = 0.dp,
        ) {
            Column(
                modifier = Modifier.padding(TeswaSpacing.lg),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
            ) {
                draft.images.firstOrNull()?.let { image ->
                    Box {
                        LocalContentImage(
                            uri = image.uri,
                            contentDescription = draft.title.ifBlank { "الحاجة" },
                            resolver = context.contentResolver,
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(.86f)
                                .clip(RoundedCornerShape(TeswaRadius.hero)),
                        )
                        TeswaArchiveLabel(
                            text = "PRIVATE → POSSIBLE",
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(TeswaSpacing.sm),
                        )
                    }
                } ?: Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .background(
                            MaterialTheme.colorScheme.surface,
                            RoundedCornerShape(TeswaRadius.hero),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    TeswaMarkIcon(
                        mark = TeswaMark.PutIntoPlay,
                        color = MaterialTheme.colorScheme.primary,
                        size = 54.dp,
                    )
                }

                Text(
                    draft.title.ifBlank { "من غير اسم" },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                val place = listOf(draft.area, draft.city).filter(String::isNotBlank).joinToString(" · ")
                Text(
                    listOfNotNull(
                        draft.condition.label,
                        place.takeIf { it.isNotBlank() },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                draft.desireText.takeIf { it.isNotBlank() }?.let {
                    TeswaTraceNote("مفتوحة لـ: $it")
                }
            }
        }
    }
}

@Composable
private fun AddItemActions(
    step: AddItemStep,
    submission: AddItemSubmissionState,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onPublish: () -> Unit,
    onCancel: () -> Unit,
) {
    val working = submission as? AddItemSubmissionState.Working
    Surface(tonalElevation = 2.dp) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = TeswaLayout.BottomCommitHorizontal, vertical = TeswaLayout.BottomCommitVertical),
        ) {
            if (working != null) {
                val text = when (val progress = working.progress) {
                    is AddItemPublishProgress.Uploading -> "رفع الصورة ${progress.current} من ${progress.total} — ${progress.percent}%"
                    AddItemPublishProgress.SavingListing -> "بنثبت الحاجة في اللعب…"
                }
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Spacer(Modifier.height(TeswaSpacing.xs))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text, style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = onCancel) { Text("إيقاف") }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    if (step != AddItemStep.BASICS) {
                        TeswaSecondaryAction(
                            text = "رجوع",
                            onClick = onBack,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    TeswaPrimaryAction(
                        text = if (step == AddItemStep.EXCHANGE) "حطّها في اللعب" else "كمّل",
                        icon = if (step == AddItemStep.EXCHANGE) TeswaIcons.PutIntoPlay else null,
                        onClick = if (step == AddItemStep.EXCHANGE) onPublish else onNext,
                        modifier = Modifier.weight(if (step == AddItemStep.BASICS) 1f else 2f),
                    )
                }
            }
        }
    }
}

@Composable
private fun AddItemSuccess(modifier: Modifier, onHome: () -> Unit, onAnother: () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        TeswaMarkIcon(
            mark = TeswaMark.PutIntoPlay,
            color = MaterialTheme.colorScheme.primary,
            size = 72.dp,
        )
        Spacer(Modifier.height(TeswaSpacing.xl))
        TeswaArchiveLabel("في اللعب")
        Spacer(Modifier.height(TeswaSpacing.md))
        Text("الحاجة خرجت للنور", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(TeswaSpacing.xs))
        Text(
            "نفس الحاجة اللي كانت في دولابك بقت دلوقتي احتمال يقدر حد تاني يدخل معاك فيه.",
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(TeswaSpacing.xl))
        TeswaPrimaryAction(text = "شوف الاحتمالات", onClick = onHome)
        Spacer(Modifier.height(TeswaSpacing.xs))
        TeswaSecondaryAction(text = "جهّز حاجة تانية", onClick = onAnother)
    }
}

@Composable
private fun FormSection(title: String, hint: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(TeswaSpacing.xxs))
        Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(TeswaSpacing.sm))
        content()
    }
}

@Composable
private fun LongField(
    label: String,
    value: String,
    max: Int,
    minLines: Int = 2,
    onValue: (String) -> Unit,
) {
    TeswaTextField(
        value = value,
        onValueChange = { onValue(it.take(max)) },
        label = label,
        supportingText = "${value.length} / $max",
        singleLine = false,
        minLines = minLines,
        maxLines = maxOf(minLines, 6),
    )
}

@Composable
private fun InlineError(message: String) {
    TeswaInlineMessage(
        title = "الخطوة مكملتش",
        body = message,
        icon = TeswaIcons.Refresh,
        emphasis = TeswaEmphasis.Strong,
    )
}
