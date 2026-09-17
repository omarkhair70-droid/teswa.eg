package com.teswa.mobile.ui.system

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.NetworkImage

enum class TeswaObjectMomentVariant {
    Hero,
    Full,
    CompactPortrait,
    CompactSquare,
}

@Composable
fun TeswaArchiveLabel(
    text: String,
    modifier: Modifier = Modifier,
    tone: Color = MaterialTheme.colorScheme.surface,
) {
    Surface(
        modifier = modifier,
        color = tone,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(TeswaRadius.xs),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .28f)),
        tonalElevation = 0.dp,
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = TeswaSpacing.sm, vertical = TeswaSpacing.xs),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun TeswaTraceNote(
    text: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .padding(top = 8.dp)
                .size(28.dp, 2.dp)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = .72f)),
        )
        Text(
            text = text,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun TeswaObjectMoment(
    title: String,
    imageUrl: String?,
    modifier: Modifier = Modifier,
    meta: String? = null,
    owner: String? = null,
    trace: String? = null,
    archiveLabel: String? = null,
    variant: TeswaObjectMomentVariant = TeswaObjectMomentVariant.Full,
    onClick: (() -> Unit)? = null,
) {
    val ratio = when (variant) {
        TeswaObjectMomentVariant.Hero -> .8f
        TeswaObjectMomentVariant.Full -> 1.15f
        TeswaObjectMomentVariant.CompactPortrait -> .78f
        TeswaObjectMomentVariant.CompactSquare -> 1f
    }
    val imageRadius = when (variant) {
        TeswaObjectMomentVariant.Hero -> TeswaRadius.hero
        TeswaObjectMomentVariant.Full -> TeswaRadius.lg
        TeswaObjectMomentVariant.CompactPortrait,
        TeswaObjectMomentVariant.CompactSquare -> TeswaRadius.md
    }
    val interaction = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier

    Column(
        modifier = modifier.then(interaction),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            NetworkImage(
                url = imageUrl,
                contentDescription = title,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(ratio)
                    .clip(RoundedCornerShape(imageRadius)),
            )
            archiveLabel?.takeIf { it.isNotBlank() }?.let { label ->
                TeswaArchiveLabel(
                    text = label,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = (-TeswaSpacing.sm), y = TeswaSpacing.sm),
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs)) {
            Text(
                text = title,
                style = when (variant) {
                    TeswaObjectMomentVariant.Hero -> MaterialTheme.typography.headlineSmall
                    TeswaObjectMomentVariant.Full -> MaterialTheme.typography.titleLarge
                    else -> MaterialTheme.typography.titleMedium
                },
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            owner?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            meta?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        trace?.takeIf { it.isNotBlank() }?.let { TeswaTraceNote(it) }
    }
}

@Composable
fun TeswaWardrobeSection(
    title: String,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .24f),
                shape = RoundedCornerShape(TeswaRadius.lg),
            )
            .padding(TeswaSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.Mine,
                color = MaterialTheme.colorScheme.primary,
                size = 26.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                supporting?.let {
                    Spacer(Modifier.height(TeswaSpacing.xxs))
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        content()
    }
}

@Composable
fun TeswaExchangeMemoryPair(
    requestedTitle: String,
    requestedImageUrl: String?,
    offeredTitle: String,
    offeredImageUrl: String?,
    modifier: Modifier = Modifier,
    state: String? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MiniObjectMemory(
                title = requestedTitle,
                imageUrl = requestedImageUrl,
                modifier = Modifier.weight(1f),
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                TeswaMarkIcon(
                    mark = TeswaMark.BetweenUs,
                    color = MaterialTheme.colorScheme.primary,
                    size = 34.dp,
                )
                state?.let {
                    Spacer(Modifier.height(TeswaSpacing.xxs))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            MiniObjectMemory(
                title = offeredTitle,
                imageUrl = offeredImageUrl,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MiniObjectMemory(
    title: String,
    imageUrl: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        NetworkImage(
            url = imageUrl,
            contentDescription = title,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(TeswaRadius.md)),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
