package com.teswa.mobile.home

import com.teswa.mobile.auth.AuthSession

interface HomeRepository {
    suspend fun fetchFeed(
        session: AuthSession,
        offset: Int = 0,
        limit: Int = 20,
    ): HomeFeedResult<HomeFeedPage>

    suspend fun fetchDetail(
        session: AuthSession,
        itemId: String,
    ): HomeFeedResult<ItemDetail>
}
