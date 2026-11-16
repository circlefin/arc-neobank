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

"use server";

import { refresh } from "next/cache";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { CONTACT_NAME_MAX_LENGTH } from "@/app/constants";
import { requireOwner } from "@/lib/auth";
import { deleteContact, insertContact } from "@/lib/contacts";

// Returns a message for the form when the contact can't be saved.
export async function addContact(contact: unknown) {
  const { account } = await requireOwner();
  if (!isObject(contact)) throw new Error("Invalid contact.");
  const { name, address } = contact;

  if (typeof name !== "string" || name.trim() === "") return "Enter a name.";
  if (name.trim().length > CONTACT_NAME_MAX_LENGTH) {
    return `Use ${CONTACT_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (typeof address !== "string" || !isAddress(address)) {
    return "That isn't a valid wallet address.";
  }
  if (isAddressEqual(address, account.address)) {
    return "That's this account's own address.";
  }

  const saved = await insertContact(account.address, {
    name: name.trim(),
    address: getAddress(address),
  });
  if (!saved) return "That address is already a contact.";

  refresh();
  return null;
}

export async function removeContact(contactId: unknown) {
  const { account } = await requireOwner();
  if (typeof contactId !== "string") throw new Error("Invalid contact.");

  await deleteContact(account.address, contactId);
  refresh();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
