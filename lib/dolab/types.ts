export type DolabItemStatus = 'draft' | 'ready' | 'published' | 'exchanged' | 'archived';
export type DolabItemSource = 'manual' | 'camera' | 'gallery' | 'share_intent' | 'note' | 'voice';
export type DolabMediaType = 'image' | 'video' | 'audio';
export type DolabNoteType = 'text' | 'voice' | 'idea' | 'checklist';

export type DolabItem = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  condition: string | null;
  exchange_intent: string | null;
  status: DolabItemStatus;
  source: DolabItemSource;
  published_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DolabMedia = {
  id: string;
  user_id: string;
  dolab_item_id: string | null;
  media_type: DolabMediaType;
  storage_path: string;
  thumbnail_path: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
};

export type DolabNote = {
  id: string;
  user_id: string;
  dolab_item_id: string | null;
  note_type: DolabNoteType;
  body: string | null;
  media_id: string | null;
  shared_to_conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DolabDashboardSummary = {
  totalItems: number;
  draftItems: number;
  readyItems: number;
  publishedItems: number;
  exchangedItems: number;
  archivedItems: number;
  totalMedia: number;
  totalNotes: number;
};
