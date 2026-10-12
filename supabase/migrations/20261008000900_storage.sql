-- Storage buckets. Browsers never write to storage directly: the server checks
-- permissions, then issues a short-lived signed upload URL (CLAUDE.md › Photo
-- and ID uploads). So there are no client INSERT/UPDATE/DELETE policies.
--
-- Path conventions:
--   avatars/<user_id>/<file>.jpg            public read
--   id-documents/<user_id>/<file>.jpg       admins only
--   chat-images/<conversation_id>/<file>.jpg conversation members only

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 26214400,
    array['image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('id-documents', 'id-documents', false, 26214400,
    array['image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('chat-images', 'chat-images', false, 26214400,
    array['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

-- Admins can read ID documents (the server still creates the signed URL and
-- writes the audit row when an admin opens one).
create policy "id-documents: admins read"
  on storage.objects for select to authenticated
  using (bucket_id = 'id-documents' and (select private.is_admin()));

create policy "chat-images: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and private.is_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
