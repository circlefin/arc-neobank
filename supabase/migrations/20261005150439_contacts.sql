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

-- Wallet addresses a business saves so it can pay them again by name.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_address text not null,
  name text not null check (char_length(name) between 1 and 64),
  address text not null,
  created_at timestamptz not null default now(),
  unique (account_address, address)
);

-- Only the server's secret key may read or write it.
alter table public.contacts enable row level security;
revoke all on public.contacts from anon, authenticated;
