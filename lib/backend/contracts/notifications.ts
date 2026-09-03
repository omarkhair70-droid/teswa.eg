import type { IsoDateTime, TeswaResult } from '@/lib/backend/contracts/core';

export type TeswaNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  route: string | null;
  actorUserId: string | null;
  itemId: string | null;
  offerId: string | null;
  dealId: string | null;
  conversationId: string | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type NotificationPreferences = {
  offersEnabled: boolean;
  dealsEnabled: boolean;
  messagesEnabled: boolean;
  socialEnabled: boolean;
  smartRemindersEnabled: boolean;
  marketingEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  updatedAt: IsoDateTime | null;
};

export interface NotificationsContract extends NotificationDispatchContract {
  list(userId: string, limit?: number): Promise<TeswaNotification[]>;
  getUnreadCount(userId: string): Promise<number>;
  markRead(userId: string, notificationId: string): Promise<TeswaResult<void, 'not_found' | 'unknown'>>;
  markAllRead(userId: string): Promise<TeswaResult<void, 'unknown'>>;

  getPreferences(userId: string): Promise<NotificationPreferences>;
  updatePreferences(userId: string, patch: Partial<NotificationPreferences>): Promise<TeswaResult<NotificationPreferences, 'validation' | 'unknown'>>;

  registerPushDevice(input: {
    userId: string;
    expoPushToken: string;
    platform: 'android' | 'ios';
  }): Promise<TeswaResult<void, 'invalid_token' | 'unknown'>>;

  disablePushDevice(input: {
    userId: string;
    expoPushToken: string;
  }): Promise<TeswaResult<void, 'unknown'>>;
}


export type NotificationDispatchInput = {
  targetUserId: string;
  type: string;
  title: string;
  body?: string | null;
  itemId?: string | null;
  offerId?: string | null;
  dealId?: string | null;
  messageId?: string | null;
};

export interface NotificationDispatchContract {
  dispatch(input: NotificationDispatchInput): Promise<TeswaResult<void, 'unknown'>>;
  syncTimezone(timezone: string): Promise<TeswaResult<void, 'validation' | 'unknown'>>;
}
