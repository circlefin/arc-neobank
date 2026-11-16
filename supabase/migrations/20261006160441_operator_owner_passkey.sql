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

-- The Owner's passkey when they approved. An Operator's first payment uses it to open the
-- account onchain if the Owner never has.
alter table public.operators
  add column owner_passkey_id text,
  add column owner_passkey_public_x text,
  add column owner_passkey_public_y text;

-- Approvals saved before this have no Owner passkey, so the Owner approves them again.
update public.operators set approval_signature = null;

alter table public.operators add check (
  (approval_signature is null) = (owner_passkey_id is null)
  and (owner_passkey_id is null) = (owner_passkey_public_x is null)
  and (owner_passkey_id is null) = (owner_passkey_public_y is null)
);
