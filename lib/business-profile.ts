/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { cache } from "react";
import type { Address } from "viem";
import { supabaseAdmin } from "./supabase/admin";

const BUSINESS_PROFILES_TABLE = "business_profiles";

// Null until the Owner names the business. Cached so a page and its layout share one read.
export const getBusinessName = cache(async (accountAddress: Address) => {
  const { data, error } = await supabaseAdmin
    .from(BUSINESS_PROFILES_TABLE)
    .select("name")
    .eq("account_address", accountAddress)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  if (typeof data.name !== "string") throw new Error("Unexpected business profile row.");
  return data.name;
});

export async function saveBusinessName(accountAddress: Address, name: string) {
  const { error } = await supabaseAdmin
    .from(BUSINESS_PROFILES_TABLE)
    .upsert({ account_address: accountAddress, name });
  if (error) throw error;
}
