package com.teswa.mobile.ui.system

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * Production primitives shared by Teswa screens.
 * They intentionally avoid turning every section into a card.
 */
@Composable
fun TeswaScreenHeading(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    supporting: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        eyebrow?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                maxLines = TeswaLayout.MaxTitleLines,
                overflow = TextOverflow.Ellipsis,
            )
            if (actionLabel != null && onAction != null) {
                TextButton(onClick = onAction) { Text(actionLabel) }
            }
        }
        supporting?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = TeswaLayout.MaxSupportingLines,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun TeswaSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

@Composable
fun TeswaStatePill(
    text: String,
    modifier: Modifier = Modifier,
    emphasis: TeswaEmphasis = TeswaEmphasis.Normal,
    icon: ImageVector? = null,
) {
    val container = when (emphasis) {
        TeswaEmphasis.Quiet -> MaterialTheme.colorScheme.surfaceVariant
        TeswaEmphasis.Normal -> MaterialTheme.colorScheme.secondaryContainer
        TeswaEmphasis.Strong -> MaterialTheme.colorScheme.primaryContainer
        TeswaEmphasis.Commitment -> MaterialTheme.colorScheme.primary
    }
    val content = when (emphasis) {
        TeswaEmphasis.Quiet -> MaterialTheme.colorScheme.onSurfaceVariant
        TeswaEmphasis.Normal -> MaterialTheme.colorScheme.onSecondaryContainer
        TeswaEmphasis.Strong -> MaterialTheme.colorScheme.onPrimaryContainer
        TeswaEmphasis.Commitment -> MaterialTheme.colorScheme.onPrimary
    }

    Surface(
        modifier = modifier,
        color = container,
        contentColor = content,
        shape = RoundedCornerShape(999.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = TeswaSpacing.sm, vertical = TeswaSpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            icon?.let {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(TeswaSize.iconCompact),
                )
            }
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun TeswaPrimaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(TeswaSize.actionHeight),
        enabled = enabled && !loading,
        shape = RoundedCornerShape(TeswaRadius.md),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ),
    ) {
        when {
            loading -> CircularProgressIndicator(
                modifier = Modifier.size(TeswaSize.icon),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
            icon != null -> {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(TeswaSize.icon),
                )
                Spacer(Modifier.size(TeswaSpacing.xs))
            }
        }
        if (!loading) Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun TeswaSecondaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(TeswaSize.compactActionHeight),
        enabled = enabled,
        shape = RoundedCornerShape(TeswaRadius.md),
    ) {
        icon?.let {
            Icon(it, contentDescription = null, modifier = Modifier.size(TeswaSize.iconCompact))
            Spacer(Modifier.size(TeswaSpacing.xs))
        }
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun TeswaIconAction(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.size(TeswaSize.minTouch),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(TeswaSize.icon),
        )
    }
}

@Composable
fun TeswaBottomCommitBar(
    primaryLabel: String,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
    primaryIcon: ImageVector? = null,
    primaryEnabled: Boolean = true,
    primaryLoading: Boolean = false,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier
                .navigationBarsPadding()
                .padding(
                    horizontal = TeswaLayout.BottomCommitHorizontal,
                    vertical = TeswaLayout.BottomCommitVertical,
                ),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(TeswaSpacing.xxs))
            TeswaPrimaryAction(
                text = primaryLabel,
                icon = primaryIcon,
                enabled = primaryEnabled,
                loading = primaryLoading,
                onClick = onPrimary,
            )
            if (secondaryLabel != null && onSecondary != null) {
                TextButton(
                    onClick = onSecondary,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(secondaryLabel)
                }
            }
        }
    }
}

@Composable
fun TeswaEmptyField(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    actionIcon: ImageVector? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                shape = RoundedCornerShape(TeswaRadius.lg),
            )
            .padding(TeswaSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(TeswaSpacing.xxs))
            TeswaPrimaryAction(
                text = actionLabel,
                icon = actionIcon,
                onClick = onAction,
            )
        }
    }
}
