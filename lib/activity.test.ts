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
import { getAddress, zeroAddress, type Address, type Hash } from "viem";
import {
  findKitTokens,
  readAccountTransfers,
  readTransfers,
  toActivities,
  type Transfer,
} from "./activity";
import { ARC, OTHER_CHAINS } from "./chains";
import { parseAmount } from "./format";
import { TOKEN_ADDRESSES } from "./tokens";

const ACCOUNT: Address = "0x00000000000000000000000000000000000000a1";
const CONTACT: Address = "0x00000000000000000000000000000000000000c1";
const STRANGER: Address = "0x00000000000000000000000000000000000000d1";
// App Kit's contract that moves money into and out of vaults.
const EARN_CONTRACT: Address = "0x00000000000000000000000000000000000000e1";
// A vault's shares are the vault's own token.
const VAULT: Address = "0x00000000000000000000000000000000000000f1";
const SHARE_DECIMALS = "18";
const COLLATERAL: Address = "0x00000000000000000000000000000000000000b1";
const COLLATERAL_DECIMALS = 8;
const { adapter, bridge } = ARC.kit.kitContracts ?? {};
if (!adapter || !bridge) throw new Error("App Kit has no adapter or bridge contract on Arc.");
const KIT_ADAPTER = getAddress(adapter);
const KIT_BRIDGE = getAddress(bridge);
const tokenMessenger = Object.values(ARC.kit.cctp?.contracts ?? {})[0]?.tokenMessenger;
if (!tokenMessenger) throw new Error("App Kit has no CCTP token messenger on Arc.");
const TOKEN_MESSENGER = getAddress(tokenMessenger);

const LABELS = {
  vaults: [{ address: VAULT, name: "USDC Vault" }],
  contacts: [{ address: CONTACT, name: "Acme Supplies" }],
  collateralTokens: [{ address: COLLATERAL, symbol: "cirBTC", decimals: COLLATERAL_DECIMALS }],
};

function transfer(
  transactionHash: Hash,
  fields: Pick<Transfer, "tokenAddress" | "from" | "to"> & Partial<Transfer>,
): Transfer {
  return {
    id: `${transactionHash}-${fields.from}`,
    chainId: ARC.viem.id,
    symbol: null,
    decimals: "6",
    value: parseAmount("10"),
    transactionHash,
    method: null,
    blockNumber: 1,
    logIndex: 0,
    time: "2026-10-06T12:00:00.000Z",
    ...fields,
  };
}

const PAYMENT: Hash = `0x${"1".repeat(64)}`;
const DEPOSIT: Hash = `0x${"2".repeat(64)}`;
const WITHDRAWAL: Hash = `0x${"3".repeat(64)}`;
const OTHER: Hash = `0x${"4".repeat(64)}`;

// Collateral moves in its own decimals.
function collateral(transactionHash: Hash, fields: Pick<Transfer, "from" | "to" | "value">) {
  return transfer(transactionHash, {
    tokenAddress: COLLATERAL,
    decimals: String(COLLATERAL_DECIMALS),
    ...fields,
  });
}

function usdc(transactionHash: Hash, fields: Pick<Transfer, "from" | "to"> & Partial<Transfer>) {
  return transfer(transactionHash, { tokenAddress: TOKEN_ADDRESSES.USDC, ...fields });
}

function summarize(transfers: Transfer[]) {
  return toActivities(transfers, ACCOUNT, LABELS).map(({ kind, amount, otherAmount }) => ({
    kind,
    amount: `${amount.value} ${amount.symbol}`,
    otherAmount: otherAmount && `${otherAmount.value} ${otherAmount.symbol}`,
  }));
}

describe("toActivities", () => {
  test("names a saved contact and leaves other addresses unnamed", () => {
    const activities = toActivities(
      [
        transfer(PAYMENT, { tokenAddress: TOKEN_ADDRESSES.USDC, from: ACCOUNT, to: CONTACT }),
        transfer(PAYMENT, { tokenAddress: TOKEN_ADDRESSES.EURC, from: STRANGER, to: ACCOUNT }),
      ],
      ACCOUNT,
      LABELS,
    );

    assert.deepEqual(
      activities.map(({ kind, amount, counterparty, counterpartyName }) => ({
        kind,
        token: amount.symbol,
        counterparty,
        counterpartyName,
      })),
      [
        { kind: "payment-sent", token: "USDC", counterparty: CONTACT, counterpartyName: "Acme Supplies" },
        { kind: "money-added", token: "EURC", counterparty: STRANGER, counterpartyName: null },
      ],
    );
  });

  test("labels cash moving with vault shares as savings, named after the vault", () => {
    const activities = toActivities(
      [
        transfer(WITHDRAWAL, { tokenAddress: VAULT, from: ACCOUNT, to: EARN_CONTRACT, decimals: SHARE_DECIMALS }),
        transfer(WITHDRAWAL, { tokenAddress: TOKEN_ADDRESSES.USDC, from: EARN_CONTRACT, to: ACCOUNT }),
        transfer(DEPOSIT, { tokenAddress: TOKEN_ADDRESSES.USDC, from: ACCOUNT, to: EARN_CONTRACT }),
        transfer(DEPOSIT, { tokenAddress: VAULT, from: EARN_CONTRACT, to: ACCOUNT, decimals: SHARE_DECIMALS }),
      ],
      ACCOUNT,
      LABELS,
    );

    assert.deepEqual(
      activities.map(({ kind, counterpartyName }) => ({ kind, counterpartyName })),
      [
        { kind: "savings-withdrawal", counterpartyName: "USDC Vault" },
        { kind: "savings-deposit", counterpartyName: "USDC Vault" },
      ],
    );
  });

  test("labels a swap as one entry with what it got", () => {
    assert.deepEqual(
      summarize([
        transfer(OTHER, { tokenAddress: TOKEN_ADDRESSES.EURC, from: KIT_ADAPTER, to: ACCOUNT, value: BigInt(1_004_806) }),
        usdc(OTHER, { from: ACCOUNT, to: KIT_ADAPTER, value: BigInt(1_000_000) }),
      ]),
      [{ kind: "swap", amount: "1000000 USDC", otherAmount: "1004806 EURC" }],
    );
  });

  test("labels a borrow with the collateral it put up", () => {
    assert.deepEqual(
      summarize([
        collateral(OTHER, { from: ACCOUNT, to: KIT_ADAPTER, value: BigInt(193) }),
        usdc(OTHER, { from: KIT_ADAPTER, to: ACCOUNT, value: BigInt(100_000) }),
      ]),
      [{ kind: "borrow", amount: "100000 USDC", otherAmount: "193 cirBTC" }],
    );
  });

  test("labels collateral sent on its own as collateral added", () => {
    assert.deepEqual(
      summarize([collateral(OTHER, { from: ACCOUNT, to: KIT_ADAPTER, value: BigInt(100) })]),
      [{ kind: "collateral-added", amount: "100 cirBTC", otherAmount: null }],
    );
  });

  test("labels cash to the adapter on its own as a repayment, and back on its own as a borrow", () => {
    assert.deepEqual(
      summarize([
        usdc(OTHER, { from: ACCOUNT, to: KIT_ADAPTER, value: BigInt(30_000) }),
        usdc(PAYMENT, { from: KIT_ADAPTER, to: ACCOUNT, value: BigInt(20_000) }),
      ]),
      [
        { kind: "loan-repaid", amount: "30000 USDC", otherAmount: null },
        { kind: "borrow", amount: "20000 USDC", otherAmount: null },
      ],
    );
  });

  test("labels a payoff with what it cost after the change came back", () => {
    assert.deepEqual(
      summarize([
        usdc(OTHER, { from: ACCOUNT, to: KIT_ADAPTER, value: BigInt(72_102) }),
        usdc(OTHER, { from: KIT_ADAPTER, to: ACCOUNT, value: BigInt(2_101) }),
        collateral(OTHER, { from: KIT_ADAPTER, to: ACCOUNT, value: BigInt(293) }),
      ]),
      [{ kind: "loan-paid-off", amount: "70001 USDC", otherAmount: "293 cirBTC" }],
    );
  });

  test("labels moves between Arc, other chains, and Unified Balance", () => {
    const moves = [
      usdc(`0x${"5".repeat(64)}`, { from: ACCOUNT, to: KIT_BRIDGE }),
      usdc(`0x${"6".repeat(64)}`, { from: ACCOUNT, to: ARC.gatewayWallet }),
      usdc(`0x${"7".repeat(64)}`, { from: zeroAddress, to: ACCOUNT, method: "gatewayMint" }),
      usdc(`0x${"8".repeat(64)}`, { from: zeroAddress, to: ACCOUNT, method: "receiveMessage" }),
      usdc(`0x${"9".repeat(64)}`, { from: zeroAddress, to: ACCOUNT, method: "mint" }),
      // An unverified contract's call comes as its selector: this is gatewayMint's.
      usdc(`0x${"a".repeat(64)}`, { from: zeroAddress, to: ACCOUNT, method: "0x9fb01cc5" }),
      // A move can skip App Kit's bridge and go straight to Circle's token messenger.
      usdc(`0x${"b".repeat(64)}`, { from: ACCOUNT, to: TOKEN_MESSENGER }),
    ];

    assert.deepEqual(
      summarize(moves).map(({ kind }) => kind),
      [
        "moved-out-of-arc",
        "moved-to-unified-balance",
        "moved-to-cash",
        "moved-into-arc",
        "money-added",
        "moved-to-cash",
        "moved-out-of-arc",
      ],
    );
  });

  test("leaves out tokens other than USDC and EURC, even without decimals", () => {
    const activities = toActivities(
      [transfer(PAYMENT, { tokenAddress: STRANGER, from: STRANGER, to: ACCOUNT, decimals: null })],
      ACCOUNT,
      LABELS,
    );

    assert.deepEqual(activities, []);
  });

  test("rejects USDC with unexpected decimals", () => {
    assert.throws(() =>
      toActivities(
        [transfer(PAYMENT, { tokenAddress: TOKEN_ADDRESSES.USDC, from: ACCOUNT, to: CONTACT, decimals: "18" })],
        ACCOUNT,
        LABELS,
      ),
    );
  });
});

describe("findKitTokens", () => {
  test("finds tokens that moved through App Kit's adapter, not ones sent unasked", () => {
    const transfers = [
      usdc(DEPOSIT, { from: ACCOUNT, to: KIT_ADAPTER }),
      transfer(DEPOSIT, { tokenAddress: VAULT, from: KIT_ADAPTER, to: ACCOUNT, symbol: null, decimals: SHARE_DECIMALS }),
      transfer(OTHER, { tokenAddress: STRANGER, from: STRANGER, to: ACCOUNT, symbol: "FREE", decimals: "18" }),
      // A transaction with someone else as well isn't App Kit's alone.
      usdc(PAYMENT, { from: ACCOUNT, to: KIT_ADAPTER }),
      transfer(PAYMENT, { tokenAddress: COLLATERAL, from: ACCOUNT, to: STRANGER, symbol: "cirBTC", decimals: "8" }),
    ];

    assert.deepEqual(findKitTokens(transfers, ACCOUNT), [
      { address: VAULT, symbol: null, decimals: SHARE_DECIMALS },
    ]);
  });
});

describe("readTransfers", () => {
  test("holds back a transaction that may run onto the next page", async (context) => {
    const item = (transactionHash: Hash, blockNumber: number, logIndex: number) => ({
      transaction_hash: transactionHash,
      log_index: logIndex,
      block_number: blockNumber,
      method: null,
      timestamp: "2026-10-06T12:00:00.000Z",
      token: { address_hash: TOKEN_ADDRESSES.USDC },
      total: { decimals: "6", value: "1" },
      from: { hash: ACCOUNT },
      to: { hash: CONTACT },
    });
    const page = {
      items: [item(PAYMENT, 9, 4), item(DEPOSIT, 8, 2), item(WITHDRAWAL, 7, 6), item(WITHDRAWAL, 7, 5)],
      next_page_params: { block_number: 7, index: 5 },
    };
    context.mock.method(globalThis, "fetch", async () => Response.json(page));

    const { transfers, nextCursor } = await readTransfers(ACCOUNT);

    assert.deepEqual(
      transfers.map(({ transactionHash }) => transactionHash),
      [PAYMENT, DEPOSIT],
    );
    assert.deepEqual(nextCursor, { blockNumber: 8, index: 2 });
  });

  test("reads on when a page holds only part of one transaction", async (context) => {
    const item = (transactionHash: Hash, logIndex: number, from: Address, to: Address) => ({
      transaction_hash: transactionHash,
      log_index: logIndex,
      block_number: 9,
      method: null,
      timestamp: "2026-10-06T12:00:00.000Z",
      token: { address_hash: TOKEN_ADDRESSES.USDC, symbol: "USDC" },
      total: { decimals: "6", value: "1" },
      from: { hash: from },
      to: { hash: to },
    });
    const pages = [
      { items: [item(DEPOSIT, 5, KIT_ADAPTER, ACCOUNT)], next_page_params: { block_number: 9, index: 5 } },
      {
        items: [item(DEPOSIT, 4, ACCOUNT, KIT_ADAPTER), item(PAYMENT, 2, ACCOUNT, CONTACT)],
        next_page_params: null,
      },
    ];
    const requested: (string | null)[] = [];
    context.mock.method(globalThis, "fetch", async (url: URL) => {
      requested.push(url.searchParams.get("index"));
      return Response.json(pages[requested.length - 1]);
    });

    const { transfers, nextCursor } = await readTransfers(ACCOUNT);

    assert.deepEqual(requested, [null, "5"]);
    assert.deepEqual(
      transfers.map(({ transactionHash, logIndex }) => [transactionHash, logIndex]),
      [[DEPOSIT, 5], [DEPOSIT, 4], [PAYMENT, 2]],
    );
    assert.equal(nextCursor, null);
  });
});

describe("readAccountTransfers", () => {
  const [BASE] = OTHER_CHAINS;
  const BRIDGE_ON_BASE: Address = "0x00000000000000000000000000000000000000b2";

  function item(
    transactionHash: Hash,
    blockNumber: number,
    time: string,
    { token, from = ACCOUNT, to = CONTACT }: { token: Address; from?: Address; to?: Address },
  ) {
    return {
      transaction_hash: transactionHash,
      log_index: 1,
      block_number: blockNumber,
      method: null,
      timestamp: time,
      token: { address_hash: token, symbol: "USDC" },
      total: { decimals: "6", value: "1" },
      from: { hash: from },
      to: { hash: to },
    };
  }

  test("keeps Base deposits newer than the oldest Arc transfer read, and the rest for later", async (context) => {
    const arcPage = {
      items: [
        item(PAYMENT, 30, "2026-10-06T12:03:00.000Z", { token: TOKEN_ADDRESSES.USDC }),
        item(OTHER, 10, "2026-10-06T12:01:00.000Z", { token: TOKEN_ADDRESSES.USDC }),
        // May run onto the next page, so it's held back.
        item(WITHDRAWAL, 5, "2026-10-06T11:59:00.000Z", { token: TOKEN_ADDRESSES.USDC }),
      ],
      next_page_params: { block_number: 5, index: 1 },
    };
    const basePage = {
      items: [
        item(DEPOSIT, 200, "2026-10-06T12:02:00.000Z", { token: BASE.usdcAddress, to: BASE.gatewayWallet }),
        // Not a deposit, so never shown, but it still sets where Base goes on from.
        item(OTHER, 150, "2026-10-06T12:01:30.000Z", { token: BASE.usdcAddress, to: BRIDGE_ON_BASE }),
        item(WITHDRAWAL, 100, "2026-10-06T12:00:00.000Z", { token: BASE.usdcAddress, to: BASE.gatewayWallet }),
      ],
      next_page_params: null,
    };
    context.mock.method(globalThis, "fetch", async (url: URL) =>
      Response.json(url.href.startsWith(BASE.explorerApiUrl) ? basePage : arcPage),
    );

    const { transfers, deposits, nextCursor } = await readAccountTransfers(ACCOUNT);

    assert.deepEqual(transfers.map(({ transactionHash }) => transactionHash), [PAYMENT, OTHER]);
    assert.deepEqual(deposits.map(({ transactionHash }) => transactionHash), [DEPOSIT]);
    assert.deepEqual(nextCursor, [
      { chainId: ARC.viem.id, after: { blockNumber: 10, index: 1 } },
      { chainId: BASE.viem.id, after: { blockNumber: 150, index: 1 } },
    ]);
  });

  test("leaves a chain out of the cursor once it has nothing older", async (context) => {
    context.mock.method(globalThis, "fetch", async (url: URL) =>
      Response.json({
        items: url.href.startsWith(BASE.explorerApiUrl)
          ? []
          : [item(PAYMENT, 30, "2026-10-06T12:03:00.000Z", { token: TOKEN_ADDRESSES.USDC })],
        next_page_params: null,
      }),
    );

    const { nextCursor } = await readAccountTransfers(ACCOUNT);

    assert.equal(nextCursor, null);
  });
});
