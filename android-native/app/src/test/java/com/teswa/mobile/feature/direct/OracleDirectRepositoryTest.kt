package com.teswa.mobile.feature.direct

import com.teswa.mobile.auth.*
import com.teswa.mobile.core.network.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OracleDirectRepositoryTest {
    private val me="11111111-1111-1111-1111-111111111111";private val other="22222222-2222-2222-2222-222222222222";private val conversation="33333333-3333-3333-3333-333333333333";private val message="44444444-4444-4444-4444-444444444444"
    private val session=AuthSession("token","refresh",9_999_999_999L,AuthUser(me,null,null,null,null))
    private val auth=SessionAuthenticator{current,_->AuthResult.Success(current)}
    @Test fun parsesInboxAndRequestState()=runBlocking{val t=DirectQueue(response(200,JSONObject("""{"items":[{"conversationId":"$conversation","status":"requested","requestedBy":"$other","otherUserId":"$other","otherDisplayName":"سلمى","otherUsername":"salma","otherAvatarUrl":null,"lastMessageBody":"أهلاً","lastMessageSenderId":"$other","lastMessageAt":"2026-09-15T12:00:00Z","unreadCount":1,"requiresAction":true}]}""")));val r=OracleDirectRepository(auth,t).loadInbox(session) as DirectResult.Success;assertTrue(r.value.single().requiresAction);assertEquals("/v1/direct/conversations",t.requests.single().path)}
    @Test fun sendsExactTextBody()=runBlocking{val t=DirectQueue(response(200,JSONObject().put("ok",true).put("messageId",message).put("conversationId",conversation).put("createdAt","now")));val c=DirectConversation(conversation,"accepted",me,other,"سلمى",null,null,null,null,0,false);val r=OracleDirectRepository(auth,t).send(session,c,"  أهلاً  ");assertTrue(r is DirectResult.Success);val body=requireNotNull(t.requests.single().body);assertEquals(setOf("body"),body.keys().asSequence().toSet());assertEquals("أهلاً",body.getString("body"))}
    @Test fun startsWithFirstMessageUsingExactEnvelope()=runBlocking{val t=DirectQueue(response(200,JSONObject().put("ok",true).put("conversationId",conversation).put("messageId",message).put("status","requested").put("createdAt","now").put("message","تم إرسال الطلب")));val r=OracleDirectRepository(auth,t).startWithMessage(session,other,"  ممكن نتكلم؟  ") as DirectResult.Success;assertEquals(conversation,r.value.conversationId);val request=t.requests.single();assertEquals("/v1/direct/conversations/start-with-message",request.path);val body=requireNotNull(request.body);assertEquals(setOf("targetUserId","body"),body.keys().asSequence().toSet());assertEquals(other,body.getString("targetUserId"));assertEquals("ممكن نتكلم؟",body.getString("body"))}
    @Test fun acceptUsesEmptyBody()=runBlocking{val t=DirectQueue(response(200,JSONObject().put("ok",true)));OracleDirectRepository(auth,t).act(session,conversation,true);assertEquals("/v1/direct/conversations/$conversation/accept",t.requests.single().path);assertEquals(0,requireNotNull(t.requests.single().body).length())}
    private fun response(status:Int,body:JSONObject)=OracleTransportResult.Response(OracleResponse(status,body))
}
private class DirectQueue(vararg values:OracleTransportResult):OracleTransport{private val q=ArrayDeque(values.toList());val requests=mutableListOf<OracleRequest>();override suspend fun execute(request:OracleRequest):OracleTransportResult{requests+=request;return q.removeFirst()}}
