package com.teswa.mobile.feature.profile

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.LocalContentImage
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun ProfileImageEditor(holder: ProfileStateHolder) {
    val profile = holder.currentProfile ?: return
    val context = LocalContext.current
    val resolver = remember(context) { ProfileImageResolver(context) }
    val scope = rememberCoroutineScope()
    var pendingKind by remember { mutableStateOf<ProfileImageKind?>(null) }
    var cameraTarget by remember { mutableStateOf<ProfileImageCameraTarget?>(null) }
    var avatarDraft by remember { mutableStateOf<ProfileImageAsset?>(null) }
    var coverDraft by remember { mutableStateOf<ProfileImageAsset?>(null) }

    fun accept(kind: ProfileImageKind, asset: ProfileImageAsset?) {
        if (asset == null) {
            holder.showImageError("تعذر قراءة الصورة أو نوعها أو حجمها غير مدعوم.")
        } else if (kind == ProfileImageKind.AVATAR) {
            avatarDraft = asset
        } else {
            coverDraft = asset
        }
    }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val kind = pendingKind
        pendingKind = null
        if (uri != null && kind != null) {
            runCatching { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            accept(kind, resolver.resolve(uri, "${kind.pathSegment}.jpg"))
        }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val target = cameraTarget
        val kind = pendingKind
        cameraTarget = null
        pendingKind = null
        if (saved && target != null && kind != null) {
            accept(kind, resolver.resolve(target.uri, "${kind.pathSegment}.jpg"))
        } else {
            target?.discard()
        }
    }

    fun openGallery(kind: ProfileImageKind) {
        pendingKind = kind
        gallery.launch(ProfileImageAsset.SUPPORTED_TYPES.toTypedArray())
    }

    fun openCamera(kind: ProfileImageKind) {
        runCatching { resolver.createCameraTarget(kind) }
            .onSuccess { target ->
                pendingKind = kind
                cameraTarget = target
                camera.launch(target.uri)
            }
            .onFailure { holder.showImageError("تعذر فتح الكاميرا دلوقتي.") }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth()) {
                ProfileImagePreview(
                    local = coverDraft,
                    remote = profile.coverUrl,
                    description = "غلاف الملف",
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 7f),
                )
                Text(
                    "الغلاف",
                    modifier = Modifier.align(Alignment.TopEnd).padding(10.dp)
                        .background(MaterialTheme.colorScheme.scrim.copy(alpha = .62f), MaterialTheme.shapes.small)
                        .padding(horizontal = 9.dp, vertical = 5.dp),
                    color = MaterialTheme.colorScheme.inverseOnSurface,
                    style = MaterialTheme.typography.labelMedium,
                )
            }

            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ProfileImagePreview(
                        local = avatarDraft,
                        remote = profile.avatarUrl,
                        description = "صورة الملف",
                        modifier = Modifier.size(88.dp).clip(CircleShape),
                    )
                    Spacer(Modifier.width(13.dp))
                    Column(Modifier.weight(1f)) {
                        Text("صورتك على تِسوى", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("صورة واضحة وغلاف هادي بيخلّوا الملف أسهل في التعرّف.", style = MaterialTheme.typography.bodySmall)
                    }
                }

                ImageActions(
                    label = "صورة الملف",
                    kind = ProfileImageKind.AVATAR,
                    hasDraft = avatarDraft != null,
                    hasCurrent = profile.avatarUrl != null,
                    busy = holder.imageBusyKind,
                    onGallery = ::openGallery,
                    onCamera = ::openCamera,
                    onSave = {
                        val asset = avatarDraft ?: return@ImageActions
                        scope.launch { if (holder.replaceImage(ProfileImageKind.AVATAR, asset)) avatarDraft = null }
                    },
                    onCancel = { avatarDraft = null },
                    onRemove = { scope.launch { holder.removeImage(ProfileImageKind.AVATAR) } },
                )
                ImageActions(
                    label = "الغلاف",
                    kind = ProfileImageKind.COVER,
                    hasDraft = coverDraft != null,
                    hasCurrent = profile.coverUrl != null,
                    busy = holder.imageBusyKind,
                    onGallery = ::openGallery,
                    onCamera = ::openCamera,
                    onSave = {
                        val asset = coverDraft ?: return@ImageActions
                        scope.launch { if (holder.replaceImage(ProfileImageKind.COVER, asset)) coverDraft = null }
                    },
                    onCancel = { coverDraft = null },
                    onRemove = { scope.launch { holder.removeImage(ProfileImageKind.COVER) } },
                )
                if (holder.imageBusyKind != null) {
                    LinearProgressIndicator(
                        progress = { holder.imageProgress / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("جاري رفع الصورة ${holder.imageProgress}%", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(2.dp))
            }
        }
    }
}

@Composable
private fun ProfileImagePreview(
    local: ProfileImageAsset?,
    remote: String?,
    description: String,
    modifier: Modifier,
) {
    if (local != null) {
        LocalContentImage(local.uri, description, LocalContext.current.contentResolver, modifier)
    } else {
        NetworkImage(remote, description, modifier)
    }
}

@Composable
private fun ImageActions(
    label: String,
    kind: ProfileImageKind,
    hasDraft: Boolean,
    hasCurrent: Boolean,
    busy: ProfileImageKind?,
    onGallery: (ProfileImageKind) -> Unit,
    onCamera: (ProfileImageKind) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
    onRemove: () -> Unit,
) {
    val enabled = busy == null
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        if (hasDraft) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSave, enabled = enabled, modifier = Modifier.weight(1f)) { Text("حفظ") }
                OutlinedButton(onClick = onCancel, enabled = enabled, modifier = Modifier.weight(1f)) { Text("إلغاء") }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { onGallery(kind) }, enabled = enabled, modifier = Modifier.weight(1f)) { Text("المعرض") }
                OutlinedButton(onClick = { onCamera(kind) }, enabled = enabled, modifier = Modifier.weight(1f)) { Text("الكاميرا") }
                if (hasCurrent) TextButton(onClick = onRemove, enabled = enabled) { Text("حذف") }
            }
        }
    }
}
