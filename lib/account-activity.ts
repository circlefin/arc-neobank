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

import { isAddressEqual, parseAbi, type Address } from "viem";
import {
  findKitTokens,
  readAccountTransfers,
  toActivities,
  toDepositActivities,
  type ActivityCursor,
  type ActivityPage,
  type CollateralToken,
  type KitToken,
  type NamedAddress,
} from "./activity";
import { listVaultNames } from "./app-kit/earn";
import { getChainClient } from "./business-account";
import { ARC } from "./chains";
import { listContacts } from "./contacts";
import { reportError } from "./monitoring";
import { listPaymentMemos } from "./payment-memos";

// Savings are held as shares of an ERC-4626 vault, which names the asset it holds. Collateral doesn't.
const VAULT_ABI = parseAbi(["function asset() view returns (address)"]);

// Server only. A page of the account's activity, named and noted where the business knows more.
export async function readActivity(
  accountAddress: Address,
  cursor?: ActivityCursor,
): Promise<ActivityPage> {
  const [{ transfers, deposits, nextCursor }, contacts] = await Promise.all([
    readAccountTransfers(accountAddress, cursor),
    listContacts(accountAddress),
  ]);
  const { vaults, collateralTokens } = await identifyKitTokens(
    findKitTokens(transfers, accountAddress),
  );
  // Sorting keeps each chain's own order for entries at the same time.
  const activities = [
    ...toActivities(transfers, accountAddress, { vaults, contacts, collateralTokens }),
    ...toDepositActivities(deposits),
  ].sort((first, second) => second.time.localeCompare(first.time));
  const memos = await listPaymentMemos(
    accountAddress,
    activities.flatMap(({ kind, transactionHash }) =>
      kind === "payment-sent" ? [transactionHash] : [],
    ),
  );
  return {
    activities: activities.map((activity) => ({
      ...activity,
      memo: memos.get(activity.transactionHash) ?? null,
    })),
    nextCursor,
  };
}

// Tells savings from collateral by asking the chain, so savings read as savings even when Earn is
// down or the vault has closed. Neither needs Borrow Kit.
async function identifyKitTokens(tokens: KitToken[]) {
  const checked = await Promise.all(
    tokens.map(async (token) => ({ token, isVault: await isVault(token.address) })),
  );
  const vaultAddresses = checked.flatMap(({ token, isVault }) => (isVault ? [token.address] : []));
  const names = vaultAddresses.length > 0 ? await readVaultNames() : [];
  return {
    vaults: vaultAddresses.map((address) => ({
      address,
      name: names.find((named) => isAddressEqual(named.address, address))?.name ?? null,
    })),
    // A token the explorer can't describe can't be shown as an amount, so it's left out.
    collateralTokens: checked.flatMap(({ token, isVault }): CollateralToken[] => {
      const decimals = Number(token.decimals);
      if (isVault || !token.symbol || token.decimals === null || !Number.isSafeInteger(decimals)) {
        return [];
      }
      return [{ address: token.address, symbol: token.symbol, decimals }];
    }),
  };
}

// Names are only shown. Without Earn, a vault shows by its address, and the failure is reported.
async function readVaultNames(): Promise<NamedAddress[]> {
  try {
    return await listVaultNames();
  } catch (caught) {
    reportError({ area: "activity read", error: caught, context: { read: "vault names" } });
    return [];
  }
}

// Whether a token is a vault never changes, so each is asked once per server.
const vaultChecks = new Map<Address, Promise<boolean>>();

function isVault(tokenAddress: Address) {
  let check = vaultChecks.get(tokenAddress);
  if (!check) {
    check = readIsVault(tokenAddress);
    // A failed read is asked again next time, not remembered.
    check.catch(() => vaultChecks.delete(tokenAddress));
    vaultChecks.set(tokenAddress, check);
  }
  return check;
}

async function readIsVault(tokenAddress: Address) {
  try {
    await getChainClient(ARC.viem).readContract({
      address: tokenAddress,
      abi: VAULT_ABI,
      functionName: "asset",
    });
    return true;
  } catch (caught) {
    if (isNoSuchFunction(caught)) return false;
    throw caught;
  }
}

// A token without `asset()` reverts or returns nothing. Anything else, like the RPC being down,
// is a failed read. Matched by name: a second copy of viem fails `instanceof`.
function isNoSuchFunction(caught: unknown) {
  let error = caught;
  while (typeof error === "object" && error !== null) {
    if (
      "name" in error &&
      (error.name === "ContractFunctionRevertedError" ||
        error.name === "ContractFunctionZeroDataError")
    ) {
      return true;
    }
    error = "cause" in error ? error.cause : undefined;
  }
  return false;
}
