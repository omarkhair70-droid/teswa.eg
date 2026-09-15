package com.teswa.mobile.feature.direct

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface DirectUiState { data object Loading:DirectUiState; data class Ready(val items:List<DirectConversation>):DirectUiState; data class Error(val message:String):DirectUiState }

class DirectStateHolder(initial:AuthSession,private val repository:DirectRepository){
    var session by mutableStateOf(initial);private set
    var state by mutableStateOf<DirectUiState>(DirectUiState.Loading);private set
    var selected by mutableStateOf<DirectConversation?>(null);private set
    var messages by mutableStateOf<List<DirectMessage>>(emptyList());private set
    var composer by mutableStateOf("");private set
    var working by mutableStateOf(false);private set
    var message by mutableStateOf<String?>(null);private set
    var sessionExpired by mutableStateOf(false);private set
    fun updateSession(value:AuthSession){if(value.user.id==session.user.id&&value.accessToken!=session.accessToken)session=value}
    suspend fun load(){state=DirectUiState.Loading;when(val r=repository.loadInbox(session)){is DirectResult.Success->{session=r.session;state=DirectUiState.Ready(r.value)};is DirectResult.Failure->fail(r,true)}}
    suspend fun open(value:DirectConversation){selected=value;composer="";when(val r=repository.loadMessages(session,value.id)){is DirectResult.Success->{session=r.session;messages=r.value;val read=repository.markRead(session,value.id);if(read is DirectResult.Success)session=read.session};is DirectResult.Failure->fail(r)}}
    fun close(){selected=null;messages=emptyList();composer="";message=null}
    fun compose(value:String){composer=value.take(1200)}
    suspend fun send(){val c=selected?:return;if(working||composer.isBlank())return;working=true;when(val r=repository.send(session,c,composer)){is DirectResult.Success->{session=r.session;composer="";open(c)};is DirectResult.Failure->fail(r)};working=false}
    suspend fun act(accept:Boolean){val c=selected?:return;if(working)return;working=true;when(val r=repository.act(session,c.id,accept)){is DirectResult.Success->{session=r.session;if(accept){selected=c.copy(status="accepted",requiresAction=false);open(requireNotNull(selected))}else{close();load()}};is DirectResult.Failure->fail(r)};working=false}
    private fun fail(r:DirectResult.Failure,hard:Boolean=false){r.session?.let{session=it};sessionExpired=r.unauthorized;if(hard||r.unauthorized)state=DirectUiState.Error(r.message)else message=r.message}
}
