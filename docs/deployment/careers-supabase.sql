-- Careers application storage for public/careers.html.
-- Run this in the Supabase SQL editor for the project used by SUPABASE_URL.

create extension if not exists pgcrypto;

create table if not exists public.careers_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone_number text,
  current_location text,
  role text not null,
  linked_in text,
  github text,
  portfolio_website text,
  portfolio text,
  years_experience text,
  highest_qualification text,
  current_company_college text,
  expected_joining_date date,
  availability text,
  tech_skills text,
  why_join text,
  proud_project text,
  improvement_area text,
  why_hire text,
  anything_else text,
  confirmed_accurate boolean not null default false,
  feedback text,
  application_data jsonb not null default '{}'::jsonb,
  resume_bucket text,
  resume_path text,
  resume_name text,
  resume_type text,
  resume_size bigint,
  status text not null default 'new',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.careers_applications
  add column if not exists phone_number text,
  add column if not exists current_location text,
  add column if not exists linked_in text,
  add column if not exists github text,
  add column if not exists portfolio_website text,
  add column if not exists years_experience text,
  add column if not exists highest_qualification text,
  add column if not exists current_company_college text,
  add column if not exists expected_joining_date date,
  add column if not exists availability text,
  add column if not exists tech_skills text,
  add column if not exists why_join text,
  add column if not exists proud_project text,
  add column if not exists improvement_area text,
  add column if not exists why_hire text,
  add column if not exists anything_else text,
  add column if not exists confirmed_accurate boolean not null default false,
  add column if not exists application_data jsonb not null default '{}'::jsonb,
  add column if not exists resume_size bigint,
  add column if not exists created_at timestamptz not null default now();

alter table public.careers_applications enable row level security;

create index if not exists careers_applications_submitted_at_idx
  on public.careers_applications (submitted_at desc);

create index if not exists careers_applications_role_status_idx
  on public.careers_applications (role, status);

create index if not exists careers_applications_application_data_idx
  on public.careers_applications using gin (application_data);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'careers-resumes',
  'careers-resumes',
  false,
  6291456,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
