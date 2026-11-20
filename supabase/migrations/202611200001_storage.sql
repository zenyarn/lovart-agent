-- 已通过 Dashboard 在本地开发使用的实例应用；新环境使用的基线，勿在同一环境重复执行。
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('project-assets','project-assets',false,52428800,array['image/jpeg','image/png','image/webp']);

-- project-assets：仅登录用户访问自己 UID 前缀目录；不开放匿名读写。
begin;
create policy "project_assets_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "project_assets_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
commit;
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'project-assets';
select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'project_assets_%';