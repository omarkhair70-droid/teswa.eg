package com.teswa.mobile.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.settings.SettingsRepository
import com.teswa.mobile.feature.settings.SettingsScreen
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    initialSession: AuthSession,
    repository: ProfileRepository,
    settingsRepository: SettingsRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onAddItem: () -> Unit,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { ProfileStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()
    var listingConfirmation by remember { mutableStateOf<Pair<MyListing, ListingAction>?>(null) }
    var showingSettings by remember { mutableStateOf(false) }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    if (showingSettings) {
        SettingsScreen(
            initialSession = holder.session,
            repository = settingsRepository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = { showingSettings = false },
            onSignOut = onSignOut,
            modifier = modifier,
        )
        return
    }

    holder.editDraft?.let { draft ->
        ProfileEditContent(holder, draft, modifier)
        return
    }

    when (val state = holder.state) {
        ProfileUiState.Loading -> ProfileCenter("بنحمّل مساحتك…", modifier, loading = true)
        is ProfileUiState.Error -> ProfileCenter(
            state.message,
            modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "تسجيل الخروج" to { scope.launch { onSignOut() } },
        )
        is ProfileUiState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Column(Modifier.fillMaxWidth()) {
                    Text("مساحتك على تِسوى", style = MaterialTheme.typography.bodySmall)
                    Text("ملفي", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                }
            }
            item { ProfileHero(state.overview.profile) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Button(onClick = holder::beginEdit, modifier = Modifier.weight(1f)) { Text("تعديل الملف") }
                    OutlinedButton(onClick = { showingSettings = true }, modifier = Modifier.weight(1f)) { Text("الإعدادات") }
                }
                TextButton(onClick = { scope.launch { holder.load(silent = true) } }, modifier = Modifier.fillMaxWidth()) { Text("تحديث البيانات") }
            }
            holder.message?.let { message -> item { ProfileMessage(message) } }
            state.overview.profile.bio?.let { bio ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("عنّي", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(5.dp)); Text(bio, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("حاجتك", style = MaterialTheme.typography.titleLarge)
                        Text("كل الحالات، من النشط للمؤرشف", style = MaterialTheme.typography.bodySmall)
                    }
                    Button(onClick = onAddItem) { Text("إضافة") }
                }
            }
            if (state.overview.listings.isEmpty()) {
                item {
                    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .4f)) {
                        Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("لسه مفيش حاجة معروضة", style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.height(5.dp)); Text("أول عنصر هيفتح لك باب عروض التبديل.")
                            Spacer(Modifier.height(14.dp)); Button(onClick = onAddItem) { Text("اعرض أول عنصر") }
                        }
                    }
                }
            } else {
                items(state.overview.listings, key = { it.id }) { listing ->
                    MyListingCard(
                        listing,
                        working = holder.actingListingId == listing.id,
                        onAction = { action -> listingConfirmation = listing to action },
                    )
                }
            }
            item {
                OutlinedButton(onClick = { scope.launch { onSignOut() } }, modifier = Modifier.fillMaxWidth()) {
                    Text("تسجيل الخروج")
                }
            }
        }
    }

    listingConfirmation?.let { (listing, action) ->
        AlertDialog(
            onDismissRequest = { listingConfirmation = null },
            title = { Text(actionTitle(action)) },
            text = { Text(actionDescription(action, listing.title)) },
            confirmButton = {
                Button(onClick = {
                    listingConfirmation = null
                    scope.launch { holder.actOnListing(listing, action) }
                }) { Text(actionButton(action)) }
            },
            dismissButton = { TextButton(onClick = { listingConfirmation = null }) { Text("رجوع") } },
        )
    }
}

@Composable
private fun ProfileHero(profile: MyProfile) {
    Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .5f)) {
        Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(96.dp).background(MaterialTheme.colorScheme.primaryContainer))
            Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 18.dp)) {
                Box(Modifier.size(84.dp).padding(top = 0.dp)) {
                    NetworkImage(
                        profile.avatarUrl,
                        profile.displayName,
                        Modifier.size(84.dp).clip(CircleShape),
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(profile.displayName, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("@${profile.username}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
                profile.profileTagline?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                val location = listOfNotNull(profile.area, profile.city).joinToString("، ")
                if (location.isNotBlank()) Text(location, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("${profile.successfulSwapsCount}", "تبديل ناجح", Modifier.weight(1f))
                    Stat(profile.responseRate?.let { "$it%" } ?: "—", "معدل الرد", Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface.copy(alpha = .75f)) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun MyListingCard(listing: MyListing, working: Boolean, onAction: (ListingAction) -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            NetworkImage(listing.imageUrl, listing.title, Modifier.size(86.dp).clip(MaterialTheme.shapes.medium))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(listing.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(listing.category, listing.city).joinToString(" • "), style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(6.dp))
                Text(listingStatus(listing.status), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                if (listing.openIncomingOffersCount > 0) {
                    Text("${listing.openIncomingOffersCount} عروض مفتوحة", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(8.dp))
                if (working) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                } else when (listing.status) {
                    "active" -> OutlinedButton(onClick = { onAction(ListingAction.ARCHIVE) }) { Text("أرشفة") }
                    "archived" -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(onClick = { onAction(ListingAction.REACTIVATE) }) { Text("إعادة نشر") }
                        TextButton(onClick = { onAction(ListingAction.DELETE_ARCHIVED) }) { Text("حذف") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileEditContent(holder: ProfileStateHolder, draft: ProfileEditDraft, modifier: Modifier) {
    val scope = rememberCoroutineScope()
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = holder::cancelEdit, enabled = !holder.savingProfile) { Text("رجوع") }
                Spacer(Modifier.width(12.dp)); Text("تعديل الملف", style = MaterialTheme.typography.headlineSmall)
            }
        }
        item { EditField("الاسم", draft.displayName, 80) { holder.updateDraft(draft.copy(displayName = it)) } }
        item { EditField("اسم المستخدم", draft.username, 30) { holder.updateDraft(draft.copy(username = it.lowercase())) } }
        item { EditField("جملة تعريفية", draft.profileTagline, 160) { holder.updateDraft(draft.copy(profileTagline = it)) } }
        item { EditField("نبذة", draft.bio, 1_000, 4) { holder.updateDraft(draft.copy(bio = it)) } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EditField("المدينة", draft.city, 120, modifier = Modifier.weight(1f)) { holder.updateDraft(draft.copy(city = it)) }
                EditField("المنطقة", draft.area, 120, modifier = Modifier.weight(1f)) { holder.updateDraft(draft.copy(area = it)) }
            }
        }
        holder.message?.let { item { ProfileMessage(it) } }
        item {
            Button(
                onClick = { scope.launch { holder.saveProfile() } },
                modifier = Modifier.fillMaxWidth(),
                enabled = !holder.savingProfile,
            ) { Text(if (holder.savingProfile) "جاري الحفظ…" else "حفظ التغييرات") }
        }
    }
}

@Composable
private fun EditField(
    label: String,
    value: String,
    max: Int,
    minLines: Int = 1,
    modifier: Modifier = Modifier.fillMaxWidth(),
    onValue: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onValue(it.take(max)) },
        modifier = modifier,
        label = { Text(label) },
        minLines = minLines,
        maxLines = maxOf(minLines, 5),
        supportingText = { Text("${value.length} / $max") },
    )
}

@Composable
private fun ProfileMessage(message: String) {
    Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.error.copy(alpha = .1f)) {
        Text(message, Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun ProfileCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
) {
    Column(modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(12.dp)) }
        Text(message, textAlign = TextAlign.Center)
        primary?.let { Spacer(Modifier.height(16.dp)); Button(onClick = it.second, modifier = Modifier.fillMaxWidth()) { Text(it.first) } }
        secondary?.let { Spacer(Modifier.height(8.dp)); OutlinedButton(onClick = it.second, modifier = Modifier.fillMaxWidth()) { Text(it.first) } }
    }
}

private fun listingStatus(value: String) = when (value) {
    "active" -> "نشط"
    "reserved" -> "محجوز لصفقة"
    "swapped" -> "تم تبديله"
    "archived" -> "مؤرشف"
    else -> value
}

private fun actionTitle(action: ListingAction) = when (action) {
    ListingAction.ARCHIVE -> "أرشفة العنصر؟"
    ListingAction.REACTIVATE -> "إعادة نشر العنصر؟"
    ListingAction.DELETE_ARCHIVED -> "حذف العنصر نهائيًا؟"
}

private fun actionButton(action: ListingAction) = when (action) {
    ListingAction.ARCHIVE -> "أرشفة"
    ListingAction.REACTIVATE -> "إعادة نشر"
    ListingAction.DELETE_ARCHIVED -> "حذف نهائي"
}

private fun actionDescription(action: ListingAction, title: String) = when (action) {
    ListingAction.ARCHIVE -> "هيختفي «$title» من السوق، وتقدر تعيد نشره لاحقًا لو مفيش عروض مفتوحة."
    ListingAction.REACTIVATE -> "«$title» هيرجع ظاهر للناس ويستقبل عروض جديدة."
    ListingAction.DELETE_ARCHIVED -> "الحذف النهائي ما ينفعش يتراجع، وOracle هيرفضه لو للعنصر تاريخ صفقة."
}
