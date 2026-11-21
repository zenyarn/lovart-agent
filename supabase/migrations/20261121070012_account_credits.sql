begin;
-- App credits are separate from generations.credits (the provider's usage).
create table public.credit_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 5 check (balance >= 0),
  created_at timestamptz not null default now()
);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.credit_accounts(owner_id) on delete cascade,
  generation_id uuid references public.generations(id),
  kind text not null check (kind in ('grant','generation','refund')),
  amount integer not null,
  created_at timestamptz not null default now(),
  check ((kind='grant' and amount=5 and generation_id is null) or
         (kind='generation' and amount=-1 and generation_id is not null) or
         (kind='refund' and amount=1 and generation_id is not null)),
  unique (generation_id,kind)
);
create unique index credit_initial_grant on public.credit_ledger(owner_id) where kind='grant';
create index credit_ledger_owner on public.credit_ledger(owner_id,created_at desc);
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
revoke all on public.credit_accounts,public.credit_ledger from anon,authenticated;
grant select on public.credit_accounts,public.credit_ledger to authenticated;
grant all on public.credit_accounts,public.credit_ledger to service_role;
create policy credit_accounts_read on public.credit_accounts for select to authenticated using ((select auth.uid())=owner_id);
create policy credit_ledger_read on public.credit_ledger for select to authenticated using ((select auth.uid())=owner_id);

-- Called only by the trusted backend after validating the authenticated user.
-- Existing users receive the same one-time grant; historical jobs are not charged.
create function public.ensure_credit_account(p_owner uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare remaining integer;
begin
 insert into public.credit_accounts(owner_id) values(p_owner) on conflict do nothing;
 if found then
   insert into public.credit_ledger(owner_id,kind,amount) values(p_owner,'grant',5);
 end if;
 select balance into remaining from public.credit_accounts where owner_id=p_owner;
 return remaining;
end; $$;

-- The trigger runs in begin_generation's transaction. An insufficient balance
-- rolls back the job, new project, asset binding and placeholder together.
create function public.charge_generation_credit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform public.ensure_credit_account(new.owner_id);
 update public.credit_accounts set balance=balance-1 where owner_id=new.owner_id and balance>=1;
 if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.credit_ledger(owner_id,generation_id,kind,amount) values(new.owner_id,new.id,'generation',-1);
 return new;
end; $$;
create trigger generation_credit_charge after insert on public.generations for each row execute function public.charge_generation_credit();

create function public.refund_generation_credit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='failed' and old.status is distinct from 'failed' then
   insert into public.credit_ledger(owner_id,generation_id,kind,amount)
     select new.owner_id,new.id,'refund',1
     where exists(select 1 from public.credit_ledger where generation_id=new.id and kind='generation')
     on conflict(generation_id,kind) do nothing;
   if found then update public.credit_accounts set balance=balance+1 where owner_id=new.owner_id; end if;
 end if;
 return new;
end; $$;
create trigger generation_credit_refund after update of status on public.generations for each row execute function public.refund_generation_credit();
revoke all on function public.ensure_credit_account(uuid),public.charge_generation_credit(),public.refund_generation_credit() from public,anon,authenticated;
grant execute on function public.ensure_credit_account(uuid),public.charge_generation_credit(),public.refund_generation_credit() to service_role;
commit;
