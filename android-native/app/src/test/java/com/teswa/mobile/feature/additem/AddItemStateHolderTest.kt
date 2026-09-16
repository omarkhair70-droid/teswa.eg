package com.teswa.mobile.feature.additem

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import com.teswa.mobile.home.CurrentLocationResult
import com.teswa.mobile.home.DeviceLocation

class AddItemStateHolderTest {
    private val session = AuthSession(
        accessToken = "access-token",
        refreshToken = "refresh-token",
        expiresAtEpochSeconds = 9_999_999_999L,
        user = AuthUser("user-1", null, null, null, null),
    )
    private val image = AddItemImage("content://one", "one.jpg", "image/jpeg", 2L)

    @Test
    fun basicsRequireImageTitleAndCategoryBeforeAdvancing() {
        val holder = AddItemStateHolder(session, FakeAddItemRepository())

        holder.next()
        assertEquals(AddItemStep.BASICS, holder.step)
        holder.addImages(listOf(image))
        holder.updateBasics(title = "كتاب", categoryId = "category")
        holder.next()

        assertEquals(AddItemStep.DETAILS, holder.step)
    }

    @Test
    fun successfulPublishCarriesRotatedSessionAndResult() = runBlocking {
        val rotated = session.copy(accessToken = "rotated")
        val repository = FakeAddItemRepository(publishResult = AddItemResult.Success(PublishedItem("item-1"), rotated))
        val holder = AddItemStateHolder(session, repository)
        holder.addImages(listOf(image))
        holder.updateBasics(title = "كتاب", categoryId = "category")

        holder.publish()

        assertEquals(rotated, holder.session)
        assertTrue(holder.submissionState is AddItemSubmissionState.Success)
    }

    @Test
    fun cancelledPublishReturnsToEditableSavedDraft() = runBlocking {
        val repository = object : AddItemRepository {
            override suspend fun loadCategories(session: AuthSession) = AddItemResult.Success(emptyList<AddItemCategory>(), session)
            override suspend fun publish(
                session: AuthSession,
                draft: AddItemDraft,
                onProgress: (AddItemPublishProgress) -> Unit,
            ): AddItemResult<PublishedItem> = throw CancellationException("stop")
        }
        val holder = AddItemStateHolder(session, repository)
        holder.addImages(listOf(image))
        holder.updateBasics(title = "كتاب", categoryId = "category")

        holder.publish()

        assertTrue(holder.submissionState is AddItemSubmissionState.Idle)
        assertEquals("كتاب", holder.draft.title)
        assertTrue(holder.message!!.contains("المسودة محفوظة"))
    }

    @Test
    fun locationIsOptionalAndClearedWhenManualPlaceChanges() = runBlocking {
        val holder = AddItemStateHolder(session, FakeAddItemRepository())

        holder.useCurrentLocation { CurrentLocationResult.Success(DeviceLocation(30.0444, 31.2357)) }

        assertEquals(30.0444, holder.draft.locationLatitude!!, 0.00001)
        assertEquals(31.2357, holder.draft.locationLongitude!!, 0.00001)
        holder.updateDetails(city = "القاهرة")
        assertEquals(null, holder.draft.locationLatitude)
        assertEquals(null, holder.draft.locationLongitude)
    }
}

private class FakeAddItemRepository(
    private val publishResult: AddItemResult<PublishedItem>? = null,
) : AddItemRepository {
    override suspend fun loadCategories(session: AuthSession) =
        AddItemResult.Success(listOf(AddItemCategory("category", "كتب")), session)

    override suspend fun publish(
        session: AuthSession,
        draft: AddItemDraft,
        onProgress: (AddItemPublishProgress) -> Unit,
    ): AddItemResult<PublishedItem> = publishResult ?: error("Publish was not expected.")
}
