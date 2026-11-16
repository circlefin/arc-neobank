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

import type { Address } from "viem";
import { ARC, explorerTransactionUrl } from "@/lib/chains";
import type { Token } from "@/lib/tokens";
import { appKit, toKitAmount, type OperationReceipt } from "./core";
import type { BusinessWallet } from "./wallet";

export type SendRequest = { token: Token; amount: bigint; recipient: Address };

// A payment from cash on Arc. Gas is covered, so it costs nothing on top.
export async function executeSend(
  { adapter }: BusinessWallet,
  { token, amount, recipient }: SendRequest,
): Promise<OperationReceipt> {
  const step = await appKit.send({
    from: { adapter, chain: ARC.kitChain },
    to: recipient,
    amount: toKitAmount(amount),
    token,
  });
  if (step.state !== "success" || !step.txHash) {
    throw new Error(step.errorMessage ?? "The payment didn't go through onchain.", {
      cause: step.error,
    });
  }
  return {
    transactionHash: step.txHash,
    explorerUrl: step.explorerUrl ?? explorerTransactionUrl(ARC, step.txHash),
  };
}
