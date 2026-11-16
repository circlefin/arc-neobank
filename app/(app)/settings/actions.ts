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
import { BUSINESS_NAME_MAX_LENGTH } from "@/app/constants";
import { requireOwner } from "@/lib/auth";
import { saveBusinessName } from "@/lib/business-profile";

// Returns a message for the form when the name can't be saved.
export async function updateBusinessName(name: unknown) {
  const { account } = await requireOwner();
  if (typeof name !== "string" || name.trim() === "") return "Enter a name.";
  if (name.trim().length > BUSINESS_NAME_MAX_LENGTH) {
    return `Use ${BUSINESS_NAME_MAX_LENGTH} characters or fewer.`;
  }

  await saveBusinessName(account.address, name.trim());
  refresh();
  return null;
}
