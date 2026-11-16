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

import { OperationFailure } from "@/lib/app-kit/core";
import { SOLANA } from "@/lib/chains";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RADIX = BigInt(58);
const BITS_PER_BYTE = BigInt(8);
const BYTE_MASK = BigInt(0xff);
const PUBLIC_KEY_BYTES = 32;

// Plain wallets belong to the System Program. Mints, token accounts, and programs don't.
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

// A Solana address is a 32-byte public key written in base58. The all-zero key is the system
// program, which can't hold USDC. This checks the format only; isWalletAccount checks the chain.
export function isSolanaAddress(text: string) {
  const bytes = decodeBase58(text);
  return bytes !== null && bytes.length === PUBLIC_KEY_BYTES && bytes.some((byte) => byte !== 0);
}

export function decodeBase58(text: string): number[] | null {
  if (text === "") return null;
  let value = BigInt(0);
  for (const character of text) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return null;
    value = value * BASE58_RADIX + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > BigInt(0)) {
    bytes.unshift(Number(value & BYTE_MASK));
    value >>= BITS_PER_BYTE;
  }
  // Each leading "1" stands for a leading zero byte.
  const leadingZeros = text.length - text.replace(/^1+/, "").length;
  return [...new Array<number>(leadingZeros).fill(0), ...bytes];
}

// USDC sent to a mint, token account, or program can't be spent by anyone. Only a wallet
// (an account the System Program owns, or one that has never been used) is a safe recipient.
export async function requireSolanaWallet(address: string) {
  const account = await callSolanaRpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  if (!isWalletAccount(account)) {
    throw new OperationFailure({
      message:
        "That's a token, program, or token account address, not a wallet. Use the recipient's Solana wallet address.",
      detail: `Solana says ${address} isn't a plain wallet account.`,
      canRetry: false,
    });
  }
}

// Reads getAccountInfo's result.
export function isWalletAccount(account: unknown) {
  if (!isObject(account) || !("value" in account)) {
    throw new Error("Solana returned an account we couldn't read.");
  }
  const { value } = account;
  if (value === null) return true;
  if (!isObject(value) || typeof value.owner !== "string" || typeof value.executable !== "boolean") {
    throw new Error("Solana returned an account we couldn't read.");
  }
  return value.owner === SYSTEM_PROGRAM && !value.executable;
}

// USDC an owner holds on Solana Devnet, across its token accounts, in base units.
export async function readSolanaUsdc(owner: string) {
  const accounts = await callSolanaRpc("getTokenAccountsByOwner", [
    owner,
    { mint: SOLANA.kit.usdcAddress },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  if (!isObject(accounts) || !Array.isArray(accounts.value)) {
    throw new Error("Solana returned token accounts we couldn't read.");
  }
  return accounts.value.reduce<bigint>((total, entry: unknown) => total + readTokenAmount(entry), BigInt(0));
}

// Reads one jsonParsed token account's raw amount.
export function readTokenAmount(entry: unknown) {
  const account = isObject(entry) ? entry.account : undefined;
  const data = isObject(account) ? account.data : undefined;
  const parsed = isObject(data) ? data.parsed : undefined;
  const info = isObject(parsed) ? parsed.info : undefined;
  const tokenAmount = isObject(info) ? info.tokenAmount : undefined;
  const amount = isObject(tokenAmount) ? tokenAmount.amount : undefined;
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) {
    throw new Error("Solana returned a token account we couldn't read.");
  }
  return BigInt(amount);
}

// Calls Solana Devnet's JSON-RPC and returns its result, or throws what it answered instead.
async function callSolanaRpc(method: string, params: unknown[]) {
  const response = await fetch(SOLANA.kit.rpcEndpoints[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Solana couldn't be reached (HTTP ${response.status}). Try again.`);
  const body: unknown = await response.json();
  if (!isObject(body) || !("result" in body)) {
    const detail = isObject(body) && "error" in body ? JSON.stringify(body.error) : "no result";
    throw new Error(`Solana's ${method} failed: ${detail}`);
  }
  return body.result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
