begin;
create table public.project_skills (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 project_id uuid not null,
 name text not null check(length(name) between 1 and 64 and name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 description text not null check(length(btrim(description)) between 1 and 2000),
 body text not null check(length(btrim(body))>0 and octet_length(body)<=65536),
 source text not null check(octet_length(source) between 1 and 65536),
 created_at timestamptz not null default now(),
 foreign key(project_id,owner_id) references public.projects(id,owner_id),
 unique(project_id,name)
);
alter table public.project_skills enable row level security;
create policy skills_read_own on public.project_skills for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.project_skills from anon,authenticated;
grant select(id,owner_id,project_id,name,description,created_at) on public.project_skills to authenticated;
grant all on public.project_skills to service_role;
-- Immutable snapshots deliberately survive deletion of the selectable skill.
alter table public.agent_runs add column skill_id uuid, add column skill_name text, add column skill_body text;
grant select(skill_id,skill_name) on public.agent_runs to authenticated;
drop function public.begin_agent_run(uuid,uuid,uuid,text,jsonb);
create function public.begin_agent_run(p_owner uuid,p_project uuid,p_request uuid,p_prompt text,p_attachments jsonb,p_skill uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_runs; aid text; s public.project_skills;
begin
 perform 1 from public.projects where id=p_project and owner_id=p_owner for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into r from public.agent_runs where id=p_request;
 if found then
  if r.owner_id<>p_owner or r.project_id<>p_project or r.prompt<>p_prompt or r.attachment_ids<>p_attachments or r.skill_id is distinct from p_skill then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(r)||jsonb_build_object('is_new',false);
 end if;
 if exists(select 1 from public.agent_runs where project_id=p_project and status='running') then raise exception 'ACTIVE_AGENT_RUN'; end if;
 if jsonb_array_length(p_attachments)>20 then raise exception 'TOO_MANY_ATTACHMENTS'; end if;
 for aid in select jsonb_array_elements_text(p_attachments) loop
  perform 1 from public.assets where id=aid::uuid and owner_id=p_owner and project_id=p_project;
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
 end loop;
 if p_skill is not null then
  select * into s from public.project_skills where id=p_skill and owner_id=p_owner and project_id=p_project for share;
  if not found then raise exception 'SKILL_NOT_FOUND'; end if;
 end if;
 insert into public.agent_runs(id,owner_id,project_id,prompt,attachment_ids,skill_id,skill_name,skill_body) values(p_request,p_owner,p_project,p_prompt,p_attachments,p_skill,s.name,s.body) returning * into r;
 return to_jsonb(r)||jsonb_build_object('is_new',true);
end; $$;

revoke all on function public.begin_agent_run(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.begin_agent_run(uuid,uuid,uuid,text,jsonb,uuid) to service_role;
commit;
