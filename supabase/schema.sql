-- Run this in your Supabase SQL editor to set up the community_reports table.

create table if not exists community_reports (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  name            text not null check (char_length(name) <= 100),
  dive_site       text not null check (char_length(dive_site) <= 150),
  visibility_ft   integer not null check (visibility_ft >= 0 and visibility_ft <= 200),
  current_strength text not null check (current_strength in ('None', 'Light', 'Moderate', 'Strong')),
  notes           text check (char_length(notes) <= 500)
);

-- Enable Row Level Security
alter table community_reports enable row level security;

-- Allow anyone to read (public dashboard)
create policy "Public read" on community_reports
  for select using (true);

-- Allow anyone to insert (community submissions)
create policy "Public insert" on community_reports
  for insert with check (true);

-- Index for fast recent-first queries
create index if not exists community_reports_created_at_idx
  on community_reports (created_at desc);
