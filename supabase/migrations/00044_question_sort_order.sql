alter table if exists public.questions
  add column if not exists sort_order int not null default 0;

create index if not exists idx_questions_bank_sort_order on public.questions (bank_id, sort_order);
