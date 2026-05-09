ALTER TABLE public.guest_albums
  ADD COLUMN format text NOT NULL DEFAULT 'square';

CREATE UNIQUE INDEX idx_guest_albums_unique_format
  ON public.guest_albums (guest_account_id, format);