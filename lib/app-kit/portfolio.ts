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

import { cache } from "react";
import type { Address } from "viem";
import { reportError } from "@/lib/monitoring";
import { readCredit, type Credit } from "./borrow";
import {
  listVaults,
  readPositions,
  summarizeSavings,
  type Position,
  type SavingsSummary,
  type Vault,
} from "./earn";
import { readTreasury, type Treasury } from "./treasury";

// Server only. Everything the signed-in pages show about the business's money, read once per request.

export type Portfolio = {
  treasury: Treasury;
  // Empty when Earn can't be reached.
  vaults: Vault[];
  positions: Position[];
  savings: SavingsSummary;
  // Empty when Borrow can't be reached.
  credit: Credit;
  // Names what couldn't be read this time, like "Unified Balance". Those count as zero.
  unavailable: string[];
  // There's EURC but no rate, so totals show each currency on its own.
  eurcUnconverted: boolean;
};

export const readPortfolio = cache(async (address: Address): Promise<Portfolio> => {
  const [treasury, earn, borrow] = await Promise.all([
    readTreasury(address),
    readEarn(address),
    readBorrow(address),
  ]);
  const savings = summarizeSavings(earn.positions, treasury.eurcRate);
  return {
    treasury,
    vaults: earn.vaults,
    positions: earn.positions,
    savings,
    credit: borrow.credit,
    unavailable: [...treasury.unavailable, ...earn.unavailable, ...borrow.unavailable],
    eurcUnconverted:
      treasury.eurcRate === null &&
      (treasury.spendable.EURC > BigInt(0) || savings.total.EURC > BigInt(0)),
  };
});

// Earn can be down without hiding the rest of the account.
async function readEarn(address: Address) {
  try {
    const vaults = await listVaults();
    return { vaults, positions: await readPositions(address, vaults), unavailable: [] };
  } catch (caught) {
    reportError({ area: "portfolio read", error: caught, context: { read: "savings" } });
    return { vaults: [], positions: [], unavailable: ["savings"] };
  }
}

// Borrow can be down without hiding the rest of the account.
async function readBorrow(address: Address) {
  try {
    return { credit: await readCredit(address), unavailable: [] };
  } catch (caught) {
    reportError({ area: "portfolio read", error: caught, context: { read: "credit" } });
    return { credit: { markets: [], loans: [] }, unavailable: ["credit"] };
  }
}
