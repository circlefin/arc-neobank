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

import {
  AppKit,
  type BridgeParams,
  type BridgeResult,
  type BridgeStep,
} from "@circle-fin/app-kit";
import { ARC, type AppChain, type PayoutChain } from "@/lib/chains";
import { recordBridgeStage } from "@/lib/diagnostics";
import { requireSolanaWallet } from "@/lib/solana";
import { sumFeesInToken, toKitAmount, type OperationReceipt } from "./core";
import type { BusinessWallet } from "./wallet";

export type BridgeRoute =
  // Between the account's own wallets.
  | { from: AppChain; to: AppChain; amount: bigint }
  // Out to someone else's address on a chain the account has no wallet on.
  | { from: AppChain; to: PayoutChain; recipient: string; amount: bigint };

export type BridgeQuote = BridgeRoute & {
  // Provider and delivery fees. Network fees are covered.
  fee: bigint;
  received: bigint;
  estimatedDuration: string;
};

// The stages a move goes through, in order.
export const BRIDGE_STAGES = ["approve", "burn", "fetchAttestation", "mint"] as const;

export type BridgeStage = (typeof BRIDGE_STAGES)[number];

export type StageStatus = "waiting" | "active" | "done" | "failed";

export type StageUpdate = {
  stage: BridgeStage;
  status: StageStatus;
  explorerUrl?: string;
};

// Some stages finished. `result` resumes the move from where it stopped.
export type InterruptedBridge = {
  status: "interrupted";
  result: BridgeResult<string>;
  failedStage?: BridgeStage;
};

export type BridgeOutcome =
  // `arcReceipt` is the send out of Arc, or the delivery into it. A move between other chains has none.
  | { status: "done"; explorerUrl?: string; arcReceipt?: OperationReceipt }
  | InterruptedBridge;

export async function quoteBridge(
  wallet: BusinessWallet,
  route: BridgeRoute,
): Promise<BridgeQuote> {
  // Checked before any quote, so money can't be confirmed to an address no one can spend from.
  if ("recipient" in route) await requireSolanaWallet(route.recipient);
  const estimate = await new AppKit().estimateBridge(toBridgeParams(wallet, route));
  const fees = estimate.fees.map((entry) => ({
    name: `the ${entry.type} fee`,
    token: entry.token,
    amount: entry.amount,
  }));
  const fee = sumFeesInToken(fees, "USDC", "The move");
  return {
    ...route,
    fee,
    received: route.amount - fee,
    estimatedDuration: estimateDuration(route.from),
  };
}

// One passkey prompt on the source chain: approve and send go out as one batch, then Circle
// confirms the transfer and delivers it on the destination chain.
export async function executeBridge(
  wallet: BusinessWallet,
  route: BridgeRoute,
  onStage: (update: StageUpdate) => void,
): Promise<BridgeOutcome> {
  const kit = trackStages(onStage);
  return toOutcome(await kit.bridge(toBridgeParams(wallet, route)));
}

// Picks up an interrupted move from the stage that failed, without repeating finished ones.
export async function resumeBridge(
  wallet: BusinessWallet,
  result: BridgeResult<string>,
  onStage: (update: StageUpdate) => void,
): Promise<BridgeOutcome> {
  const kit = trackStages(onStage);
  return toOutcome(await kit.retryBridge(result, { from: wallet.adapter }));
}

function toBridgeParams(
  { adapter, address }: BusinessWallet,
  route: BridgeRoute,
): BridgeParams {
  return {
    from: { adapter, chain: route.from.kit },
    // Circle's forwarder delivers on the destination chain, so no second prompt is needed there.
    // On Solana it also opens the recipient's USDC account if they have none.
    to: {
      chain: route.to.kit,
      recipientAddress: "recipient" in route ? route.recipient : address,
      useForwarder: true,
    },
    amount: toKitAmount(route.amount),
    token: "USDC",
    config: { transferSpeed: "FAST" },
  };
}

// A kit of its own per move, so its stage events can't mix with another move's.
function trackStages(onStage: (update: StageUpdate) => void) {
  const kit = new AppKit();
  for (const stage of BRIDGE_STAGES) {
    kit.on(`bridge.${stage}`, ({ values }) => {
      // Moves here are CCTP v2, whose events carry the stage's state.
      if (!("state" in values)) return;
      const status = toStageStatus(values.state);
      recordBridgeStage(stage, status, values.explorerUrl);
      onStage({ stage, status, explorerUrl: values.explorerUrl });
    });
  }
  return kit;
}

function toOutcome(result: BridgeResult<string>): BridgeOutcome {
  if (result.state === "success") {
    const mint = result.steps.find((step) => step.name === "mint");
    return { status: "done", explorerUrl: mint?.explorerUrl, arcReceipt: findArcReceipt(result) };
  }
  const failed = result.steps.find((step) => step.state === "error");
  // Until the send goes out, no money has left, so the move failed rather than paused.
  if (!result.steps.some((step) => step.name === "burn" && step.state !== "error")) {
    if (failed?.error instanceof Error) throw failed.error;
    throw new Error(failed?.errorMessage ?? "The move stopped before sending.");
  }
  return {
    status: "interrupted",
    result,
    failedStage: BRIDGE_STAGES.find((stage) => stage === failed?.name),
  };
}

function findArcReceipt({ source, destination, steps }: BridgeResult<string>) {
  const isFromArc = source.chain.chain === ARC.kitChain;
  if (!isFromArc && destination.chain.chain !== ARC.kitChain) return undefined;
  const step = steps.find(({ name }) => name === (isFromArc ? "burn" : "mint"));
  return step?.txHash ? { transactionHash: step.txHash, explorerUrl: step.explorerUrl } : undefined;
}

function toStageStatus(state: BridgeStep["state"]): StageStatus {
  if (state === "success" || state === "noop") return "done";
  if (state === "error") return "failed";
  return "active";
}

// App Kit gives no time, so these are Circle's confirmation times for each source chain:
// Arc ~0.5 seconds, Base ~8 seconds with Fast Transfer.
// https://developers.circle.com/cctp/required-block-confirmations
function estimateDuration(from: AppChain) {
  return from.kitChain === ARC.kitChain ? "A few seconds" : "About 8 seconds";
}
