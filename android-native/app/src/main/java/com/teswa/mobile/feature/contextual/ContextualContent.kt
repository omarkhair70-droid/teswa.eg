package com.teswa.mobile.feature.contextual

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun ContextualContent(holder: ContextualStateHolder, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { holder.load() }
    LaunchedEffect(holder.thread?.conversation?.id) {
        while (isActive) {
            delay(30_000)
            val current = holder.thread
            if (current == null) holder.load(silent = true) else holder.reloadThread()
        }
    }
    holder.thread?.let { ContextualThreadContent(holder, it, modifier); return }
    when (val state = holder.state) {
        ContextualUiState.Loading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is ContextualUiState.Error -> Column(modifier.fillMaxSize(), Arrangement.Center, Alignment.CenterHorizontally) {
            Text(state.message)
            Button(onClick = { scope.launch { holder.load() } }) { Text("حاول تاني") }
        }
        is ContextualUiState.Ready -> if (state.items.isEmpty()) {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("ردود القصص هتظهر هنا.") }
        } else LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
            items(state.items, key = { it.id }) { value ->
                Card(onClick = { scope.launch { holder.open(value) } }, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Row {
                            Text(value.other.displayName ?: value.other.username ?: "مستخدم تِسوى", Modifier.weight(1f), fontWeight = if (value.unreadCount > 0) FontWeight.Bold else FontWeight.Medium)
                            Text("رد قصة", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                        }
                        Text(value.latestBody ?: "ابدأوا الكلام من سياق القصة", maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun ContextualThreadContent(holder: ContextualStateHolder, thread: ContextualThread, modifier: Modifier) {
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = holder::close) { Text("رجوع") }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(thread.conversation.other.displayName ?: thread.conversation.other.username ?: "مستخدم تِسوى", fontWeight = FontWeight.Bold)
                Text("محادثة بدأت من قصة", style = MaterialTheme.typography.bodySmall)
            }
        }
        Surface(color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .5f)) {
            Text("السياق محفوظ عشان الرد يفضل مفهوم من غير ما يتحول لضوضاء.", Modifier.fillMaxWidth().padding(12.dp), style = MaterialTheme.typography.bodySmall)
        }
        holder.message?.let { Text(it, Modifier.fillMaxWidth().padding(10.dp), color = MaterialTheme.colorScheme.error) }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(thread.messages, key = { it.id }) { value ->
                val mine = value.senderId == holder.session.user.id
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Surface(shape = MaterialTheme.shapes.medium, color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {
                        Text(if (value.kind == "voice") "رسالة صوتية" else value.body, Modifier.padding(12.dp), color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(holder.composer, holder::compose, Modifier.weight(1f), placeholder = { Text("رد في سياق القصة…") }, maxLines = 4)
            Spacer(Modifier.width(8.dp))
            Button(onClick = { scope.launch { holder.send() } }, enabled = holder.composer.isNotBlank() && !holder.working) { Text("إرسال") }
        }
    }
}
