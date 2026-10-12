drop policy if exists "chat-images: members read" on storage.objects;
drop policy if exists "id-documents: admins read" on storage.objects;

-- Empty the buckets through the Storage API first (deleting rows here would
-- orphan the files). This refuses to run while any files remain.
do $$
begin
  if exists (select 1 from storage.objects where bucket_id in ('avatars', 'id-documents', 'chat-images')) then
    raise exception 'Buckets still contain files: delete them via the Storage API before rolling back';
  end if;
  set local storage.allow_delete_query = 'true';
  delete from storage.buckets where id in ('avatars', 'id-documents', 'chat-images');
end
$$;
