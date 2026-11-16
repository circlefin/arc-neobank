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

-- What a business tells us about itself. For now, only its name.
create table public.business_profiles (
  account_address text primary key,
  name text not null check (char_length(name) between 1 and 64),
  created_at timestamptz not null default now()
);

-- Only the server's secret key may read or write it.
alter table public.business_profiles enable row level security;
revoke all on public.business_profiles from anon, authenticated;
