package com.teswa.mobile.feature.direct

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun DirectContent(holder: DirectStateHolder, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { holder.load() }
    holder.selected?.let { DirectThread(holder, it, modifier); return }
    when (val state = holder.state) {
        DirectUiState.Loading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is DirectUiState.Error -> Column(modifier.fillMaxSize(), Arrangement.Center, Alignment.CenterHorizontally) {
            Text(state.message); Button(onClick = { scope.launch { holder.load() } }) { Text("حاول تاني") }
        }
        is DirectUiState.Ready -> if (state.items.isEmpty()) {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("طلبات ومحادثات الناس هتظهر هنا.") }
        } else LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
            items(state.items, key = { it.id }) { value -> DirectConversationCard(value) { scope.launch { holder.open(value) } } }
        }
    }
}

@Composable
private fun DirectConversationCard(value: DirectConversation, onOpen: () -> Unit) {
    Card(onClick = onOpen, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row {
                Text(value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى", Modifier.weight(1f), fontWeight = if (value.unreadCount > 0) FontWeight.Bold else FontWeight.Medium)
                if (value.requiresAction) Text("محتاج رد", color = MaterialTheme.colorScheme.primary)
            }
            Text(value.lastMessageBody ?: if (value.status == "requested") "طلب مراسلة جديد" else "ابدأوا الكلام", maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun DirectThread(holder: DirectStateHolder, value: DirectConversation, modifier: Modifier) {
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = holder::close) { Text("رجوع") }; Spacer(Modifier.width(10.dp))
            Column { Text(value.otherDisplayName ?: value.otherUsername ?: "مستخدم تِسوى", fontWeight = FontWeight.Bold); Text(if (value.status == "requested") "طلب مراسلة" else "محادثة مباشرة", style = MaterialTheme.typography.bodySmall) }
        }
        holder.message?.let { Text(it, Modifier.fillMaxWidth().padding(10.dp), color = MaterialTheme.colorScheme.error) }
        if (value.requiresAction) Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) { Text("الشخص ده طالب يبدأ كلام معاك."); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { scope.launch { holder.act(true) } }, enabled = !holder.working) { Text("قبول") }
                OutlinedButton(onClick = { scope.launch { holder.act(false) } }, enabled = !holder.working) { Text("تجاهل") }
            } }
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(holder.messages, key = { it.id }) { message -> DirectMessageBubble(message, message.senderId == holder.session.user.id) }
        }
        if (value.status == "accepted") DirectComposer(holder)
    }
}

@Composable
private fun DirectMessageBubble(message: DirectMessage, mine: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Surface(shape = MaterialTheme.shapes.medium, color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {
            Text(if (message.messageType == "voice") "رسالة صوتية" else message.body, Modifier.padding(12.dp), color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DirectComposer(holder: DirectStateHolder) {
    val scope = rememberCoroutineScope()
    Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom) {
        OutlinedTextField(holder.composer, holder::compose, Modifier.weight(1f), placeholder = { Text("اكتب رسالة…") }, maxLines = 4)
        Spacer(Modifier.width(8.dp)); Button(onClick = { scope.launch { holder.send() } }, enabled = holder.composer.isNotBlank() && !holder.working) { Text("إرسال") }
    }
}
