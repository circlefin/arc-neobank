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

import { isAddress, type Address } from "viem";
import { supabaseAdmin } from "./supabase/admin";

const CONTACTS_TABLE = "contacts";
const CONTACT_COLUMNS = "id, name, address";
// Postgres reports this when the account already saved the address.
const UNIQUE_VIOLATION_CODE = "23505";

export type Contact = { id: string; name: string; address: Address };

export async function listContacts(accountAddress: Address) {
  const { data, error } = await supabaseAdmin
    .from(CONTACTS_TABLE)
    .select(CONTACT_COLUMNS)
    .eq("account_address", accountAddress)
    .order("name");
  if (error) throw error;
  return data.map(readContact);
}

// Returns false when the account already saved this address.
export async function insertContact(
  accountAddress: Address,
  { name, address }: Omit<Contact, "id">,
) {
  const { error } = await supabaseAdmin
    .from(CONTACTS_TABLE)
    .insert({ account_address: accountAddress, name, address });
  if (error?.code === UNIQUE_VIOLATION_CODE) return false;
  if (error) throw error;
  return true;
}

export async function deleteContact(
  accountAddress: Address,
  contactId: string,
) {
  const { data, error } = await supabaseAdmin
    .from(CONTACTS_TABLE)
    .delete()
    .eq("account_address", accountAddress)
    .eq("id", contactId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("No such contact.");
}

function readContact(row: Record<string, unknown>): Contact {
  const { id, name, address } = row;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof address !== "string" ||
    !isAddress(address)
  ) {
    throw new Error("Unexpected contact row.");
  }
  return { id, name, address };
}
