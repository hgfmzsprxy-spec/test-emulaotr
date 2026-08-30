-- Script Engine affiliates
-- Paste this in Supabase: SQL Editor → Run
-- Also run sql/profiles.sql (unique display names + JANE10 referral codes).
-- Backend uses the service role key, so these tables stay private from the browser.

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null unique,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  payout_iban text,
  payout_usdc text,
  payout_paypal text,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  customer_user_id uuid,
  customer_email text,
  order_id text,
  subscription_id text,
  stripe_invoice_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer not null default 0,
  discount_cents integer not null default 0,
  commission_cents integer not null default 0,
  currency text not null default 'eur',
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  amount_cents integer not null,
  currency text not null default 'eur',
  method text not null check (method in ('bank', 'crypto', 'paypal')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists affiliates_code_lower_idx on public.affiliates (lower(code));
create index if not exists affiliate_conversions_affiliate_idx on public.affiliate_conversions (affiliate_id, created_at desc);
create index if not exists affiliate_payouts_affiliate_idx on public.affiliate_payouts (affiliate_id, created_at desc);

alter table public.affiliates enable row level security;
alter table public.affiliate_conversions enable row level security;
alter table public.affiliate_payouts enable row level security;
