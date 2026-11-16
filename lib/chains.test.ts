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
import { arcTestnet } from "viem/chains";
import {
  APP_CHAINS,
  ARC,
  chainLabel,
  explorerTransactionUrl,
  findChainById,
  findChainByKitName,
} from "./chains";

describe("chains", () => {
  test("works on Arc and Base, each once", () => {
    assert.deepEqual(
      APP_CHAINS.map((chain) => chain.label),
      ["Arc", "Base"],
    );
    assert.equal(new Set(APP_CHAINS.map((chain) => chain.viem.id)).size, APP_CHAINS.length);
  });

  test("finds a chain by viem id or App Kit name", () => {
    assert.equal(findChainById(arcTestnet.id), ARC);
    assert.equal(findChainByKitName("Arc_Testnet"), ARC);
    assert.equal(findChainById(1), undefined);
  });

  test("labels known chains, and tidies App Kit names for the rest", () => {
    assert.equal(chainLabel("Arc_Testnet"), "Arc");
    assert.equal(chainLabel("World_Chain_Sepolia"), "World Chain");
    assert.equal(chainLabel("Avalanche_Fuji"), "Avalanche");
  });

  test("links a transaction to the Arc explorer", () => {
    assert.equal(
      explorerTransactionUrl(ARC, "0xabc"),
      "https://testnet.arcscan.app/tx/0xabc",
    );
  });
});
