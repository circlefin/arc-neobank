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

import type { SwapEstimate, SwapParams } from "@circle-fin/app-kit";
import { ARC, explorerTransactionUrl } from "@/lib/chains";
import { BASIS_POINTS_PER_WHOLE } from "@/lib/format";
import { ONE_TOKEN, type Token } from "@/lib/tokens";
import {
  appKit,
  fromKitAmount,
  sumFeesInToken,
  toKitAmount,
  type OperationReceipt,
} from "./core";
import type { BusinessWallet } from "./wallet";

export type SwapRequest = {
  from: Token;
  to: Token;
  amountIn: bigint;
  slippageBasisPoints: bigint;
};

export type SwapQuote = SwapRequest & {
  expectedOut: bigint;
  minimumOut: bigint;
  // What the swap provider charges, in the `from` token. Network fees are covered.
  fee: bigint;
  // `to` received for one `from`, at this size.
  rate: bigint;
  priceImpactBasisPoints: bigint;
};

export async function quoteSwap(
  wallet: BusinessWallet,
  request: SwapRequest,
): Promise<SwapQuote> {
  // App Kit has no price impact, so compare against a one-unit quote.
  const [estimate, reference] = await Promise.all([
    appKit.estimateSwap(toSwapParams(wallet, request)),
    request.amountIn > ONE_TOKEN
      ? appKit.estimateSwap(toSwapParams(wallet, { ...request, amountIn: ONE_TOKEN }))
      : undefined,
  ]);

  const expectedOut = fromKitAmount(estimate.estimatedOutput?.amount);
  const rate = (expectedOut * ONE_TOKEN) / request.amountIn;
  const referenceRate = reference
    ? fromKitAmount(reference.estimatedOutput?.amount)
    : rate;
  const shortfall = referenceRate - rate;

  return {
    ...request,
    expectedOut,
    minimumOut: fromKitAmount(estimate.stopLimit?.amount),
    fee: sumProviderFees(estimate, request.from),
    rate,
    priceImpactBasisPoints:
      shortfall > BigInt(0) && referenceRate > BigInt(0)
        ? (shortfall * BASIS_POINTS_PER_WHOLE) / referenceRate
        : BigInt(0),
  };
}

// One passkey prompt: App Kit sends the approval and the swap as one batch.
export async function executeSwap(
  wallet: BusinessWallet,
  request: SwapRequest,
): Promise<OperationReceipt> {
  const result = await appKit.swap(toSwapParams(wallet, request));
  return {
    transactionHash: result.txHash,
    explorerUrl: result.explorerUrl ?? explorerTransactionUrl(ARC, result.txHash),
  };
}

function toSwapParams(
  { adapter }: BusinessWallet,
  { from, to, amountIn, slippageBasisPoints }: SwapRequest,
): SwapParams {
  return {
    from: { adapter, chain: ARC.kitChain },
    tokenIn: from,
    tokenOut: to,
    amountIn: toKitAmount(amountIn),
    config: {
      // A permit would need its own passkey signature. An approval rides in the same batch.
      allowanceStrategy: "approve",
      slippageBps: Number(slippageBasisPoints),
    },
  };
}

// Gas is paid by the paymaster, so only the provider's own fees reach the user.
export function sumProviderFees({ fees }: Pick<SwapEstimate, "fees">, token: Token) {
  const providerFees = (fees ?? [])
    .filter((fee) => fee.type !== "gas")
    .map((fee) => ({ name: `the ${fee.type} fee`, token: fee.token, amount: fee.amount }));
  return sumFeesInToken(providerFees, token, "The swap");
}
