begin;
alter table public.assets drop constraint assets_mime_check;
alter table public.assets add constraint assets_mime_check check(mime in ('image/png','image/jpeg','image/webp','text/markdown'));
alter table public.assets add column name text not null default '' check(length(name)<=255);
alter table public.generations drop constraint generations_model_check;
alter table public.generations add constraint generations_model_check check(model in ('nano','gpt','gpt25'));
alter table public.canvas_nodes alter column generation_id drop not null;

create table public.agent_runs (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 project_id uuid not null,
 prompt text not null check(length(prompt) between 1 and 20000),
 attachment_ids jsonb not null default '[]' check(jsonb_typeof(attachment_ids)='array'),
 status text not null default 'running' check(status in ('running','completed','failed')),
 messages jsonb not null default '[]',
 events jsonb not null default '[]',
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(project_id,owner_id) references public.projects(id,owner_id)
);
create unique index agent_one_active_per_project on public.agent_runs(project_id) where status='running';
create index agent_runs_project_created on public.agent_runs(project_id,created_at,id);
alter table public.agent_runs enable row level security;
create policy agent_runs_read_own on public.agent_runs for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.agent_runs from anon,authenticated;
-- Model transcripts contain image data; only the application exposes a sanitized view.
grant select(id,owner_id,project_id,prompt,attachment_ids,status,events,error,created_at,updated_at) on public.agent_runs to authenticated;
grant all on public.agent_runs to service_role;

create function public.begin_agent_run(p_owner uuid,p_project uuid,p_request uuid,p_prompt text,p_attachments jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_runs; aid text;
begin
 perform 1 from public.projects where id=p_project and owner_id=p_owner for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into r from public.agent_runs where id=p_request;
 if found then
  if r.owner_id<>p_owner or r.project_id<>p_project or r.prompt<>p_prompt or r.attachment_ids<>p_attachments then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(r)||jsonb_build_object('is_new',false);
 end if;
 if exists(select 1 from public.agent_runs where project_id=p_project and status='running') then raise exception 'ACTIVE_AGENT_RUN'; end if;
 if jsonb_array_length(p_attachments)>20 then raise exception 'TOO_MANY_ATTACHMENTS'; end if;
 for aid in select jsonb_array_elements_text(p_attachments) loop
  perform 1 from public.assets where id=aid::uuid and owner_id=p_owner and project_id=p_project;
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
 end loop;
 insert into public.agent_runs(id,owner_id,project_id,prompt,attachment_ids) values(p_request,p_owner,p_project,p_prompt,p_attachments) returning * into r;
 return to_jsonb(r)||jsonb_build_object('is_new',true);
end; $$;

create function public.place_canvas_asset(p_owner uuid,p_project uuid,p_asset uuid,p_node uuid,p_x double precision default null,p_y double precision default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.assets; n public.canvas_nodes; w double precision; nx double precision;
begin
 perform 1 from public.projects where id=p_project and owner_id=p_owner for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into a from public.assets where id=p_asset and owner_id=p_owner and project_id=p_project and mime like 'image/%';
 if not found then raise exception 'ASSET_NOT_FOUND'; end if;
 select * into n from public.canvas_nodes where id=p_node;
 if found then
  if n.project_id<>p_project or n.owner_id<>p_owner or n.asset_id is distinct from p_asset then raise exception 'NODE_CONFLICT'; end if;
  return to_jsonb(n);
 end if;
 w=least(a.width,640);
 select coalesce(p_x,max(x+width)+80,0) into nx from public.canvas_nodes where project_id=p_project;
 insert into public.canvas_nodes(id,project_id,owner_id,asset_id,x,y,width,height) values(p_node,p_project,p_owner,p_asset,nx,p_y,w,w*a.height/a.width) returning * into n;
 update public.projects set revision=revision+1,updated_at=now() where id=p_project;
 return to_jsonb(n);
end; $$;

create or replace function public.save_canvas(p_owner uuid,p_project uuid,p_revision integer,p_nodes jsonb,p_viewport jsonb,p_settings jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare current_revision integer; item jsonb; n public.canvas_nodes;
begin
 select revision into current_revision from public.projects where id=p_project and owner_id=p_owner for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if current_revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 for item in select * from jsonb_array_elements(p_nodes) loop
  select * into n from public.canvas_nodes where id=(item->>'id')::uuid and project_id=p_project and owner_id=p_owner;
  if not found then raise exception 'NODE_NOT_FOUND'; end if;
  if item ? 'width' and item ? 'height' and abs((item->>'width')::double precision/(item->>'height')::double precision-n.width/n.height)>0.01 then raise exception 'ASPECT_RATIO_CHANGED'; end if;
  update public.canvas_nodes set x=(item->>'x')::double precision,y=(item->>'y')::double precision,
   width=coalesce((item->>'width')::double precision,width),height=coalesce((item->>'height')::double precision,height)
   where id=n.id;
 end loop;
 -- Keep in-flight placeholders; removing a rendered node never removes its source asset.
 delete from public.canvas_nodes doomed where doomed.project_id=p_project and doomed.owner_id=p_owner and doomed.asset_id is not null
 and not exists(select 1 from jsonb_array_elements(p_nodes) entry where (entry->>'id')::uuid=doomed.id);
 update public.projects set viewport=p_viewport,model_settings=p_settings,revision=revision+1 where id=p_project;
 return current_revision+1;
end; $$;
revoke all on function public.begin_agent_run(uuid,uuid,uuid,text,jsonb),public.place_canvas_asset(uuid,uuid,uuid,uuid,double precision,double precision) from public,anon,authenticated;
grant execute on function public.begin_agent_run(uuid,uuid,uuid,text,jsonb),public.place_canvas_asset(uuid,uuid,uuid,uuid,double precision,double precision) to service_role;
commit;
