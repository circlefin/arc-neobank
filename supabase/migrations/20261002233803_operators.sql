-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- Operators an Owner invites to their business account, with the limits on their payments.
create table public.operators (
  id uuid primary key default gen_random_uuid(),
  account_address text not null,
  -- An email can operate only one business account.
  email text not null unique,
  -- Set once the Operator signs in and creates a passkey.
  user_id uuid unique references auth.users (id) on delete cascade,
  passkey_id text,
  passkey_public_x text,
  passkey_public_y text,
  -- In base units, and the same number for each approved token.
  payment_limit numeric not null check (payment_limit > 0),
  tokens text[] not null check (cardinality(tokens) > 0),
  expires_at timestamptz not null,
  -- The Owner's passkey signature that lets the Operator's passkey pay within these limits.
  approval_signature text,
  created_at timestamptz not null default now(),
  check (
    (user_id is null) = (passkey_id is null)
    and (passkey_id is null) = (passkey_public_x is null)
    and (passkey_id is null) = (passkey_public_y is null)
  ),
  check (approval_signature is null or passkey_id is not null)
);

create index operators_account_address_index on public.operators (account_address);

-- Only the server's secret key may read or write it.
alter table public.operators enable row level security;
revoke all on public.operators from anon, authenticated;
