package com.teswa.mobile.feature.additem

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.LocalContentImage
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaSpacing
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
        EditListingUiState.Loading -> Column(
            modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            CircularProgressIndicator()
            Spacer(Modifier.height(12.dp))
            Text("بنقرأ آخر نسخة من العنصر…")
        }

        is EditListingUiState.Error -> Column(
            modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(state.message, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(14.dp))
            Button(onClick = { scope.launch { holder.load() } }) { Text("حاول تاني") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onBack) { Text("رجوع") }
        }

        is EditListingUiState.Ready -> {
            val draft = holder.draft ?: return
            Column(modifier.fillMaxSize()) {
                Column(
                    Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())
                        .padding(horizontal = 18.dp, vertical = 18.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedButton(onClick = onBack, enabled = !holder.saving) { Text("رجوع") }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("عدّل نفس العنصر", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(
                                if (state.status == "active") "نشط في السوق — التاريخ والتفاعلات هيفضلوا كما هم"
                                else "مؤرشف — التعديل لا يعيد نشره تلقائيًا",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    holder.message?.let {
                        Surface(
                            shape = MaterialTheme.shapes.medium,
                            color = if (holder.messageIsError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
                        ) {
                            Text(
                                it,
                                Modifier.fillMaxWidth().padding(14.dp),
                                color = if (holder.messageIsError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                    }

                    EditFormSection("الصور", "نفس ميديا Add Item: صور حالية + صور جديدة، والصف الأول هو الغلاف.") {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                enabled = !holder.saving && draft.images.size < AddItemDraft.MAX_IMAGES,
                                onClick = { gallery.launch(AddItemDraft.SUPPORTED_IMAGE_TYPES.toTypedArray()) },
                            ) { Text("اختار صور") }
                            OutlinedButton(
                                enabled = !holder.saving && draft.images.size < AddItemDraft.MAX_IMAGES,
                                onClick = {
                                    runCatching { resolver.createCameraTarget() }
                                        .onSuccess { target -> cameraTarget = target; camera.launch(target.uri) }
                                        .onFailure { holder.showError("تعذر فتح الكاميرا دلوقتي.") }
                                },
                            ) { Text("الكاميرا") }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (draft.images.isEmpty()) {
                            Text("لازم صورة واحدة على الأقل.", color = MaterialTheme.colorScheme.error)
                        } else {
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                draft.images.forEachIndexed { index, image ->
                                    EditImageCard(
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
                        Spacer(Modifier.height(8.dp))
                        Text("${draft.images.size} / ${AddItemDraft.MAX_IMAGES}", style = MaterialTheme.typography.labelMedium)
                    }

                    EditFormSection("الاسم والفئة", "نفس تعريف الحاجة، من غير ما نخلق إعلان جديد.") {
                        OutlinedTextField(
                            value = draft.title,
                            onValueChange = { holder.updateBasics(title = it) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("اسم العنصر") },
                            singleLine = true,
                            supportingText = { Text("${draft.title.length} / 160") },
                            enabled = !holder.saving,
                        )
                        Spacer(Modifier.height(12.dp))
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            state.categories.forEach { category ->
                                EditChoicePill(
                                    label = category.nameAr,
                                    selected = draft.categoryId == category.id,
                                    enabled = !holder.saving,
                                ) { holder.updateBasics(categoryId = category.id) }
                            }
                        }
                    }

                    EditFormSection("الحالة والوصف", "الشفافية هنا أهم من تجميل الإعلان.") {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            ItemCondition.entries.forEach { condition ->
                                EditChoiceCard(condition.label, draft.condition == condition, !holder.saving) {
                                    holder.updateDetails(condition = condition)
                                }
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        EditLongField("ملاحظات الحالة", draft.conditionNotes, 1_000, !holder.saving) {
                            holder.updateDetails(conditionNotes = it)
                        }
                        Spacer(Modifier.height(10.dp))
                        EditLongField("الوصف", draft.description, 4_000, !holder.saving, minLines = 4) {
                            holder.updateDetails(description = it)
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = draft.city,
                                onValueChange = { holder.updateDetails(city = it) },
                                modifier = Modifier.weight(1f),
                                label = { Text("المدينة") },
                                singleLine = true,
                                enabled = !holder.saving,
                            )
                            OutlinedTextField(
                                value = draft.area,
                                onValueChange = { holder.updateDetails(area = it) },
                                modifier = Modifier.weight(1f),
                                label = { Text("المنطقة") },
                                singleLine = true,
                                enabled = !holder.saving,
                            )
                        }
                        Spacer(Modifier.height(5.dp))
                        Text(
                            "الموقع التقريبي المحفوظ للعنصر لا يتغيّر من الشاشة دي.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    EditFormSection("إيه اللي يناسبك؟", "عدّل نية التبديل والسياق من غير ما نغيّر هوية العنصر.") {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            DesireMode.entries.forEach { mode ->
                                EditChoiceCard(mode.label, draft.desireMode == mode, !holder.saving) {
                                    holder.updateExchange(desireMode = mode)
                                }
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        EditLongField(
                            "تفاصيل المقابل${if (draft.desireMode == DesireMode.SPECIFIC) " *" else ""}",
                            draft.desireText,
                            1_000,
                            !holder.saving,
                        ) { holder.updateExchange(desireText = it) }
                        Spacer(Modifier.height(10.dp))
                        EditLongField("حكاية العنصر", draft.itemStory, 600, !holder.saving, minLines = 3) {
                            holder.updateExchange(itemStory = it)
                        }
                        Spacer(Modifier.height(10.dp))
                        EditLongField("ليه عايز تبدّله؟", draft.swapReason, 240, !holder.saving) {
                            holder.updateExchange(swapReason = it)
                        }
                        Spacer(Modifier.height(10.dp))
                        EditLongField("مناسب لمين؟", draft.goodFor, 240, !holder.saving) {
                            holder.updateExchange(goodFor = it)
                        }
                    }

                    Surface(
                        shape = MaterialTheme.shapes.large,
                        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .5f),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text("مش بنبدأ من الصفر", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(5.dp))
                            Text(
                                "الحفظ يحدّث نفس itemId ونفس تاريخ الإعلان. الصور الجديدة فقط هي اللي بترتفع، والصور القديمة تتفضل موجودة حسب ترتيبك.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                Surface(shadowElevation = 10.dp) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 13.dp)) {
                        holder.progress?.let { current ->
                            LinearProgressIndicator(Modifier.fillMaxWidth())
                            Spacer(Modifier.height(6.dp))
                            Text(
                                when (current) {
                                    is EditListingProgress.Uploading -> "رفع صورة جديدة ${current.current} من ${current.total} — ${current.percent}%"
                                    EditListingProgress.Saving -> "تثبيت التعديلات على نفس العنصر…"
                                },
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Spacer(Modifier.height(8.dp))
                        }
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !holder.saving,
                            onClick = { scope.launch { holder.save() } },
                        ) { Text(if (holder.saving) "جارٍ الحفظ…" else "حفظ التعديلات") }
                    }
                }
            }
        }
    }
}

@Composable
private fun EditImageCard(
    image: EditListingImageDraft,
    index: Int,
    count: Int,
    enabled: Boolean,
    onPrimary: () -> Unit,
    onMoveBefore: () -> Unit,
    onMoveAfter: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(Modifier.width(170.dp)) {
        Column(Modifier.padding(10.dp)) {
            when (image) {
                is EditListingImageDraft.Existing -> NetworkImage(
                    url = image.image.imageUrl,
                    contentDescription = "صورة ${index + 1}",
                    modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)),
                )
                is EditListingImageDraft.New -> LocalContentImage(
                    uri = image.image.uri,
                    contentDescription = image.image.displayName,
                    resolver = LocalContext.current.contentResolver,
                    modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)),
                )
            }
            Spacer(Modifier.height(7.dp))
            Text(if (index == 0) "الغلاف" else "صورة ${index + 1}", fontWeight = FontWeight.SemiBold)
            Text(
                if (image is EditListingImageDraft.New) "جديدة" else "موجودة",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(7.dp))
            if (index > 0) {
                OutlinedButton(onClick = onPrimary, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("خليها الغلاف") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                OutlinedButton(
                    onClick = onMoveBefore,
                    enabled = enabled && index > 0,
                    modifier = Modifier.weight(1f),
                ) { Text("قبل") }
                OutlinedButton(
                    onClick = onMoveAfter,
                    enabled = enabled && index < count - 1,
                    modifier = Modifier.weight(1f),
                ) { Text("بعد") }
            }
            OutlinedButton(onClick = onRemove, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("حذف") }
        }
    }
}

@Composable
private fun EditFormSection(title: String, hint: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(TeswaSpacing.xxs))
        Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(TeswaSpacing.sm))
        content()
    }
}

@Composable
private fun EditChoiceCard(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    TeswaChoiceChip(
        label = label,
        selected = selected,
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
    )
}

@Composable
private fun EditChoicePill(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(enabled = enabled, onClick = onClick),
        shape = CircleShape,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    ) {
        Text(label, Modifier.padding(horizontal = 15.dp, vertical = 9.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun EditLongField(
    label: String,
    value: String,
    max: Int,
    enabled: Boolean,
    minLines: Int = 2,
    onValue: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onValue(it.take(max)) },
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        label = { Text(label) },
        minLines = minLines,
        supportingText = { Text("${value.length} / $max") },
        enabled = enabled,
    )
}
