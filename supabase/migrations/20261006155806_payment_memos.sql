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

-- A note the business adds to a payment it sends. A token transfer can't carry one onchain.
create table public.payment_memos (
  account_address text not null,
  transaction_hash text not null,
  memo text not null check (char_length(memo) between 1 and 140),
  created_at timestamptz not null default now(),
  primary key (account_address, transaction_hash)
);

-- Only the server's secret key may read or write it.
alter table public.payment_memos enable row level security;
revoke all on public.payment_memos from anon, authenticated;
