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

import { isKitError, type EarnVaultInfo } from "@circle-fin/app-kit";
import { cache } from "react";
import { getAddress, type Address } from "viem";
import { ARC } from "@/lib/chains";
import { BASIS_POINTS_PER_WHOLE } from "@/lib/format";
import type { NamedAddress } from "@/lib/activity";
import { addAmounts, isToken, TOKENS, totalInUsdc, type Amounts, type Token } from "@/lib/tokens";
import {
  appKit,
  createReadOnlyAdapter,
  fromKitAmount,
  fromKitRatio,
  sumFeesInToken,
  toKitAmount,
  type OperationReceipt,
} from "./core";
import type { BusinessWallet } from "./wallet";

// Earn's code for an account that never deposited into a vault.
const NO_POSITION_CODE = 380407;

export type VaultRisk = "Low" | "Medium" | "High";

export type Vault = {
  address: Address;
  name: string;
  protocol: string;
  curator: string | null;
  asset: Token;
  apyBasisPoints: bigint;
  // What can be withdrawn from the vault right now.
  liquidity: bigint;
  risk: VaultRisk;
  // Why the risk isn't low, in plain words.
  riskNotes: string[];
};

export type Position = {
  vault: Vault;
  currentValue: bigint;
  // Null while the provider is still working out the history.
  principal: bigint | null;
  earned: bigint | null;
};

// Server reads.

export const listVaults = cache(async (): Promise<Vault[]> => {
  const { vaults } = await appKit.earn.exploreVaults({ chain: ARC.kitChain });
  return vaults
    .flatMap((vault) => {
      const { asset } = vault;
      return vault.status === "active" && isToken(asset) ? [toVault(vault, asset)] : [];
    })
    .sort((first, second) => Number(second.apyBasisPoints - first.apyBasisPoints));
});

// Every vault's name in each currency, closed ones too, so past savings moves still name their vault.
export const listVaultNames = cache(async (): Promise<NamedAddress[]> => {
  const names: NamedAddress[] = [];
  for (const asset of TOKENS) {
    for await (const vault of appKit.earn.exploreVaultsIterator({ chain: ARC.kitChain, asset })) {
      names.push({ address: getAddress(vault.vaultAddress), name: vault.name });
    }
  }
  return names;
});

export const readPositions = cache(
  async (address: Address, vaults: Vault[]): Promise<Position[]> => {
    const positions = await Promise.all(
      vaults.map((vault) => readPosition(address, vault)),
    );
    return positions.flatMap((position) =>
      position && position.currentValue > BigInt(0) ? [position] : [],
    );
  },
);

// Null when the account never deposited into the vault.
async function readPosition(address: Address, vault: Vault): Promise<Position | null> {
  const position = await appKit.earn
    .getPosition({
      from: { adapter: createReadOnlyAdapter(), chain: ARC.kitChain, address },
      vaultAddress: vault.address,
    })
    .catch((caught: unknown) => {
      if (isNoPosition(caught)) return null;
      throw caught;
    });
  if (!position) return null;
  const pnl = position.pnl.status === "available" ? position.pnl : null;
  return {
    vault,
    currentValue: fromKitAmount(position.currentBalance),
    principal: pnl ? fromKitAmount(pnl.principalDeposited) : null,
    earned: pnl ? fromKitAmount(pnl.totalYieldEarned) : null,
  };
}

function isNoPosition(caught: unknown) {
  if (!isKitError(caught)) return false;
  const trace = caught.cause?.trace;
  return (
    typeof trace === "object" &&
    trace !== null &&
    "earnServiceCode" in trace &&
    trace.earnServiceCode === NO_POSITION_CODE
  );
}

// Browser quotes. What Earn charges, in the vault's asset. Network fees are covered.

export async function quoteDepositFee(
  { adapter }: BusinessWallet,
  vault: Vault,
  amount: bigint,
): Promise<bigint> {
  const { fees } = await appKit.earn.getDepositQuote({
    from: { adapter, chain: ARC.kitChain },
    vaultAddress: vault.address,
    amount: toKitAmount(amount),
  });
  return sumVaultFees(fees, vault);
}

export async function quoteWithdrawalFee(
  { adapter }: BusinessWallet,
  vault: Vault,
  amount: bigint,
): Promise<bigint> {
  const { fees } = await appKit.earn.getWithdrawalQuote({
    from: { adapter, chain: ARC.kitChain },
    vaultAddress: vault.address,
    amount: toKitAmount(amount),
  });
  return sumVaultFees(fees, vault);
}

function sumVaultFees(fees: readonly { symbol: string; amount: string }[], vault: Vault) {
  const vaultFees = fees.map((fee) => ({ name: "a fee", token: fee.symbol, amount: fee.amount }));
  return sumFeesInToken(vaultFees, vault.asset, "Earn");
}

// Browser operations. Approval and deposit go out as one batch, so one passkey prompt.

export async function depositToVault(
  { adapter }: BusinessWallet,
  vault: Vault,
  amount: bigint,
): Promise<OperationReceipt> {
  // Deposits on Arc, from Arc, are always same-chain.
  const result = await appKit.earn.deposit({
    from: { adapter, chain: ARC.kitChain },
    vaultAddress: vault.address,
    amount: toKitAmount(amount),
  });
  return { transactionHash: result.txHash, explorerUrl: result.explorerUrl };
}

export async function withdrawFromVault(
  { adapter }: BusinessWallet,
  vault: Vault,
  amount: bigint,
): Promise<OperationReceipt> {
  const result = await appKit.earn.withdraw({
    from: { adapter, chain: ARC.kitChain },
    vaultAddress: vault.address,
    amount: toKitAmount(amount),
  });
  return { transactionHash: result.txHash, explorerUrl: result.explorerUrl };
}

// Yield keeps accruing, so a full withdrawal reads the whole position again just before sending.
// Earn redeems every share when the amount is all of it, so nothing is left behind.
export async function withdrawAllFromVault(
  wallet: BusinessWallet,
  { vault, currentValue }: Position,
): Promise<OperationReceipt> {
  const { maxWithdrawable } = await appKit.earn.getWithdrawalQuote({
    from: { adapter: wallet.adapter, chain: ARC.kitChain },
    vaultAddress: vault.address,
    amount: toKitAmount(currentValue),
  });
  return withdrawFromVault(wallet, vault, fromKitAmount(maxWithdrawable.amount));
}

function toVault(vault: EarnVaultInfo, asset: Token): Vault {
  const { risk, riskNotes } = assessRisk(vault);
  return {
    address: getAddress(vault.vaultAddress),
    name: vault.name,
    protocol: toTitleCase(vault.protocol),
    curator: vault.manager?.name ?? null,
    asset,
    apyBasisPoints: fromKitRatio(vault.currentApy),
    liquidity: fromKitAmount(vault.liquidityProfile.available),
    risk,
    riskNotes,
  };
}

// A red warning is high risk. A yellow one, or little to withdraw, is medium.
function assessRisk(vault: EarnVaultInfo): { risk: VaultRisk; riskNotes: string[] } {
  const warnings = vault.riskSignals.warnings ?? [];
  const riskNotes = [
    ...warnings.map((warning) => toSentence(warning.type)),
    ...(vault.riskSignals.earnKitWarnings ?? []),
    ...(vault.liquidityProfile.status === "low_liquidity"
      ? ["Little is available to withdraw right now."]
      : []),
  ];
  if (warnings.some((warning) => warning.level === "RED")) return { risk: "High", riskNotes };
  return { risk: riskNotes.length > 0 ? "Medium" : "Low", riskNotes };
}

function toTitleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// Warning types come as codes like "HIGH_UTILIZATION".
function toSentence(code: string) {
  return toTitleCase(code.replaceAll("_", " ")) + ".";
}

export type SavingsSummary = {
  // Each currency on its own. `totalInUsdc` adds them up when there's a rate.
  total: Amounts;
  earned: Amounts;
  annualYield: Amounts;
  // Weighted by what's in each vault. Null when there's EURC and no rate to weigh it at.
  averageApyBasisPoints: bigint | null;
};

export function summarizeSavings(
  positions: Position[],
  eurcRate: bigint | null,
): SavingsSummary {
  const sum = (amountOf: (position: Position) => bigint) =>
    addAmounts(
      ...positions.map((position) => ({
        USDC: BigInt(0),
        EURC: BigInt(0),
        [position.vault.asset]: amountOf(position),
      })),
    );

  const total = sum(({ currentValue }) => currentValue);
  const earned = sum(({ earned }) => earned ?? BigInt(0));
  const annualYield = sum(
    ({ vault, currentValue }) => (currentValue * vault.apyBasisPoints) / BASIS_POINTS_PER_WHOLE,
  );

  const totalValue = totalInUsdc(total, eurcRate);
  const yieldValue = totalInUsdc(annualYield, eurcRate);
  let averageApyBasisPoints: bigint | null = null;
  if (totalValue !== null && yieldValue !== null) {
    averageApyBasisPoints =
      totalValue > BigInt(0) ? (yieldValue * BASIS_POINTS_PER_WHOLE) / totalValue : BigInt(0);
  }
  return { total, earned, annualYield, averageApyBasisPoints };
}
