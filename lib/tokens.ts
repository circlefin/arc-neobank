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
import { ARC } from "./chains";

export const TOKENS = ["USDC", "EURC"] as const;

export type Token = (typeof TOKENS)[number];

// USDC and EURC both use 6 decimals.
export const TOKEN_DECIMALS = 6;

export const ONE_TOKEN = BigInt(10) ** BigInt(TOKEN_DECIMALS);

// ERC-20 contracts on Arc Testnet. USDC here is the same money as Arc's native gas, read in 6 decimals.
export const TOKEN_ADDRESSES: Record<Token, Address> = {
  USDC: ARC.usdcAddress,
  EURC: ARC.kit.eurcAddress,
};

// An amount held in each token, kept apart until there's a rate to add them up.
export type Amounts = Record<Token, bigint>;

export function addAmounts(...list: Amounts[]): Amounts {
  return {
    USDC: list.reduce((total, amounts) => total + amounts.USDC, BigInt(0)),
    EURC: list.reduce((total, amounts) => total + amounts.EURC, BigInt(0)),
  };
}

// All of it in USDC, with EURC at the rate. Null when there's EURC and no rate to count it at.
export function totalInUsdc(amounts: Amounts, eurcRate: bigint | null) {
  if (amounts.EURC === BigInt(0)) return amounts.USDC;
  if (eurcRate === null) return null;
  return amounts.USDC + (amounts.EURC * eurcRate) / ONE_TOKEN;
}

export function isToken(value: unknown): value is Token {
  return TOKENS.some((token) => token === value);
}
