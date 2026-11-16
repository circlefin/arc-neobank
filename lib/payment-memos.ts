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

import type { Address, Hash } from "viem";
import { supabaseAdmin } from "./supabase/admin";

const PAYMENT_MEMOS_TABLE = "payment_memos";

// Saving again for the same payment keeps one memo, so a retry is harmless.
export async function savePaymentMemo(
  accountAddress: Address,
  transactionHash: Hash,
  memo: string,
) {
  const { error } = await supabaseAdmin.from(PAYMENT_MEMOS_TABLE).upsert({
    account_address: accountAddress,
    transaction_hash: transactionHash,
    memo,
  });
  if (error) throw error;
}

// Each listed transaction's memo, by transaction hash. Transactions without one are left out.
export async function listPaymentMemos(
  accountAddress: Address,
  transactionHashes: Hash[],
) {
  const { data, error } = await supabaseAdmin
    .from(PAYMENT_MEMOS_TABLE)
    .select("transaction_hash, memo")
    .eq("account_address", accountAddress)
    .in("transaction_hash", transactionHashes);
  if (error) throw error;
  return new Map(data.map(readPaymentMemo));
}

function readPaymentMemo(row: Record<string, unknown>): [string, string] {
  const { transaction_hash, memo } = row;
  if (typeof transaction_hash !== "string" || typeof memo !== "string") {
    throw new Error("Unexpected payment memo row.");
  }
  return [transaction_hash, memo];
}
