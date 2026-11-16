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
import { ARC } from "@/lib/chains";
import type { KernelClient } from "./kernel-provider";
import { createKernelWallet, type BusinessWallet } from "./wallet";

const ADDRESS: Address = "0xa55DFDd2F0c5f3a14B6712e040749A50b02673c5";
const VAULT: Address = "0x0000000000000000000000000000000000000001";
const OPERATION_HASH: Hex = "0xaa";
const TRANSACTION_HASH: Hex = "0xbb";
const SIGNATURE: Hex = "0xdd";
const KEY = "a1b2c3";

// A ZeroDev client whose operations land with `success`, counting what it's asked to send.
function setup({ success = true }: { success?: boolean } = {}) {
  let sends = 0;
  const receipt = {
    success,
    receipt: {
      transactionHash: TRANSACTION_HASH,
      blockHash: TRANSACTION_HASH,
      blockNumber: BigInt(1),
      gasUsed: BigInt(1),
      logs: [],
    },
  };
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
    async sendUserOperation() {
      sends += 1;
      return OPERATION_HASH;
    },
    async waitForUserOperationReceipt() {
      return receipt;
    },
    async getUserOperationReceipt() {
      return receipt;
    },
  };
  const wallet = createKernelWallet(ADDRESS, async () => client);
  return { wallet, sends: () => sends };
}

// Sends a payment the way the Unified Balance deposit does, but fails after it went out,
// like a response lost to a timeout.
async function payThenLoseTheResponse(wallet: BusinessWallet) {
  await wallet.adapter.batchExecute([{ to: VAULT, data: "0x01" }], ARC.kit);
  throw new Error("Timed out.");
}

describe("runOnce", () => {
  test("returns the earlier try's receipt instead of paying again", async () => {
    const { wallet, sends } = setup();
    await assert.rejects(wallet.runOnce(KEY, payThenLoseTheResponse), /Timed out/);

    const retry = await wallet.runOnce(KEY, payThenLoseTheResponse);

    assert.equal(sends(), 1);
    assert.deepEqual(retry, {
      transactionHash: TRANSACTION_HASH,
      explorerUrl: `https://testnet.arcscan.app/tx/${TRANSACTION_HASH}`,
    });
  });

  test("pays again when the earlier try reverted, since nothing moved", async () => {
    const { wallet, sends } = setup({ success: false });
    await assert.rejects(wallet.runOnce(KEY, payThenLoseTheResponse));
    await assert.rejects(wallet.runOnce(KEY, payThenLoseTheResponse));

    assert.equal(sends(), 2);
  });

  test("keeps different keys apart", async () => {
    const { wallet, sends } = setup();
    await assert.rejects(wallet.runOnce(KEY, payThenLoseTheResponse));
    await assert.rejects(wallet.runOnce("another", payThenLoseTheResponse));

    assert.equal(sends(), 2);
  });
});
