package com.teswa.mobile.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
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
            modifier = modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator()
            Spacer(Modifier.height(14.dp))
            Text("انتهت الجلسة. بنرجعك لتسجيل الدخول…")
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 36.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "تِسوى",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(12.dp))

        when (current) {
            AccountGateState.Checking -> {
                CircularProgressIndicator()
                Spacer(Modifier.height(14.dp))
                Text("جاري التحقق من حسابك…")
            }

            is AccountGateState.NeedsProfile -> {
                Text(
                    text = "كمّل ملفك",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text("الاسم الظاهر") },
                    singleLine = true,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = username,
                    onValueChange = { username = it.lowercase() },
                    label = { Text("اسم المستخدم") },
                    supportingText = { Text("3–30: حروف إنجليزية صغيرة أو أرقام أو _") },
                    singleLine = true,
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        state = AccountGateState.Checking
                        scope.launch {
                            state = repository.saveProfile(current.session, displayName, username)
                        }
                    },
                ) {
                    Text("حفظ والمتابعة")
                }
            }

            is AccountGateState.NeedsPolicies -> {
                Text(
                    text = "قبل ما تكمل",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "لازم توافق على شروط الاستخدام وإرشادات المجتمع الحالية (${RequiredPolicies.VERSION}).",
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        state = AccountGateState.Checking
                        scope.launch { state = repository.acceptPolicies(current.session) }
                    },
                ) {
                    Text("أوافق وأكمل")
                }
            }

            is AccountGateState.Error -> {
                Text(
                    text = current.message,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(14.dp))
                Button(onClick = ::refresh) {
                    Text("إعادة المحاولة")
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { scope.launch { onSignOut() } },
                ) {
                    Text("تسجيل الخروج")
                }
            }

            is AccountGateState.Ready -> Unit
        }
    }
}
