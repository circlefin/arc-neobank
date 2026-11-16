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

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeBase58, isSolanaAddress, isWalletAccount, readTokenAmount } from "./solana";

describe("decodeBase58", () => {
  test("reads base58, keeping leading zero bytes", () => {
    assert.deepEqual(decodeBase58("2g"), [0x61]);
    assert.deepEqual(decodeBase58("11"), [0, 0]);
    assert.deepEqual(decodeBase58("1112"), [0, 0, 0, 1]);
  });

  test("rejects empty text and characters outside base58", () => {
    assert.equal(decodeBase58(""), null);
    assert.equal(decodeBase58("0OIl"), null);
    assert.equal(decodeBase58("abc def"), null);
  });
});

describe("isSolanaAddress", () => {
  // The format alone can't tell a wallet from a mint or program. isWalletAccount does that.
  test("accepts any well-formed address, wallet or not", () => {
    assert.equal(isSolanaAddress("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), true); // USDC on Devnet
    assert.equal(isSolanaAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), true);
  });

  test("rejects EVM addresses, wrong lengths, and the all-zero key", () => {
    assert.equal(isSolanaAddress("0x3600000000000000000000000000000000000000"), false);
    assert.equal(isSolanaAddress("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDnc"), false);
    assert.equal(isSolanaAddress("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU1"), false);
    assert.equal(isSolanaAddress("11111111111111111111111111111111"), false);
  });
});

describe("isWalletAccount", () => {
  const account = (owner: string, executable = false) => ({
    context: { slot: 1 },
    value: { owner, executable, lamports: 1, data: ["", "base64"] },
  });

  test("accepts a System Program account, or one never used", () => {
    assert.equal(isWalletAccount(account("11111111111111111111111111111111")), true);
    assert.equal(isWalletAccount({ context: { slot: 1 }, value: null }), true);
  });

  test("rejects mints and token accounts, which the Token program owns, and programs", () => {
    assert.equal(isWalletAccount(account("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")), false);
    assert.equal(isWalletAccount(account("BPFLoaderUpgradeab1e11111111111111111111111", true)), false);
  });

  test("fails on an answer it can't read, rather than guessing", () => {
    assert.throws(() => isWalletAccount(null), /couldn't read/);
    assert.throws(() => isWalletAccount({ value: { owner: 1 } }), /couldn't read/);
  });
});

describe("readTokenAmount", () => {
  test("reads a jsonParsed token account's raw amount", () => {
    const entry = { pubkey: "x", account: { data: { parsed: { info: { tokenAmount: { amount: "356821" } } } } } };
    assert.equal(readTokenAmount(entry), BigInt(356_821));
  });

  test("fails on a shape it can't read, rather than counting it as zero", () => {
    assert.throws(() => readTokenAmount(null), /couldn't read/);
    assert.throws(() => readTokenAmount({ account: { data: ["", "base64"] } }), /couldn't read/);
    assert.throws(() => readTokenAmount({ account: { data: { parsed: { info: { tokenAmount: { amount: "1.5" } } } } } }), /couldn't read/);
  });
});
