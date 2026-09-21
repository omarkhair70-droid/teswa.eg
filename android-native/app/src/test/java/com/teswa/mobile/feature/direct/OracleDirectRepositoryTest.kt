package com.teswa.mobile.feature.direct

import com.teswa.mobile.auth.*
import com.teswa.mobile.core.network.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import com.teswa.mobile.feature.voice.*
import java.io.File

class OracleDirectRepositoryTest {
    private val me="11111111-1111-1111-1111-111111111111";private val other="22222222-2222-2222-2222-222222222222";private val conversation="33333333-3333-3333-3333-333333333333";private val message="44444444-4444-4444-4444-444444444444"
    private val session=AuthSession("token","refresh",9_999_999_999L,AuthUser(me,null,null,null,null))
    private val auth=SessionAuthenticator{current,_->AuthResult.Success(current)}
    @Test fun parsesInboxAndRequestState()=runBlocking{val t=DirectQueue(response(200,JSONObject("""{"items":[{"conversationId":"$conversation","status":"requested","requestedBy":"$other","otherUserId":"$other","otherDisplayName":"سلمى","otherUsername":"salma","otherAvatarUrl":null,"lastMessageBody":"أهلاً","lastMessageSenderId":"$other","lastMessageAt":"2026-09-15T12:00:00Z","unreadCount":1,"requiresAction":true}]}""")));val r=OracleDirectRepository(auth,t).loadInbox(session) as DirectResult.Success;assertTrue(r.value.single().requiresAction);assertEquals("/v1/direct/conversations",t.requests.single().path)}
    @Test fun sendsExactTextBody()=runBlocking{val t=DirectQueue(response(200,JSONObject().put("ok",true).put("messageId",message).put("conversationId",conversation).put("createdAt","now")));val c=DirectConversation(conversation,"accepted",me,other,"سلمى",null,null,null,null,0,false);val r=OracleDirectRepository(auth,t).send(session,c,"  أهلاً  ");assertTrue(r is DirectResult.Success);val request=t.requests.single();assertEquals("/v1/direct/conversations/$conversation/native",request.path);val body=requireNotNull(request.body);assertEquals(setOf("body","replyToMessageId","attachments","metadata"),body.keys().asSequence().toSet());assertEquals("أهلاً",body.getString("body"));assertTrue(body.isNull("replyToMessageId"))}
    @Test fun startsWithFirstMessageUsingExactEnvelope()=runBlocking{val t=DirectQueue(response(200,JSONObject().put("ok",true).put("conversationId",conversation).put("messageId",message).put("status","requested").put("createdAt","now").put("message","تم إرسال الطلب")));val r=OracleDirectRepository(auth,t).startWithMessage(session,other,"  ممكن نتكلم؟  ") as DirectResult.Success;assertEquals(conversation,r.value.conversationId);val request=t.requests.single();assertEquals("/v1/direct/conversations/start-with-message",request.path);val body=requireNotNull(request.body);assertEquals(setOf("targetUserId","body"),body.keys().asSequence().toSet());assertEquals(other,body.getString("targetUserId"));assertEquals("ممكن نتكلم؟",body.getString("body"))}
    @Test fun loadsNativeRepliesAttachmentsAndReactions()=runBlocking{
        val attachmentId="77777777-7777-7777-7777-777777777777"
        val payload=JSONObject("""{"items":[{
          "id":"$message","senderId":"$other","body":"شوف دي","messageType":"text",
          "createdAt":"2026-09-15T12:00:00Z","readAt":null,
          "replyToMessageId":"88888888-8888-8888-8888-888888888888",
          "replySenderId":"$me","replyBody":"تمام",
          "attachments":[{"id":"$attachmentId","kind":"image","storagePath":"direct/$conversation/$other/a.jpg","storageBucket":"direct-chat-media","fileName":"a.jpg","mimeType":"image/jpeg","sizeBytes":42}],
          "reactions":[{"reaction":"love","userId":"$me","createdAt":"2026-09-15T12:01:00Z"}]
        }]}""")
        val t=DirectQueue(response(200,payload))
        val row=(OracleDirectRepository(auth,t).loadMessages(session,conversation) as DirectResult.Success).value.single()
        assertEquals("/v1/direct/conversations/$conversation/native?limit=100",t.requests.single().path)
        assertEquals("تمام",row.replyBody)
        assertEquals("image",row.attachments.single().kind)
        assertEquals("love",row.reactions.single().reaction)
    }

    @Test fun togglesReactionUsingNativeContract()=runBlocking{
        val t=DirectQueue(response(200,JSONObject().put("ok",true).put("enabled",true).put("count",2)))
        val result=OracleDirectRepository(auth,t).toggleReaction(session,message,"love") as DirectResult.Success
        assertTrue(result.value.enabled)
        assertEquals(2,result.value.count)
        assertEquals("/v1/direct/messages/$message/reaction",t.requests.single().path)
    }
    @Test fun acceptUsesEmptyBody()=runBlocking{val t=DirectQueue(response(200,JSONObject().put("ok",true)));OracleDirectRepository(auth,t).act(session,conversation,true);assertEquals("/v1/direct/conversations/$conversation/accept",t.requests.single().path);assertEquals(0,requireNotNull(t.requests.single().body).length())}
    @Test fun sendsExactVoiceBody()=runBlocking {
        val key="direct/$conversation/$me/voice.m4a"
        val t=DirectQueue(response(200,JSONObject().put("ok",true).put("messageId",message).put("createdAt","now")))
        val media=DirectVoiceMedia(UploadedVoice(key,1600,"audio/m4a",4))
        val c=DirectConversation(conversation,"accepted",me,other,"سلمى",null,null,null,null,0,false)
        val file=File.createTempFile("voice",".m4a").apply{writeBytes(byteArrayOf(1,2,3,4))}
        val result=OracleDirectRepository(auth,t,media).sendVoice(session,c,VoiceDraft(file,1600))
        assertTrue(result is DirectResult.Success)
        assertEquals("direct_voice",media.purpose)
        assertEquals("direct/$conversation/$me",media.prefix)
        val request=t.requests.single();val body=requireNotNull(request.body)
        assertEquals("/v1/direct/conversations/$conversation/voice",request.path)
        assertEquals(setOf("audioStoragePath","audioMimeType","audioDurationMs","audioSizeBytes"),body.keys().asSequence().toSet())
        file.delete();Unit
    }
    private fun response(status:Int,body:JSONObject)=OracleTransportResult.Response(OracleResponse(status,body))
}
private class DirectVoiceMedia(private val value:UploadedVoice):VoiceMediaRepository{var purpose:String?=null;var prefix:String?=null;override suspend fun upload(session:AuthSession,purpose:String,objectPrefix:String,draft:VoiceDraft,onProgress:(Int)->Unit):VoiceMediaResult<UploadedVoice>{this.purpose=purpose;prefix=objectPrefix;return VoiceMediaResult.Success(value,session)};override suspend fun discard(session:AuthSession,purpose:String,voice:UploadedVoice)=session}
private class DirectQueue(vararg values:OracleTransportResult):OracleTransport{private val q=ArrayDeque(values.toList());val requests=mutableListOf<OracleRequest>();override suspend fun execute(request:OracleRequest):OracleTransportResult{requests+=request;return q.removeFirst()}}
