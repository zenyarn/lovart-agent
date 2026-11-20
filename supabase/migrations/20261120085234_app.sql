begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null default 'Untitled' check (length(name) between 1 and 120),
  cover_asset_id uuid,
  viewport jsonb not null default '{"x":0,"y":0,"zoom":1}',
  model_settings jsonb not null default '{}',
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,owner_id)
);
create index projects_owner_updated on public.projects(owner_id,updated_at desc,id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  project_id uuid,
  bucket text not null default 'project-assets',
  object_path text not null unique,
  mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
  width integer not null check(width>0),
  height integer not null check(height>0),
  bytes bigint not null check(bytes>0 and bytes<=52428800),
  created_at timestamptz not null default now(),
  unique(id,owner_id),
  foreign key(project_id,owner_id) references public.projects(id,owner_id),
  check(split_part(object_path,'/',1)=owner_id::text)
);
create index assets_owner_project on public.assets(owner_id,project_id);
create index assets_staging_age on public.assets(created_at) where project_id is null;
alter table public.projects add constraint project_cover_owner foreign key(cover_asset_id,owner_id) references public.assets(id,owner_id);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null,
  request_key uuid not null,
  provider_task_id text unique,
  prompt text not null check(length(trim(prompt)) between 1 and 20000),
  model text not null check(model in ('nano','gpt')),
  config jsonb not null,
  reference_asset_id uuid,
  status text not null default 'submitting' check(status in ('submitting','pending','running','persisting','succeeded','failed','submission_unknown')),
  error text,
  provider_state text,
  result_urls jsonb,
  credits numeric,
  sync_token uuid,
  sync_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,request_key),unique(id,owner_id),unique(id,project_id,owner_id),
  foreign key(project_id,owner_id) references public.projects(id,owner_id),
  foreign key(reference_asset_id,owner_id) references public.assets(id,owner_id)
);
create unique index generations_one_active_per_owner on public.generations(owner_id)
  where status in ('submitting','pending','running','persisting','submission_unknown');
create index generations_project_created on public.generations(project_id,created_at,id);

create table public.generation_outputs (
  generation_id uuid not null,
  asset_id uuid not null,
  owner_id uuid not null,
  ordinal integer not null check(ordinal>=0),
  primary key(generation_id,ordinal),unique(asset_id),
  foreign key(generation_id,owner_id) references public.generations(id,owner_id),
  foreign key(asset_id,owner_id) references public.assets(id,owner_id)
);
create table public.canvas_nodes (
  id uuid primary key,
  project_id uuid not null,
  owner_id uuid not null,
  generation_id uuid not null,
  asset_id uuid,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 420 check(width>0 and width<=10000),
  height double precision not null default 420 check(height>0 and height<=10000),
  foreign key(project_id,owner_id) references public.projects(id,owner_id),
  foreign key(generation_id,project_id,owner_id) references public.generations(id,project_id,owner_id),
  foreign key(asset_id,owner_id) references public.assets(id,owner_id)
);
create index canvas_nodes_project on public.canvas_nodes(project_id);
create index canvas_nodes_generation on public.canvas_nodes(generation_id);

alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.generations enable row level security;
alter table public.generation_outputs enable row level security;
alter table public.canvas_nodes enable row level security;
create policy projects_read_own on public.projects for select to authenticated using(owner_id=(select auth.uid()));
create policy assets_read_own on public.assets for select to authenticated using(owner_id=(select auth.uid()));
create policy generations_read_own on public.generations for select to authenticated using(owner_id=(select auth.uid()));
create policy outputs_read_own on public.generation_outputs for select to authenticated using(owner_id=(select auth.uid()));
create policy nodes_read_own on public.canvas_nodes for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.projects,public.assets,public.generations,public.generation_outputs,public.canvas_nodes from anon,authenticated;
grant select on public.projects,public.assets,public.canvas_nodes,public.generation_outputs to authenticated;
-- Upstream URLs and lease fields are server-only, even for authenticated clients.
grant select(id,owner_id,project_id,request_key,provider_task_id,prompt,model,config,reference_asset_id,status,error,provider_state,credits,created_at,updated_at) on public.generations to authenticated;
grant all on public.projects,public.assets,public.generations,public.generation_outputs,public.canvas_nodes to service_role;
-- Reference uploads go through server validation; no direct client writes.
drop policy if exists project_assets_insert_own on storage.objects;

create function public.begin_generation(p_owner uuid,p_project uuid,p_request uuid,p_prompt text,p_model text,p_config jsonb,p_reference uuid default null,p_new_project boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.generations; a public.assets; nx double precision; gid uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select * into g from public.generations where owner_id=p_owner and request_key=p_request;
  if found then
    if g.project_id<>p_project or g.prompt<>p_prompt or g.model<>p_model or g.config<>p_config or g.reference_asset_id is distinct from p_reference then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('generation',to_jsonb(g),'is_new',false);
  end if;
  if exists(select 1 from public.generations where owner_id=p_owner and status in ('submitting','pending','running','persisting','submission_unknown')) then raise exception 'ACTIVE_GENERATION'; end if;
  if p_new_project then
    insert into public.projects(id,owner_id) values(p_project,p_owner) on conflict(id) do nothing;
  end if;
  perform 1 from public.projects where id=p_project and owner_id=p_owner for update;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if p_reference is not null then
    select * into a from public.assets where id=p_reference and owner_id=p_owner for update;
    if not found or (a.project_id is not null and a.project_id<>p_project) then raise exception 'ASSET_NOT_FOUND'; end if;
    update public.assets set project_id=p_project where id=p_reference and project_id is null;
  end if;
  insert into public.generations(id,owner_id,project_id,request_key,prompt,model,config,reference_asset_id)
    values(gid,p_owner,p_project,p_request,p_prompt,p_model,p_config,p_reference) returning * into g;
  select coalesce(max(x+width)+80,0) into nx from public.canvas_nodes where project_id=p_project;
  insert into public.canvas_nodes(id,project_id,owner_id,generation_id,x) values(gid,p_project,p_owner,gid,nx);
  update public.projects set updated_at=now(),revision=revision+1 where id=p_project;
  return jsonb_build_object('generation',to_jsonb(g),'is_new',true);
end; $$;

create function public.claim_generation_sync(p_owner uuid,p_generation uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.generations set sync_token=p_token,sync_until=now()+interval '3 minutes'
  where id=p_generation and owner_id=p_owner and status in ('pending','running','persisting') and (sync_until is null or sync_until<now());
  return found;
end; $$;

create function public.save_canvas(p_owner uuid,p_project uuid,p_revision integer,p_nodes jsonb,p_viewport jsonb,p_settings jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare current_revision integer; item jsonb;
begin
  select revision into current_revision from public.projects where id=p_project and owner_id=p_owner for update;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if current_revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
  for item in select * from jsonb_array_elements(p_nodes) loop
    update public.canvas_nodes set x=(item->>'x')::double precision,y=(item->>'y')::double precision where id=(item->>'id')::uuid and project_id=p_project and owner_id=p_owner;
    if not found then raise exception 'NODE_NOT_FOUND'; end if;
  end loop;
  update public.projects set viewport=p_viewport,model_settings=p_settings,revision=revision+1 where id=p_project;
  return current_revision+1;
end; $$;

create function public.complete_generation(p_owner uuid,p_generation uuid,p_token uuid,p_outputs jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare g public.generations; item jsonb; aid uuid; n integer:=0; nx double precision; w double precision; h double precision;
begin
  select * into g from public.generations where id=p_generation and owner_id=p_owner for update;
  if not found or g.sync_token is distinct from p_token or g.status<>'persisting' then return false; end if;
  if jsonb_array_length(p_outputs)<1 then raise exception 'NO_OUTPUTS'; end if;
  perform 1 from public.projects where id=g.project_id for update;
  for item in select * from jsonb_array_elements(p_outputs) loop
    aid=(item->>'id')::uuid;
    insert into public.assets(id,owner_id,project_id,bucket,object_path,mime,width,height,bytes)
      values(aid,p_owner,g.project_id,item->>'bucket',item->>'object_path',item->>'mime',(item->>'width')::integer,(item->>'height')::integer,(item->>'bytes')::bigint);
    insert into public.generation_outputs values(p_generation,aid,p_owner,n);
    w=least((item->>'width')::double precision,640);h=w*(item->>'height')::double precision/(item->>'width')::double precision;
    if n=0 then update public.canvas_nodes set asset_id=aid,width=w,height=h where id=p_generation;
    else
      select coalesce(max(x+width)+80,0) into nx from public.canvas_nodes where project_id=g.project_id;
      insert into public.canvas_nodes(id,project_id,owner_id,generation_id,asset_id,x,width,height) values(gen_random_uuid(),g.project_id,p_owner,p_generation,aid,nx,w,h);
    end if;
    n=n+1;
  end loop;
  update public.generations set status='succeeded',error=null,updated_at=now(),sync_token=null,sync_until=null,result_urls=null where id=p_generation;
  update public.projects set cover_asset_id=aid,updated_at=now(),revision=revision+1 where id=g.project_id;
  return true;
end; $$;

revoke all on function public.begin_generation(uuid,uuid,uuid,text,text,jsonb,uuid,boolean),public.claim_generation_sync(uuid,uuid,uuid),public.save_canvas(uuid,uuid,integer,jsonb,jsonb,jsonb),public.complete_generation(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_generation(uuid,uuid,uuid,text,text,jsonb,uuid,boolean),public.claim_generation_sync(uuid,uuid,uuid),public.save_canvas(uuid,uuid,integer,jsonb,jsonb,jsonb),public.complete_generation(uuid,uuid,uuid,jsonb) to service_role;
commit;
