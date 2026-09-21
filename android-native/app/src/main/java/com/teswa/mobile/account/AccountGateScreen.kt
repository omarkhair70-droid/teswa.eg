package com.teswa.mobile.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import kotlinx.coroutines.launch

@Composable
fun AccountGateScreen(
    session: AuthSession,
    repository: AccountGateRepository,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
    readyContent: @Composable (AuthSession, AccountProfile?) -> Unit,
) {
    var state by remember(session.accessToken) { mutableStateOf<AccountGateState>(AccountGateState.Checking) }
    var displayName by remember(session.user.id) { mutableStateOf(session.user.displayName.orEmpty()) }
    var username by remember(session.user.id) { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun refresh() {
        state = AccountGateState.Checking
        scope.launch { state = repository.check(session) }
    }

    LaunchedEffect(session.accessToken) {
        state = repository.check(session)
    }

    val current = state
    if (current is AccountGateState.Ready) {
        readyContent(current.session, current.profile)
        return
    }

    if (current is AccountGateState.Error && current.sessionExpired) {
        LaunchedEffect(current.session.accessToken) { onSignOut() }
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(horizontal = TeswaLayout.ScreenHorizontal),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TeswaInlineLoading("انتهت الجلسة. بنرجعك لتسجيل الدخول…")
        }
        return
    }

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
        )
        Spacer(Modifier.height(TeswaSpacing.lg))

        when (current) {
            AccountGateState.Checking -> TeswaInlineLoading("بنتأكد إن حسابك جاهز…")

            is AccountGateState.NeedsProfile -> {
                val cleanName = displayName.trim()
                val cleanUsername = username.trim().lowercase()
                val nameError = if (displayName.isNotEmpty() && cleanName.isBlank()) "الاسم الظاهر مطلوب" else null
                val usernameError = when {
                    username.isEmpty() -> null
                    !USERNAME_PATTERN.matches(cleanUsername) -> "3–30: حروف إنجليزية صغيرة أو أرقام أو _"
                    else -> null
                }
                val canSubmit = cleanName.isNotBlank() && USERNAME_PATTERN.matches(cleanUsername)

                Text(
                    text = "كمّل هويتك",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(TeswaSpacing.xs))
                Text(
                    text = "دي البيانات اللي الناس هتشوفها لما حاجة بينكم تبدأ.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(TeswaSpacing.xl))

                TeswaTextField(
                    value = displayName,
                    onValueChange = { displayName = it.take(60) },
                    label = "الاسم الظاهر",
                    errorText = nameError,
                )
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaTextField(
                    value = username,
                    onValueChange = { username = it.lowercase().take(30) },
                    label = "اسم المستخدم",
                    supportingText = "3–30: حروف إنجليزية صغيرة أو أرقام أو _",
                    errorText = usernameError,
                )
                Spacer(Modifier.height(TeswaSpacing.lg))
                TeswaPrimaryAction(
                    text = "حفظ والمتابعة",
                    enabled = canSubmit,
                    onClick = {
                        state = AccountGateState.Checking
                        scope.launch {
                            state = repository.saveProfile(current.session, cleanName, cleanUsername)
                        }
                    },
                )
            }

            is AccountGateState.NeedsPolicies -> {
                Text(
                    text = "قبل ما تكمل",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(TeswaSpacing.sm))
                Text(
                    text = "لازم توافق على شروط الاستخدام وإرشادات المجتمع الحالية (${RequiredPolicies.VERSION}).",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(TeswaSpacing.xl))
                TeswaPrimaryAction(
                    text = "أوافق وأكمل",
                    onClick = {
                        state = AccountGateState.Checking
                        scope.launch { state = repository.acceptPolicies(current.session) }
                    },
                )
            }

            is AccountGateState.Error -> {
                TeswaInlineMessage(
                    title = "الحساب لسه مش جاهز",
                    body = current.message,
                    emphasis = TeswaEmphasis.Strong,
                    actionLabel = "حاول تاني",
                    onAction = ::refresh,
                )
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(
                    text = "تسجيل الخروج",
                    onClick = { scope.launch { onSignOut() } },
                )
            }

            is AccountGateState.Ready -> Unit
        }
    }
}

private val USERNAME_PATTERN = Regex("^[a-z0-9_]{3,30}$")
