package com.teswa.mobile.ui.system

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight

@Composable
fun TeswaRootNavigationBar(
    selected: TeswaRootDestination,
    onSelect: (TeswaRootDestination) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationBar(modifier = modifier) {
        TeswaNavigationPolicy.rootDestinations.forEach { destination ->
            NavigationBarItem(
                selected = destination == selected,
                onClick = { onSelect(destination) },
                icon = {
                    Icon(
                        imageVector = destination.icon,
                        contentDescription = destination.accessibilityLabelAr,
                    )
                },
                label = { Text(destination.labelAr) },
            )
        }
    }
}

@Composable
fun TeswaPutIntoPlayAction(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
    ) {
        Icon(
            imageVector = TeswaIcons.PutIntoPlay,
            contentDescription = TeswaNavigationPolicy.putIntoPlayLabelAr,
        )
    }
}

@Composable
fun TeswaFocusedHeader(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    actionIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    actionDescription: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TeswaIconAction(
            icon = TeswaIcons.Back,
            contentDescription = "رجوع",
            onClick = onBack,
        )
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        if (actionIcon != null && actionDescription != null && onAction != null) {
            TeswaIconAction(
                icon = actionIcon,
                contentDescription = actionDescription,
                onClick = onAction,
            )
        }
    }
}
