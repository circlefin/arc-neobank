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

import { isHash } from "viem";
import { PAYMENT_MEMO_MAX_LENGTH } from "@/app/constants";
import { readActivity } from "@/lib/account-activity";
import { isActivityCursor, isTransactionListed } from "@/lib/activity";
import { requirePasskeyUser } from "@/lib/auth";
import { savePaymentMemo } from "@/lib/payment-memos";

export async function loadMoreActivity(cursor: unknown) {
  const { account } = await requirePasskeyUser();
  if (!isActivityCursor(cursor)) throw new Error("Invalid activity cursor.");
  return readActivity(account.address, cursor);
}

// Whether activity can show the transaction yet. The explorer it reads lags the chain.
export async function isInActivity(chainId: unknown, transactionHash: unknown) {
  await requirePasskeyUser();
  if (typeof chainId !== "number") throw new Error("Invalid chain.");
  if (typeof transactionHash !== "string" || !isHash(transactionHash)) {
    throw new Error("Invalid transaction hash.");
  }
  return isTransactionListed(chainId, transactionHash);
}

// Owners and Operators both send payments, so either may note one.
export async function addPaymentMemo(transactionHash: unknown, memo: unknown) {
  const { account } = await requirePasskeyUser();
  if (typeof transactionHash !== "string" || !isHash(transactionHash)) {
    throw new Error("Invalid transaction hash.");
  }
  if (typeof memo !== "string") throw new Error("Invalid memo.");
  const trimmed = memo.trim();
  if (trimmed === "" || trimmed.length > PAYMENT_MEMO_MAX_LENGTH) {
    throw new Error("Invalid memo.");
  }
  await savePaymentMemo(account.address, transactionHash, trimmed);
}
