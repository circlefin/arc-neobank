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


-- A revoked Operator stays on record, so signing in can tell them their access was removed.
alter table public.operators add column revoked_at timestamptz;

-- An email, or a user, can operate only one business account at a time.
alter table public.operators drop constraint operators_email_key;
alter table public.operators drop constraint operators_user_id_key;
create unique index operators_email_index on public.operators (email) where revoked_at is null;
create unique index operators_user_id_index on public.operators (user_id) where revoked_at is null;
