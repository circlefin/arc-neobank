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
import type { Address, Hex } from "viem";
import {
  INTERNAL_ERROR,
  KernelProvider,
  UNAUTHORIZED,
  UNRECOGNIZED_CHAIN,
  UNSUPPORTED_METHOD,
  USER_REJECTED,
  type KernelClient,
} from "./kernel-provider";

const CHAIN_ID = 5042002;
const ADDRESS: Address = "0xa55DFDd2F0c5f3a14B6712e040749A50b02673c5";
const STRANGER: Address = "0x631FDAafe9ff675bF7A122013D1555513363dCC7";
const VAULT: Address = "0x0000000000000000000000000000000000000001";
const OPERATION_HASH: Hex = "0xaa";
const TRANSACTION_HASH: Hex = "0xbb";
const BLOCK_HASH: Hex = "0xcc";
const SIGNATURE: Hex = "0xdd";

type SentCalls = Parameters<KernelClient["sendUserOperation"]>[0]["calls"];

// A ZeroDev client that records what it's asked to send, without a chain or a passkey.
function setup({
  success = true,
  reason,
  sendError,
}: { success?: boolean; reason?: string; sendError?: unknown } = {}) {
  const sent: SentCalls[] = [];
  const reads: string[] = [];
  const client: KernelClient = {
    account: {
      async isDeployed() {
        return true;
      },
      async signMessage() {
        return SIGNATURE;
      },
      async signTypedData() {
        return SIGNATURE;
      },
    },
    async sendUserOperation({ calls }) {
      if (sendError) throw sendError;
      sent.push(calls);
      return OPERATION_HASH;
    },
    async waitForUserOperationReceipt() {
      return {
        success,
        reason,
        receipt: {
          transactionHash: TRANSACTION_HASH,
          blockHash: BLOCK_HASH,
          blockNumber: BigInt(1),
          gasUsed: BigInt(1),
          logs: [],
        },
      };
    },
    async getUserOperationReceipt() {
      return this.waitForUserOperationReceipt({ hash: OPERATION_HASH });
    },
  };
  const publicClient = {
    async request({ method }: { method: string }) {
      reads.push(method);
      return "0x1";
    },
  };
  const provider = new KernelProvider({
    chainId: CHAIN_ID,
    address: ADDRESS,
    getKernelClient: async () => client,
    publicClient,
  });
  return { provider, sent, reads };
}

describe("KernelProvider", () => {
  test("answers as the business account on its one chain", async () => {
    const { provider } = setup();
    assert.equal(await provider.request({ method: "eth_chainId" }), "0x4cef52");
    assert.deepEqual(await provider.request({ method: "eth_accounts" }), [ADDRESS]);
    await assert.rejects(
      provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] }),
      { code: UNRECOGNIZED_CHAIN },
    );
  });

  test("sends a transaction as a UserOperation and returns the bundle's hash", async () => {
    const { provider, sent } = setup();
    const hash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: ADDRESS, to: VAULT, data: "0x1234", value: "0x10" }],
    });

    assert.equal(hash, TRANSACTION_HASH);
    assert.deepEqual(sent, [[{ to: VAULT, data: "0x1234", value: BigInt(16) }]]);
  });

  test("fails a transaction whose account call reverted, even though the bundle succeeded", async () => {
    const { provider } = setup({ success: false, reason: "ERC20: insufficient allowance" });
    await assert.rejects(
      provider.request({ method: "eth_sendTransaction", params: [{ to: VAULT }] }),
      { code: INTERNAL_ERROR, message: "execution reverted: ERC20: insufficient allowance" },
    );
  });

  test("sends a whole batch as one UserOperation, so it needs one passkey prompt", async () => {
    const { provider, sent } = setup();
    const result = await provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          atomicRequired: true,
          from: ADDRESS,
          calls: [{ to: VAULT, data: "0x01" }, { to: VAULT, data: "0x02" }],
        },
      ],
    });

    assert.deepEqual(result, { id: OPERATION_HASH });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].length, 2);
  });

  test("refuses to act for another address", async () => {
    const { provider, sent } = setup();
    await assert.rejects(
      provider.request({ method: "eth_sendTransaction", params: [{ from: STRANGER, to: VAULT }] }),
      { code: UNAUTHORIZED },
    );
    assert.equal(sent.length, 0);
  });

  test("refuses raw signing and contract deployment", async () => {
    const { provider } = setup();
    await assert.rejects(provider.request({ method: "eth_sign", params: [ADDRESS, "0x01"] }), { code: UNSUPPORTED_METHOD });
    await assert.rejects(
      provider.request({ method: "eth_sendTransaction", params: [{ data: "0x60" }] }),
      { code: UNSUPPORTED_METHOD },
    );
  });

  test("reports a dismissed passkey prompt as user rejected", async () => {
    const dismissed = Object.assign(new Error("The operation was aborted."), { name: "NotAllowedError" });
    const { provider } = setup({ sendError: dismissed });
    await assert.rejects(
      provider.request({ method: "eth_sendTransaction", params: [{ to: VAULT }] }),
      { code: USER_REJECTED },
    );
  });

  test("passes reads straight to the chain", async () => {
    const { provider, reads } = setup();
    assert.equal(await provider.request({ method: "eth_blockNumber" }), "0x1");
    assert.deepEqual(reads, ["eth_blockNumber"]);
  });
});
