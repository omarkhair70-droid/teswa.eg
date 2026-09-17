package com.teswa.mobile.feature.additem

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.ui.LocalContentImage
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaSize
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.performTeswa
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job

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
        androidx.compose.foundation.rememberScrollState().let { scroll ->
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(scroll)
                    .padding(horizontal = 18.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
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
    Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp)) {
        Text("اعرض حاجة للتبديل", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(5.dp))
        Text(
            when (step) {
                AddItemStep.BASICS -> "خلّي أول انطباع واضح وحقيقي"
                AddItemStep.DETAILS -> "وصف صادق يسهّل قرار التبديل"
                AddItemStep.EXCHANGE -> "قول إيه اللي يناسبك قبل النشر"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            repeat(3) { position ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(4.dp)
                        .clip(CircleShape)
                        .background(
                            if (position < index) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.surfaceVariant,
                        ),
                )
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .18f))
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
    FormSection("الصور", "صورة الغلاف هي أول صورة. استخدم لقطات واضحة ومن غير فلاتر مضللة.") {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onGallery, enabled = draft.images.size < AddItemDraft.MAX_IMAGES) { Text("اختار صور") }
            OutlinedButton(onClick = onCamera, enabled = draft.images.size < AddItemDraft.MAX_IMAGES) { Text("التقط صورة") }
        }
        if (draft.images.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                draft.images.forEachIndexed { index, image ->
                    Column(modifier = Modifier.width(116.dp)) {
                        Box {
                            LocalContentImage(
                                uri = image.uri,
                                contentDescription = image.displayName,
                                resolver = LocalContext.current.contentResolver,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(16.dp)),
                            )
                            Surface(
                                modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).clickable { onRemoveImage(image.uri) },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surface.copy(alpha = .9f),
                            ) { Text("×", modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp), fontWeight = FontWeight.Bold) }
                        }
                        Spacer(Modifier.height(5.dp))
                        Text(
                            if (index == 0) "الغلاف" else "صورة ${index + 1}",
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("${draft.images.size} / ${AddItemDraft.MAX_IMAGES}", style = MaterialTheme.typography.labelMedium)
    }
    FormSection("الاسم والفئة", "اكتب الاسم اللي الناس هتدور بيه.") {
        OutlinedTextField(
            value = draft.title,
            onValueChange = onTitle,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("اسم العنصر") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            supportingText = { Text("${draft.title.length} / 160") },
        )
        Spacer(Modifier.height(12.dp))
        when (categoriesState) {
            AddItemCategoriesState.Loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp)); Text("جاري تحميل الفئات…")
            }
            is AddItemCategoriesState.Error -> Column {
                Text(categoriesState.message, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp)); OutlinedButton(onClick = onRetryCategories) { Text("إعادة المحاولة") }
            }
            is AddItemCategoriesState.Ready -> Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                categoriesState.values.forEach { category ->
                    ChoicePill(category.nameAr, draft.categoryId == category.id) { onCategory(category.id) }
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
    FormSection("حالة العنصر", "الوضوح هنا بيمنع خلافات بعدين.") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ItemCondition.entries.forEach { value ->
                ChoiceCard(value.label, draft.condition == value) { update(value, draft.conditionNotes, draft.description, draft.city, draft.area) }
            }
        }
        Spacer(Modifier.height(12.dp))
        LongField("ملاحظات عن الحالة", draft.conditionNotes, 1_000) {
            update(draft.condition, it, draft.description, draft.city, draft.area)
        }
    }
    FormSection("تفاصيل مفيدة", "اذكر المقاس، العمر، الملحقات أو أي معلومة مهمة.") {
        LongField("الوصف", draft.description, 4_000, minLines = 4) {
            update(draft.condition, draft.conditionNotes, it, draft.city, draft.area)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                value = draft.city,
                onValueChange = { update(draft.condition, draft.conditionNotes, draft.description, it, draft.area) },
                modifier = Modifier.weight(1f), label = { Text("المدينة") }, singleLine = true,
            )
            OutlinedTextField(
                value = draft.area,
                onValueChange = { update(draft.condition, draft.conditionNotes, draft.description, draft.city, it) },
                modifier = Modifier.weight(1f), label = { Text("المنطقة") }, singleLine = true,
            )
        }
        Spacer(Modifier.height(10.dp))
        if (draft.locationLatitude == null) {
            OutlinedButton(enabled = !locationWorking, onClick = onUseLocation, modifier = Modifier.fillMaxWidth()) {
                Text(if (locationWorking) "بنعرف موقعك…" else "استخدم موقعي التقريبي")
            }
            Text(
                "اختياري، ويُستخدم مرة واحدة عشان العنصر يظهر في الأقرب لي.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .55f)) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("تم حفظ موقع تقريبي", style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = onClearLocation) { Text("إزالة") }
                }
            }
        }
    }
}

@Composable
private fun ExchangeSection(
    draft: AddItemDraft,
    update: (DesireMode, String, String, String, String) -> Unit,
) {
    FormSection("إيه اللي يناسبك؟", "ده تفضيل يساعد الناس تقدم عرض مناسب، ومش بيقفل باب الاقتراحات.") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            DesireMode.entries.forEach { value ->
                ChoiceCard(value.label, draft.desireMode == value) {
                    update(value, draft.desireText, draft.itemStory, draft.swapReason, draft.goodFor)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        LongField("تفاصيل المقابل${if (draft.desireMode == DesireMode.SPECIFIC) " *" else ""}", draft.desireText, 1_000) {
            update(draft.desireMode, it, draft.itemStory, draft.swapReason, draft.goodFor)
        }
    }
    FormSection("السياق الإنساني", "اختياري، لكنه بيخلّي العرض مفهوم بدل ما يكون مجرد صورة.") {
        LongField("حكاية العنصر", draft.itemStory, 600, minLines = 3) {
            update(draft.desireMode, draft.desireText, it, draft.swapReason, draft.goodFor)
        }
        Spacer(Modifier.height(10.dp))
        LongField("ليه عايز تبدّله؟", draft.swapReason, 240) {
            update(draft.desireMode, draft.desireText, draft.itemStory, it, draft.goodFor)
        }
        Spacer(Modifier.height(10.dp))
        LongField("مناسب لمين؟", draft.goodFor, 240) {
            update(draft.desireMode, draft.desireText, draft.itemStory, draft.swapReason, it)
        }
    }
    PublishSummary(draft)
}

@Composable
private fun PublishSummary(draft: AddItemDraft) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .55f)) {
        Column(Modifier.padding(16.dp)) {
            Text("مراجعة سريعة", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(draft.title.ifBlank { "من غير اسم" }, fontWeight = FontWeight.SemiBold)
            Text("${draft.images.size} صور • ${draft.condition.label}", style = MaterialTheme.typography.bodySmall)
            if (draft.city.isNotBlank()) Text(listOf(draft.area, draft.city).filter(String::isNotBlank).joinToString("، "), style = MaterialTheme.typography.bodySmall)
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
    Surface(shadowElevation = 10.dp) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp)) {
            if (working != null) {
                val text = when (val progress = working.progress) {
                    is AddItemPublishProgress.Uploading -> "رفع الصورة ${progress.current} من ${progress.total} — ${progress.percent}%"
                    AddItemPublishProgress.SavingListing -> "تثبيت الإعلان…"
                }
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Spacer(Modifier.height(7.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(text, style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = onCancel) { Text("إيقاف") }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (step != AddItemStep.BASICS) OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("رجوع") }
                    Button(
                        onClick = if (step == AddItemStep.EXCHANGE) onPublish else onNext,
                        modifier = Modifier.weight(if (step == AddItemStep.BASICS) 1f else 2f),
                    ) { Text(if (step == AddItemStep.EXCHANGE) "انشر العنصر" else "كمّل") }
                }
            }
        }
    }
}

@Composable
private fun AddItemSuccess(modifier: Modifier, onHome: () -> Unit, onAnother: () -> Unit) {
    Column(
        modifier = modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
            Icon(
                imageVector = TeswaIcons.Accepted,
                contentDescription = null,
                modifier = Modifier.padding(TeswaSpacing.md).size(TeswaSize.iconHero),
            )
        }
        Spacer(Modifier.height(20.dp))
        Text("العنصر اتنشر", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text("بقى ظاهر في تِسوى وجاهز يستقبل عروض مناسبة.", textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onHome, modifier = Modifier.fillMaxWidth()) { Text("شوف الرئيسية") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onAnother, modifier = Modifier.fillMaxWidth()) { Text("اعرض عنصر تاني") }
    }
}

@Composable
private fun FormSection(title: String, hint: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(TeswaSpacing.xxs))
        Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(TeswaSpacing.sm))
        content()
    }
}

@Composable
private fun ChoiceCard(label: String, selected: Boolean, onClick: () -> Unit) {
    TeswaChoiceChip(label = label, selected = selected, onClick = onClick, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun ChoicePill(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = CircleShape,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    ) { Text(label, modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp), style = MaterialTheme.typography.labelLarge) }
}

@Composable
private fun LongField(label: String, value: String, max: Int, minLines: Int = 2, onValue: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { onValue(it.take(max)) },
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        minLines = minLines,
        supportingText = { Text("${value.length} / $max") },
    )
}

@Composable
private fun InlineError(message: String) {
    Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.error.copy(alpha = .1f)) {
        Text(
            message,
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}
