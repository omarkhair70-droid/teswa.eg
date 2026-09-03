export type TeswaId = string;
export type IsoDateTime = string;
export type TeswaUnsubscribe = () => void;

export type TeswaResult<T, R extends string = string> =
  | { ok: true; data: T }
  | { ok: false; reason: R; message: string; retryable?: boolean; cause?: unknown };

export type TeswaPage<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor?: string | null;
};

export type BackendConnectionState = 'connecting' | 'live' | 'offline';
