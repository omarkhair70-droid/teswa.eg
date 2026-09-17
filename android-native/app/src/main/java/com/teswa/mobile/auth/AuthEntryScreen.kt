package com.teswa.mobile.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSpacing

/** Production A01/A02 session + sign-in surface. */
@Composable
fun AuthEntryScreen(
    state: AuthUiState,
    onGoogleSignIn: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                horizontal = TeswaLayout.ScreenHorizontal,
                vertical = TeswaSpacing.xxl,
            ),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "تِسوى",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(TeswaSpacing.sm))
        Text(
            text = "اللي عندك ممكن يبقى فرصة بينك وبين حد تاني.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(TeswaSpacing.xxl))

        when (state) {
            AuthUiState.Restoring -> TeswaInlineLoading(
                message = "بنرجّع جلستك…",
                modifier = Modifier.padding(horizontal = TeswaSpacing.md),
            )

            AuthUiState.SignedOut -> {
                Text(
                    text = "ادخل بحساب Google عشان تكمل على مساحتك وحاجاتك.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(TeswaSpacing.lg))
                TeswaPrimaryAction(
                    text = "المتابعة بحساب Google",
                    onClick = onGoogleSignIn,
                )
            }

            is AuthUiState.Working -> TeswaInlineLoading(
                message = state.message,
                modifier = Modifier.padding(horizontal = TeswaSpacing.md),
            )

            is AuthUiState.Error -> TeswaInlineMessage(
                title = "الدخول مكملش",
                body = state.message,
                emphasis = TeswaEmphasis.Strong,
                actionLabel = "حاول تاني",
                onAction = onRetry,
            )

            is AuthUiState.SignedIn -> Unit
        }
    }
}
