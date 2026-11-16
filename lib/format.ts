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

import { formatUnits, parseUnits } from "viem";
import { TOKEN_DECIMALS, totalInUsdc, type Amounts } from "./tokens";

const CENTS_DIGITS = 2;
// "0x" and four hex digits at the front, four at the back.
const ADDRESS_START_LENGTH = 6;
const ADDRESS_END_LENGTH = 4;
export const BASIS_POINTS_PER_WHOLE = BigInt(10_000);
export const FULL_PERCENT = 100;

// Digits, one optional point, and no more decimals than the token has.
export function toAmountPattern(decimals: number) {
  return new RegExp(`^\\d*\\.?\\d{0,${decimals}}$`);
}

export const AMOUNT_PATTERN = toAmountPattern(TOKEN_DECIMALS);

export function formatUsd(amount: bigint, fractionDigits = CENTS_DIGITS) {
  return usdFormatter(fractionDigits).format(toDecimal(amount));
}

// One dollar figure when EURC can be counted at a rate. Without one, each currency on its own,
// like "$1,200.00 + 500.00 EURC", rather than a total that leaves EURC out.
export function formatTotal(
  amounts: Amounts,
  eurcRate: bigint | null,
  fractionDigits = CENTS_DIGITS,
) {
  const total = totalInUsdc(amounts, eurcRate);
  if (total !== null) return formatUsd(total, fractionDigits);
  return `${formatUsd(amounts.USDC, fractionDigits)} + ${formatTokenAmount(amounts.EURC)} EURC`;
}

// Splits "$1,234.56" into "$1,234" and ".56", so the cents can be drawn smaller.
export function formatUsdParts(amount: bigint) {
  const parts = usdFormatter(CENTS_DIGITS).formatToParts(toDecimal(amount));
  const decimalIndex = parts.findIndex((part) => part.type === "decimal");
  const joinParts = (list: Intl.NumberFormatPart[]) =>
    list.map((part) => part.value).join("");
  return {
    whole: joinParts(parts.slice(0, decimalIndex)),
    fraction: joinParts(parts.slice(decimalIndex)),
  };
}

export function formatTokenAmount(amount: bigint, decimals = TOKEN_DECIMALS) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: CENTS_DIGITS,
    maximumFractionDigits: decimals,
  }).format(toDecimal(amount, decimals));
}

export function formatPercent(basisPoints: bigint) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: CENTS_DIGITS,
    maximumFractionDigits: CENTS_DIGITS,
  }).format(Number(basisPoints) / Number(BASIS_POINTS_PER_WHOLE));
}

// A health factor of 1.85 is stored as 18,500 basis points.
export function formatHealthFactor(basisPoints: bigint) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: CENTS_DIGITS,
    maximumFractionDigits: CENTS_DIGITS,
  }).format(Number(basisPoints) / Number(BASIS_POINTS_PER_WHOLE));
}

// Shortens an address to "0x1a54…69D1", or a Solana one to "4zMMC9…ncDU".
export function formatAddress(address: string) {
  return `${address.slice(0, ADDRESS_START_LENGTH)}…${address.slice(-ADDRESS_END_LENGTH)}`;
}

// Both read the time zone of wherever they run, so the browser shows local time.
export function formatDateTime(isoTime: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTime));
}

// Leaves out the year, to fit a list row.
export function formatShortDateTime(isoTime: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoTime));
}

// Expects text that already matches the amount pattern for these decimals.
export function parseAmount(text: string, decimals = TOKEN_DECIMALS) {
  // An empty field, or a lone point, means nothing entered yet.
  if (!/\d/.test(text)) return BigInt(0);
  return parseUnits(text, decimals);
}

// Turns a base-unit amount back into text for an amount input.
export function toAmountText(amount: bigint, decimals = TOKEN_DECIMALS) {
  return formatUnits(amount, decimals);
}

function usdFormatter(fractionDigits: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

// Display only: money stays in integer base units everywhere else.
function toDecimal(amount: bigint, decimals = TOKEN_DECIMALS) {
  return Number(formatUnits(amount, decimals));
}
