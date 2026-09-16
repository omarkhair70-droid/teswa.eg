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

    suspend fun fetchNearby(
        session: AuthSession,
        latitude: Double,
        longitude: Double,
        radiusKm: Double = 3.0,
        offset: Int = 0,
        limit: Int = 20,
    ): HomeFeedResult<HomeFeedPage> = HomeFeedResult.Failure("العناصر القريبة غير متاحة الآن.", session = session)
}
