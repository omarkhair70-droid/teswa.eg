package com.teswa.mobile.ui.system

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.teswa.mobile.ui.NetworkImage

/** Minimal durable object identity used by shared production components. */
data class TeswaObjectIdentity(
    val title: String,
    val imageUrl: String? = null,
    val meta: String? = null,
    val owner: String? = null,
)

@Composable
fun TeswaObjectRow(
    item: TeswaObjectIdentity,
    modifier: Modifier = Modifier,
    state: String? = null,
    stateEmphasis: TeswaEmphasis = TeswaEmphasis.Quiet,
    onClick: (() -> Unit)? = null,
) {
    val interactive = if (onClick != null) modifier.clickable(onClick = onClick) else modifier
    Row(
        modifier = interactive
            .fillMaxWidth()
            .padding(vertical = TeswaSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NetworkImage(
            url = item.imageUrl,
            contentDescription = item.title,
            modifier = Modifier
                .size(TeswaSize.thumb)
                .clip(RoundedCornerShape(TeswaRadius.sm)),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
        ) {
            Text(
                text = item.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = TeswaLayout.MaxTitleLines,
                overflow = TextOverflow.Ellipsis,
            )
            item.meta?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = TeswaLayout.MaxCompactMetaLines,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            item.owner?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        state?.let {
            TeswaStatePill(
                text = it,
                emphasis = stateEmphasis,
            )
        }
    }
}

@Composable
fun TeswaObjectStage(
    item: TeswaObjectIdentity,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    state: String? = null,
    stateEmphasis: TeswaEmphasis = TeswaEmphasis.Quiet,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Box {
            NetworkImage(
                url = item.imageUrl,
                contentDescription = item.title,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(TeswaMedia.Object)
                    .clip(RoundedCornerShape(TeswaRadius.hero)),
            )
            if (state != null) {
                TeswaStatePill(
                    text = state,
                    emphasis = stateEmphasis,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(TeswaSpacing.sm),
                )
            }
        }
        eyebrow?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Text(
            text = item.title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = TeswaLayout.MaxTitleLines,
            overflow = TextOverflow.Ellipsis,
        )
        item.meta?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item.owner?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun TeswaExchangePair(
    requested: TeswaObjectIdentity,
    offered: TeswaObjectIdentity?,
    modifier: Modifier = Modifier,
    state: String? = null,
    stateEmphasis: TeswaEmphasis = TeswaEmphasis.Normal,
    emptyOfferedLabel: String = "اختار حاجة من دولابك",
    onChooseOffered: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(TeswaRadius.lg),
        tonalElevation = TeswaSpacing.xxs,
    ) {
        Column(
            modifier = Modifier.padding(TeswaSpacing.md),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "العرض",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                state?.let { TeswaStatePill(it, emphasis = stateEmphasis) }
            }
            Text("إنت عايز", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TeswaObjectRow(requested)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = TeswaIcons.Exchange,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(TeswaSize.icon),
                )
                Text(
                    text = "قدامها",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (offered != null) {
                TeswaObjectRow(offered)
            } else {
                TeswaEmptyField(
                    title = emptyOfferedLabel,
                    body = "لازم تختار حاجة واحدة نشطة من عندك عشان العرض يبقى واضح للطرفين.",
                    actionLabel = if (onChooseOffered != null) "اختار من دولابي" else null,
                    actionIcon = TeswaIcons.Mine,
                    onAction = onChooseOffered,
                )
            }
        }
    }
}

@Composable
fun TeswaEvidenceLine(
    icon: ImageVector,
    text: String,
    modifier: Modifier = Modifier,
    supporting: String? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(TeswaSize.iconCompact),
        )
        Column(Modifier.weight(1f)) {
            Text(text = text, style = MaterialTheme.typography.bodyMedium)
            supporting?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
