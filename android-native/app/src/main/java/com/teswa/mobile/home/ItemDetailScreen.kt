package com.teswa.mobile.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.EditListingRepository
import com.teswa.mobile.feature.additem.EditListingScreen
import com.teswa.mobile.feature.offers.OfferCreationScreen
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaBottomCommitBar
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEvidenceLine
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectStage
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import kotlinx.coroutines.launch

@Composable
fun ItemDetailScreen(
    itemId: String,
    initialSession: AuthSession,
    client: OracleHomeClient,
    editListingRepository: EditListingRepository,
    offersRepository: OffersRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onOfferCreated: () -> Unit,
    onAddItem: () -> Unit,
    onOpenOwner: (String) -> Unit,
    onReport: (ReportTarget) -> Unit,
) {
    val holder = remember(itemId, client) { ItemDetailStateHolder(itemId, initialSession, client) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var creatingOffer by remember(itemId) { mutableStateOf(false) }
    var editing by remember(itemId) { mutableStateOf(false) }
    var sharing by remember(itemId) { mutableStateOf(false) }
    var shareMessage by remember(itemId) { mutableStateOf<String?>(null) }

    BackHandler {
        when {
            editing -> {
                editing = false
                scope.launch { holder.load() }
            }
            creatingOffer -> creatingOffer = false
            else -> onBack()
        }
    }

    LaunchedEffect(itemId, initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }

    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    if (editing) {
        EditListingScreen(
            itemId = itemId,
            initialSession = holder.session,
            repository = editListingRepository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = {
                editing = false
                scope.launch { holder.load() }
            },
        )
        return
    }

    if (creatingOffer) {
        OfferCreationScreen(
            requestedItemId = itemId,
            initialSession = holder.session,
            repository = offersRepository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = { creatingOffer = false },
            onAddItem = onAddItem,
            onOfferSent = onOfferCreated,
        )
        return
    }

    when (val current = holder.state) {
        ItemDetailUiState.Loading -> {
            Column(Modifier.fillMaxSize()) {
                TeswaFocusedHeader(title = "الحاجة", onBack = onBack)
                TeswaInlineLoading("بنحمّل تفاصيل الحاجة…", Modifier.padding(TeswaLayout.ScreenHorizontal))
            }
        }

        is ItemDetailUiState.Error -> {
            Column(Modifier.fillMaxSize()) {
                TeswaFocusedHeader(title = "الحاجة", onBack = onBack)
                TeswaInlineMessage(
                    title = "مش قادرين نعرض الحاجة دلوقتي",
                    body = current.message,
                    icon = TeswaIcons.Refresh,
                    emphasis = TeswaEmphasis.Strong,
                    actionLabel = "حاول تاني",
                    onAction = { scope.launch { holder.load() } },
                    modifier = Modifier.padding(TeswaLayout.ScreenHorizontal),
                )
            }
        }

        is ItemDetailUiState.Content -> {
            val detail = current.detail
            val isMine = detail.ownerId == holder.session.user.id
            val owner = detail.ownerDisplayName ?: detail.ownerUsername
            val meta = listOfNotNull(detail.condition, detail.city, detail.area).joinToString(" · ")
            Column(Modifier.fillMaxSize()) {
                TeswaFocusedHeader(
                    title = if (isMine) "من دولابك" else "حاجة ممكنة",
                    onBack = onBack,
                    actionIcon = if (isMine) TeswaIcons.Edit else TeswaIcons.Report,
                    actionDescription = if (isMine) "تعديل الحاجة" else "الإبلاغ عن الحاجة",
                    onAction = if (isMine) ({ editing = true }) else ({ onReport(ReportTarget.Item(detail.id, detail.title)) }),
                )
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = TeswaLayout.FocusedContentPadding,
                    verticalArrangement = Arrangement.spacedBy(TeswaLayout.SectionGap),
                ) {
                    item {
                        TeswaObjectStage(
                            item = TeswaObjectIdentity(
                                title = detail.title,
                                imageUrl = detail.images.firstOrNull(),
                                meta = meta.ifBlank { detail.category.orEmpty() }.takeIf { it.isNotBlank() },
                                owner = owner,
                            ),
                            eyebrow = detail.category,
                            state = if (isMine) "حاجتك" else "متاحة للعرض",
                            stateEmphasis = if (isMine) TeswaEmphasis.Quiet else TeswaEmphasis.Strong,
                        )
                    }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                            TeswaSecondaryAction(
                                text = if (sharing) "بنجهّز المشاركة…" else "شارك الاحتمال",
                                icon = TeswaIcons.Share,
                                enabled = !sharing,
                                onClick = {
                                    scope.launch {
                                        sharing = true
                                        shareMessage = null
                                        runCatching { sharePublicItem(context, detail) }
                                            .onSuccess { includedImage ->
                                                if (!includedImage) {
                                                    shareMessage = "شاركنا الرابط العام من غير الصورة عشان المشاركة تفضل شغالة."
                                                }
                                            }
                                            .onFailure {
                                                shareMessage = "تعذر فتح المشاركة دلوقتي. حاول مرة تانية."
                                            }
                                        sharing = false
                                    }
                                },
                            )
                            shareMessage?.let { message ->
                                Text(
                                    text = message,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    if (detail.images.size > 1) {
                        item {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                                items(detail.images.drop(1)) { imageUrl ->
                                    NetworkImage(
                                        url = imageUrl,
                                        contentDescription = "صورة إضافية لـ ${detail.title}",
                                        modifier = Modifier.width(150.dp).height(120.dp),
                                    )
                                }
                            }
                        }
                    }
                    if (!owner.isNullOrBlank()) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                                TeswaSectionHeader("صاحب الحاجة")
                                TeswaPersonIdentity(
                                    name = owner,
                                    supporting = listOfNotNull(detail.city, detail.area)
                                        .joinToString(" · ")
                                        .takeIf { it.isNotBlank() },
                                    evidence = if (isMine) "دي حاجتك" else "افتح ملفه للأدلة والمراجعات",
                                    onClick = detail.ownerId?.takeIf { !isMine }?.let { ownerId -> ({ onOpenOwner(ownerId) }) },
                                )
                            }
                        }
                    }
                    detail.desireText?.takeIf { it.isNotBlank() }?.let { desire ->
                        item {
                            TeswaInlineMessage(
                                title = "مفتوح لإيه؟",
                                body = desire,
                                icon = TeswaIcons.Exchange,
                                emphasis = TeswaEmphasis.Normal,
                            )
                        }
                    }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md)) {
                            detail.description?.let { DetailSection("الوصف", it) }
                            detail.conditionNotes?.let { DetailSection("حالة الحاجة", it) }
                            detail.itemStory?.let { DetailSection("حكايتها", it) }
                            detail.swapReason?.let { DetailSection("ليه داخلة اللعب؟", it) }
                            detail.goodFor?.let { DetailSection("مناسبة لمين؟", it) }
                        }
                    }
                    if (!isMine) {
                        item {
                            TeswaEvidenceLine(
                                icon = TeswaIcons.Exchange,
                                text = "العرض حاجة واحدة مقابل حاجة واحدة",
                                supporting = "هتختار حاجة نشطة من دولابك قبل الإرسال.",
                            )
                        }
                    }
                }
                if (!isMine && detail.ownerId != null) {
                    TeswaBottomCommitBar(
                        primaryLabel = "قدّم عرض",
                        primaryIcon = TeswaIcons.Exchange,
                        onPrimary = { creatingOffer = true },
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailSection(title: String, value: String) {
    if (value.isBlank()) return
    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    Text(value, style = MaterialTheme.typography.bodyLarge)
}
