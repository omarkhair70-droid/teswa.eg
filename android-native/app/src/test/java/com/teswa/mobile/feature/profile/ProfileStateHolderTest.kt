package com.teswa.mobile.feature.profile

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileStateHolderTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val listingId = "22222222-2222-2222-2222-222222222222"
    private val session = AuthSession(
        "token",
        "refresh",
        9_999_999_999L,
        AuthUser(userId, null, null, null, null),
    )
    private val profile = MyProfile(
        userId, "عمر", "omar_k", null, null, null, "القاهرة", null, null, 0, null, null,
    )
    private val listing = MyListing(
        listingId, "راديو", null, null, null, null, null, "active", null, 0,
    )

    @Test
    fun editingProfileUpdatesReadyStateWithoutReloadingListings() = runBlocking {
        val repository = FakeProfileRepository(ProfileOverview(profile, listOf(listing)))
        val holder = ProfileStateHolder(session, repository, FakeProfileImageRepository())
        holder.load()
        holder.beginEdit()
        holder.updateDraft(requireNotNull(holder.editDraft).copy(displayName = "عمر خير"))

        holder.saveProfile()

        val ready = holder.state as ProfileUiState.Ready
        assertEquals("عمر خير", ready.overview.profile.displayName)
        assertEquals(listOf(listing), ready.overview.listings)
        assertNull(holder.editDraft)
    }

    @Test
    fun archivingListingUpdatesOnlyThatListing() = runBlocking {
        val second = listing.copy(id = "33333333-3333-3333-3333-333333333333", title = "كتاب")
        val repository = FakeProfileRepository(ProfileOverview(profile, listOf(listing, second)))
        val holder = ProfileStateHolder(session, repository, FakeProfileImageRepository())
        holder.load()

        holder.actOnListing(listing, ListingAction.ARCHIVE)

        val items = (holder.state as ProfileUiState.Ready).overview.listings
        assertEquals("archived", items.first().status)
        assertEquals("active", items.last().status)
        assertEquals(listingId to ListingAction.ARCHIVE, repository.lastListingAction)
        assertTrue(holder.message == null)
    }

    @Test
    fun replacingAvatarUpdatesProfileWithoutReloadingListings() = runBlocking {
        val repository = FakeProfileRepository(ProfileOverview(profile, listOf(listing)))
        val holder = ProfileStateHolder(session, repository, FakeProfileImageRepository())
        holder.load()

        val success = holder.replaceImage(
            ProfileImageKind.AVATAR,
            ProfileImageAsset("content://avatar", "avatar.jpg", "image/jpeg", 4),
        )

        assertTrue(success)
        assertEquals("https://media.example/new.jpg", holder.currentProfile?.avatarUrl)
        assertEquals(listOf(listing), (holder.state as ProfileUiState.Ready).overview.listings)
        assertEquals(false, holder.messageIsError)
        assertNull(holder.imageBusyKind)
    }
}

private class FakeProfileImageRepository : ProfileImageRepository {
    override suspend fun replace(
        session: AuthSession,
        kind: ProfileImageKind,
        asset: ProfileImageAsset,
        previousUrl: String?,
        onProgress: (Int) -> Unit,
    ): ProfileResult<ProfileImageMutation> = ProfileResult.Success(
        ProfileImageMutation("https://media.example/new.jpg", "تم التحديث"),
        session,
    )

    override suspend fun remove(
        session: AuthSession,
        kind: ProfileImageKind,
        currentUrl: String?,
    ): ProfileResult<ProfileImageMutation> = ProfileResult.Success(
        ProfileImageMutation(null, "تم الحذف"),
        session,
    )
}

private class FakeProfileRepository(initial: ProfileOverview) : ProfileRepository {
    private var overview = initial
    var lastListingAction: Pair<String, ListingAction>? = null

    override suspend fun load(session: AuthSession): ProfileResult<ProfileOverview> =
        ProfileResult.Success(overview, session)

    override suspend fun update(session: AuthSession, draft: ProfileEditDraft): ProfileResult<MyProfile> {
        val updated = overview.profile.copy(
            displayName = draft.displayName,
            username = draft.username,
            profileTagline = draft.profileTagline.ifBlank { null },
            bio = draft.bio.ifBlank { null },
            city = draft.city.ifBlank { null },
            area = draft.area.ifBlank { null },
        )
        overview = overview.copy(profile = updated)
        return ProfileResult.Success(updated, session)
    }

    override suspend fun updateListing(
        session: AuthSession,
        listingId: String,
        action: ListingAction,
    ): ProfileResult<String> {
        lastListingAction = listingId to action
        return ProfileResult.Success("ok", session)
    }
}
