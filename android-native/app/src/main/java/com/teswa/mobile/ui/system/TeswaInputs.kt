package com.teswa.mobile.ui.system

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp

/** Shared Arabic-first form controls. */
@Composable
fun TeswaTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supportingText: String? = null,
    errorText: String? = null,
    singleLine: Boolean = true,
    minLines: Int = if (singleLine) 1 else 3,
    maxLines: Int = if (singleLine) 1 else 6,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    trailingContentDescription: String? = null,
    onTrailingClick: (() -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        supportingText = when {
            errorText != null -> ({ Text(errorText) })
            supportingText != null -> ({ Text(supportingText) })
            else -> null
        },
        isError = errorText != null,
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        keyboardOptions = keyboardOptions,
        visualTransformation = visualTransformation,
        leadingIcon = leadingIcon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(TeswaSize.icon),
                )
            }
        },
        trailingIcon = if (trailingIcon != null && onTrailingClick != null) {
            {
                IconButton(onClick = onTrailingClick) {
                    Icon(
                        imageVector = trailingIcon,
                        contentDescription = trailingContentDescription,
                    )
                }
            }
        } else null,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(TeswaRadius.md),
    )
}

@Composable
fun TeswaSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "دور على حاجة",
) {
    TeswaTextField(
        value = query,
        onValueChange = onQueryChange,
        label = "بحث",
        placeholder = placeholder,
        modifier = modifier,
        leadingIcon = TeswaIcons.Search,
        trailingIcon = if (query.isNotBlank()) TeswaIcons.Clear else TeswaIcons.Search,
        trailingContentDescription = if (query.isNotBlank()) "امسح البحث" else "ابحث",
        onTrailingClick = if (query.isNotBlank()) ({ onQueryChange("") }) else onSearch,
        singleLine = true,
    )
}

@Composable
fun TeswaChoiceChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    enabled: Boolean = true,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        label = { Text(label) },
        leadingIcon = leadingIcon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
            }
        },
    )
}

@Composable
fun TeswaChoiceRow(
    content: @Composable () -> Unit,
) {
    Row(content = { content() })
}
