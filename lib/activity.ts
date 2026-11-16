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

import {
  getAddress,
  isAddress,
  isAddressEqual,
  isHash,
  toFunctionSelector,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { APP_CHAINS, ARC, findChainById, requireChainById, type AppChain } from "./chains";
import { TOKEN_ADDRESSES, TOKEN_DECIMALS, TOKENS } from "./tokens";

const EXPLORER_TIMEOUT_MILLISECONDS = 10_000;
// Arc's native USDC moves show up here too, as USDC transfers. So do savings vault shares.
const TOKEN_TRANSFER_TYPE = "ERC-20";

// App Kit's contracts on Arc. Swaps, savings, and loans all go through the adapter.
const KIT_ADAPTER = requireKitContract("adapter");
// Moves out of Arc go through App Kit's bridge contract, or straight to Circle's token messengers.
const BRIDGE_CONTRACTS = [
  requireKitContract("bridge"),
  ...Object.values(ARC.kit.cctp?.contracts ?? {}).flatMap((contracts) =>
    [contracts.tokenMessenger, contracts.tokenMessengerWithFees].flatMap((address) =>
      address ? [getAddress(address)] : [],
    ),
  ),
];

// Money minted into the account is told apart by the call that minted it. The explorer names the
// call when the contract is verified, and gives its selector when it isn't.
const UNIFIED_BALANCE_MINT_METHODS = ["gatewayMint", toFunctionSelector("gatewayMint(bytes,bytes)")];
const BRIDGE_MINT_METHODS = ["receiveMessage", toFunctionSelector("receiveMessage(bytes,bytes)")];

export const ACTIVITY_KINDS = [
  "money-added",
  "payment-sent",
  "swap",
  "savings-deposit",
  "savings-withdrawal",
  "borrow",
  "collateral-added",
  "loan-repaid",
  "loan-paid-off",
  "moved-into-arc",
  "moved-out-of-arc",
  "moved-to-cash",
  "moved-to-unified-balance",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const INCOMING_KINDS: readonly ActivityKind[] = [
  "money-added",
  "savings-withdrawal",
  "borrow",
  "moved-into-arc",
  "moved-to-cash",
];

// An amount of any token, in its base units.
export type TokenAmount = { symbol: string; decimals: number; value: bigint };

export type Activity = {
  id: string;
  kind: ActivityKind;
  amount: TokenAmount;
  // The other side of a swap, or a loan's collateral. Null when one token moved.
  otherAmount: TokenAmount | null;
  counterparty: Address;
  // A saved contact or a savings vault. Null for any other address.
  counterpartyName: string | null;
  // Only payments the business sent can have one.
  memo: string | null;
  transactionHash: Hash;
  // The chain the transaction ran on.
  chainId: number;
  // ISO time, so it passes from server to browser unchanged.
  time: string;
};

// Where an explorer's next page starts: after this transfer.
export type TransferCursor = { blockNumber: number; index: number };

// Where each chain's history goes on from. `after` is null to start from the newest. A chain left
// out has nothing older.
export type ActivityCursor = { chainId: number; after: TransferCursor | null }[];

export type ActivityPage = {
  activities: Activity[];
  nextCursor: ActivityCursor | null;
};

// One token moving to or from the account, in any token.
export type Transfer = {
  id: string;
  chainId: number;
  tokenAddress: Address;
  // Tokens anyone can create may not give either.
  symbol: string | null;
  decimals: string | null;
  from: Address;
  to: Address;
  value: bigint;
  transactionHash: Hash;
  // The function the transaction called, as the explorer names it.
  method: string | null;
  blockNumber: number;
  logIndex: number;
  time: string;
};

export type TransferPage = {
  transfers: Transfer[];
  nextCursor: TransferCursor | null;
};

// The account's transfers on Arc, and its Unified Balance deposits on other chains, newest first.
export type AccountTransfers = {
  transfers: Transfer[];
  deposits: Transfer[];
  nextCursor: ActivityCursor | null;
};

// An address the business knows by name.
export type NamedAddress = { address: Address; name: string };

// A savings vault. Its name is null when Earn couldn't say it.
export type VaultAddress = { address: Address; name: string | null };

export type CollateralToken = { address: Address; symbol: string; decimals: number };

export type KnownAddresses = {
  vaults: VaultAddress[];
  contacts: NamedAddress[];
  collateralTokens: CollateralToken[];
};

// A transfer of a token the app knows, from the account's side.
type Leg = {
  transfer: Transfer;
  isSent: boolean;
  counterparty: Address;
  amount: TokenAmount;
};

// The legs of one transaction, sorted by what moved.
type TransactionLegs = {
  cash: Leg[];
  collateral: Leg[];
  vault: VaultAddress | undefined;
};

// A page from each chain, newest first. A chain with more to read may still hold transfers newer
// than the oldest read on another, so those wait for a later page.
export async function readAccountTransfers(
  accountAddress: Address,
  cursor?: ActivityCursor,
): Promise<AccountTransfers> {
  const pages = await Promise.all(
    (cursor ?? APP_CHAINS.map((chain) => ({ chainId: chain.viem.id, after: null }))).map(
      async (chainCursor) => {
        const chain = requireChainById(chainCursor.chainId);
        const after = chainCursor.after ?? undefined;
        const page =
          chain === ARC
            ? await readTransfers(accountAddress, after)
            : await readSentUsdc(chain, accountAddress, after);
        return { chain, cursor: chainCursor, page };
      },
    ),
  );
  // ISO times in UTC sort as text.
  const cutoff = pages.reduce<string | null>((latest, { page }) => {
    const oldestRead = page.nextCursor ? page.transfers.at(-1)?.time : undefined;
    return oldestRead && (latest === null || oldestRead > latest) ? oldestRead : latest;
  }, null);
  const cut = pages.map(({ chain, cursor: chainCursor, page }) => ({
    chain,
    ...cutPage(chainCursor, page, cutoff),
  }));

  const nextCursor = cut.flatMap(({ next }) => (next ? [next] : []));
  return {
    transfers: cut.find(({ chain }) => chain === ARC)?.transfers ?? [],
    deposits: cut.flatMap(({ chain, transfers }) =>
      chain === ARC ? [] : transfers.filter((transfer) => isDeposit(chain, transfer)),
    ),
    nextCursor: nextCursor.length > 0 ? nextCursor : null,
  };
}

// Keeps the transfers no older than the cutoff. The next page starts after the last one kept.
function cutPage(
  { chainId, after }: ActivityCursor[number],
  page: TransferPage,
  cutoff: string | null,
) {
  const transfers =
    cutoff === null ? page.transfers : page.transfers.filter(({ time }) => time >= cutoff);
  if (transfers.length === page.transfers.length) {
    return { transfers, next: page.nextCursor && { chainId, after: page.nextCursor } };
  }
  const lastKept = transfers.at(-1);
  return { transfers, next: { chainId, after: lastKept ? toTransferCursor(lastKept) : after } };
}

// The account's Arc history, newest first. Only completed transfers exist onchain, so every entry
// is settled.
export async function readTransfers(
  accountAddress: Address,
  cursor?: TransferCursor,
): Promise<TransferPage> {
  let page = await readTransferPage(ARC, accountAddress, cursor);
  // A page holding one transaction may end partway through it, so read on until another starts.
  while (page.nextCursor && groupByTransaction(page.transfers).length < 2) {
    const next = await readTransferPage(ARC, accountAddress, page.nextCursor);
    page = { transfers: [...page.transfers, ...next.transfers], nextCursor: next.nextCursor };
  }
  return holdBackSplitTransaction(page);
}

// USDC the account sent on another chain. Only its Unified Balance deposits show as activity.
function readSentUsdc(chain: AppChain, accountAddress: Address, cursor?: TransferCursor) {
  return readTransferPage(chain, accountAddress, cursor, {
    filter: "from",
    token: chain.usdcAddress,
  });
}

// Each Unified Balance deposit becomes one entry. The deposit is one USDC transfer.
export function toDepositActivities(deposits: Transfer[]): Activity[] {
  return deposits.map((transfer) =>
    toActivity(
      {
        transfer,
        isSent: true,
        counterparty: transfer.to,
        amount: { symbol: "USDC", decimals: TOKEN_DECIMALS, value: transfer.value },
      },
      "moved-to-unified-balance",
    ),
  );
}

// Whether the explorer lists the transaction's transfers yet. It lags the chain by a few seconds.
export async function isTransactionListed(chainId: number, transactionHash: Hash) {
  const chain = requireChainById(chainId);
  const response = await fetchExplorer(
    new URL(`${chain.explorerApiUrl}/transactions/${transactionHash}/token-transfers`),
  );
  // The explorer answers 404 for a transaction it hasn't seen yet.
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Explorer answered ${response.status} for a transaction.`);
  }
  const body: unknown = await response.json();
  return isRecord(body) && Array.isArray(body.items) && body.items.length > 0;
}

function isDeposit(chain: AppChain, { tokenAddress, to }: Transfer) {
  return isAddressEqual(tokenAddress, chain.usdcAddress) && isAddressEqual(to, chain.gatewayWallet);
}

async function readTransferPage(
  chain: AppChain,
  accountAddress: Address,
  cursor?: TransferCursor,
  filters: Record<string, string> = {},
): Promise<TransferPage> {
  const url = new URL(
    `${chain.explorerApiUrl}/addresses/${accountAddress}/token-transfers`,
  );
  url.searchParams.set("type", TOKEN_TRANSFER_TYPE);
  for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
  if (cursor) {
    url.searchParams.set("block_number", String(cursor.blockNumber));
    url.searchParams.set("index", String(cursor.index));
  }

  const response = await fetchExplorer(url);
  if (!response.ok) {
    throw new Error(`${chain.label} explorer answered ${response.status} for account activity.`);
  }
  return parseTransferPage(await response.json(), chain.viem.id);
}

function fetchExplorer(url: URL) {
  return fetch(url, {
    signal: AbortSignal.timeout(EXPLORER_TIMEOUT_MILLISECONDS),
  }).catch((error: unknown) => {
    // A timeout throws a DOMException, whose message React can't rewrite when it passes the error on.
    throw new Error("Explorer didn't answer for account activity.", {
      cause: error,
    });
  });
}

// One entry per transaction, labelled by what moved. Tokens anyone can send unasked are left out.
export function toActivities(
  transfers: Transfer[],
  accountAddress: Address,
  known: KnownAddresses,
): Activity[] {
  return groupByTransaction(transfers).flatMap((transfersOfOne) =>
    toTransactionActivities(
      sortLegs(transfersOfOne, accountAddress, known),
      known.contacts,
    ),
  );
}

// A token other than USDC or EURC that moved through App Kit's adapter: a savings vault's shares
// or a loan's collateral. Tokens anyone sent unasked never pass through it, so they're left out.
export type KitToken = { address: Address; symbol: string | null; decimals: string | null };

export function findKitTokens(transfers: Transfer[], accountAddress: Address): KitToken[] {
  const tokens = new Map<Address, KitToken>();
  for (const transfersOfOne of groupByTransaction(transfers)) {
    const isThroughKit = transfersOfOne.every(({ from, to }) =>
      isAddressEqual(isAddressEqual(from, accountAddress) ? to : from, KIT_ADAPTER),
    );
    if (!isThroughKit) continue;
    for (const { tokenAddress, symbol, decimals } of transfersOfOne) {
      if (!isCashToken(tokenAddress)) tokens.set(tokenAddress, { address: tokenAddress, symbol, decimals });
    }
  }
  return [...tokens.values()];
}

export function isIncoming(kind: ActivityKind) {
  return INCOMING_KINDS.includes(kind);
}

export function isActivityCursor(value: unknown): value is ActivityCursor {
  return (
    Array.isArray(value) &&
    value.every(
      (chainCursor: unknown) =>
        isRecord(chainCursor) &&
        typeof chainCursor.chainId === "number" &&
        findChainById(chainCursor.chainId) !== undefined &&
        (chainCursor.after === null || isTransferCursor(chainCursor.after)),
    )
  );
}

function isTransferCursor(value: unknown): value is TransferCursor {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.blockNumber) &&
    Number.isSafeInteger(value.index)
  );
}

function toTransactionActivities(
  legs: TransactionLegs,
  contacts: NamedAddress[],
): Activity[] {
  const activity =
    toSavingsActivity(legs) ??
    toLoanActivity(legs) ??
    toKitActivity(legs) ??
    toMoveActivity(legs);
  if (activity) return [activity];
  return legs.cash.map((leg) =>
    toActivity(leg, leg.isSent ? "payment-sent" : "money-added", {
      counterpartyName: findNamed(contacts, leg.counterparty)?.name ?? null,
    }),
  );
}

function toSavingsActivity({ cash, vault }: TransactionLegs) {
  const [leg] = cash;
  if (!vault || cash.length !== 1) return null;
  return toActivity(leg, leg.isSent ? "savings-deposit" : "savings-withdrawal", {
    counterpartyName: vault.name,
  });
}

// Collateral going out with cash coming in is a borrow. Collateral coming back ends the loan.
function toLoanActivity({ cash, collateral }: TransactionLegs) {
  const [collateralLeg] = collateral;
  if (collateral.length !== 1) return null;
  const sent = cash.filter((leg) => leg.isSent);
  const received = cash.filter((leg) => !leg.isSent);

  if (collateralLeg.isSent && cash.length === 0) {
    return toActivity(collateralLeg, "collateral-added");
  }
  if (collateralLeg.isSent && sent.length === 0 && received.length === 1) {
    return toActivity(received[0], "borrow", { otherAmount: collateralLeg.amount });
  }
  // Paying off sends the most it could cost and gets the rest back.
  if (!collateralLeg.isSent && sent.length === 1 && received.length <= 1) {
    const change = received.at(0)?.amount.value ?? BigInt(0);
    const [payment] = sent;
    return toActivity(payment, "loan-paid-off", {
      amount: { ...payment.amount, value: payment.amount.value - change },
      otherAmount: collateralLeg.amount,
    });
  }
  return null;
}

// Swaps and loan changes without collateral go through App Kit's adapter as plain cash.
function toKitActivity({ cash, collateral }: TransactionLegs) {
  if (collateral.length > 0) return null;
  if (!cash.every((leg) => isAddressEqual(leg.counterparty, KIT_ADAPTER))) return null;
  const sent = cash.filter((leg) => leg.isSent);
  const received = cash.filter((leg) => !leg.isSent);

  if (sent.length === 1 && received.length === 1) {
    return toActivity(sent[0], "swap", { otherAmount: received[0].amount });
  }
  if (!isUsdcOnly(cash) || cash.length !== 1) return null;
  return toActivity(cash[0], cash[0].isSent ? "loan-repaid" : "borrow");
}

function toMoveActivity({ cash, collateral }: TransactionLegs) {
  const [leg] = cash;
  if (collateral.length > 0 || cash.length !== 1 || !isUsdcOnly(cash)) return null;
  const { counterparty, transfer } = leg;

  if (leg.isSent && BRIDGE_CONTRACTS.some((bridge) => isAddressEqual(counterparty, bridge))) {
    return toActivity(leg, "moved-out-of-arc");
  }
  if (leg.isSent && isAddressEqual(counterparty, ARC.gatewayWallet)) {
    return toActivity(leg, "moved-to-unified-balance");
  }
  if (leg.isSent || !isAddressEqual(counterparty, zeroAddress)) return null;
  if (transfer.method && UNIFIED_BALANCE_MINT_METHODS.includes(transfer.method)) {
    return toActivity(leg, "moved-to-cash");
  }
  if (transfer.method && BRIDGE_MINT_METHODS.includes(transfer.method)) {
    return toActivity(leg, "moved-into-arc");
  }
  return null;
}

function toActivity(
  { transfer, counterparty, amount }: Leg,
  kind: ActivityKind,
  overrides: Partial<Pick<Activity, "amount" | "otherAmount" | "counterpartyName">> = {},
): Activity {
  return {
    id: transfer.id,
    kind,
    amount,
    otherAmount: null,
    counterparty,
    counterpartyName: null,
    memo: null,
    transactionHash: transfer.transactionHash,
    chainId: transfer.chainId,
    time: transfer.time,
    ...overrides,
  };
}

function findCashToken(tokenAddress: Address) {
  return TOKENS.find((candidate) => isAddressEqual(TOKEN_ADDRESSES[candidate], tokenAddress));
}

function isCashToken(tokenAddress: Address) {
  return findCashToken(tokenAddress) !== undefined;
}

function isUsdcOnly(legs: Leg[]) {
  return legs.every(({ transfer }) =>
    isAddressEqual(transfer.tokenAddress, TOKEN_ADDRESSES.USDC),
  );
}

// The explorer lists a transaction's transfers next to each other.
function groupByTransaction(transfers: Transfer[]) {
  const groups: Transfer[][] = [];
  for (const transfer of transfers) {
    const group = groups.at(-1);
    if (group && group[0].transactionHash === transfer.transactionHash) {
      group.push(transfer);
    } else {
      groups.push([transfer]);
    }
  }
  return groups;
}

function sortLegs(
  transfers: Transfer[],
  accountAddress: Address,
  { vaults, collateralTokens }: KnownAddresses,
): TransactionLegs {
  const legs: TransactionLegs = { cash: [], collateral: [], vault: undefined };
  for (const transfer of transfers) {
    const vault = findNamed(vaults, transfer.tokenAddress);
    if (vault) {
      legs.vault = vault;
      continue;
    }
    const cashToken = findCashToken(transfer.tokenAddress);
    if (cashToken) {
      legs.cash.push(toLeg(transfer, accountAddress, { symbol: cashToken, decimals: TOKEN_DECIMALS }));
      continue;
    }
    const collateralToken = collateralTokens.find(({ address }) =>
      isAddressEqual(address, transfer.tokenAddress),
    );
    if (collateralToken) legs.collateral.push(toLeg(transfer, accountAddress, collateralToken));
  }
  return legs;
}

function toLeg(
  transfer: Transfer,
  accountAddress: Address,
  { symbol, decimals }: { symbol: string; decimals: number },
): Leg {
  if (transfer.decimals !== String(decimals)) {
    throw new Error(`Explorer sent ${symbol} with unexpected decimals.`);
  }
  const isSent = isAddressEqual(transfer.from, accountAddress);
  return {
    transfer,
    isSent,
    counterparty: isSent ? transfer.to : transfer.from,
    amount: { symbol, decimals, value: transfer.value },
  };
}

function findNamed<Named extends { address: Address }>(named: Named[], address: Address) {
  return named.find((candidate) => isAddressEqual(candidate.address, address));
}

function requireKitContract(name: "adapter" | "bridge") {
  const address = ARC.kit.kitContracts?.[name];
  if (!address) throw new Error(`App Kit has no ${name} contract on Arc.`);
  return getAddress(address);
}

// A transaction's transfers can run onto the next page. Hold its first part back so it's read whole.
function holdBackSplitTransaction(page: TransferPage): TransferPage {
  const last = page.transfers.at(-1);
  if (!page.nextCursor || !last) return page;
  const transfers = page.transfers.filter(
    ({ transactionHash }) => transactionHash !== last.transactionHash,
  );
  const lastKept = transfers.at(-1);
  // One transaction in all: `readTransfers` read on until another started, so it's whole.
  if (!lastKept) return page;
  return { transfers, nextCursor: toTransferCursor(lastKept) };
}

function toTransferCursor({ blockNumber, logIndex }: Transfer): TransferCursor {
  return { blockNumber, index: logIndex };
}

function parseTransferPage(body: unknown, chainId: number): TransferPage {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error("Explorer sent an activity page without items.");
  }
  return {
    transfers: body.items.map((item) => parseTransfer(item, chainId)),
    nextCursor: parseCursor(body.next_page_params),
  };
}

function parseTransfer(item: unknown, chainId: number): Transfer {
  if (!isRecord(item)) throw new Error("Explorer sent a malformed transfer.");
  const token = readRecord(item, "token");
  const total = readRecord(item, "total");
  const transactionHash = readString(item, "transaction_hash");
  if (!isHash(transactionHash)) {
    throw new Error("Explorer sent a malformed transaction hash.");
  }
  const time = new Date(readString(item, "timestamp"));
  if (Number.isNaN(time.getTime())) {
    throw new Error("Explorer sent a malformed transfer time.");
  }

  const logIndex = readInteger(item, "log_index");

  return {
    id: `${transactionHash}-${logIndex}`,
    chainId,
    tokenAddress: readAddress(token, "address_hash"),
    symbol: readOptionalString(token, "symbol"),
    decimals: readNullableString(total, "decimals"),
    from: readAddress(readRecord(item, "from"), "hash"),
    to: readAddress(readRecord(item, "to"), "hash"),
    value: BigInt(readString(total, "value")),
    transactionHash,
    method: readNullableString(item, "method"),
    blockNumber: readInteger(item, "block_number"),
    logIndex,
    time: time.toISOString(),
  };
}
function parseCursor(params: unknown): TransferCursor | null {
  if (params === null) return null;
  if (!isRecord(params)) throw new Error("Explorer sent a malformed page cursor.");
  return {
    blockNumber: readInteger(params, "block_number"),
    index: readInteger(params, "index"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`Explorer sent no ${key}.`);
  return value;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Explorer sent no ${key}.`);
  return value;
}

function readNullableString(record: Record<string, unknown>, key: string) {
  return record[key] === null ? null : readString(record, key);
}

// For fields the explorer leaves out for some tokens.
function readOptionalString(record: Record<string, unknown>, key: string) {
  return record[key] === undefined ? null : readNullableString(record, key);
}

function readInteger(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Explorer sent no ${key}.`);
  }
  return value;
}

function readAddress(record: Record<string, unknown>, key: string) {
  const value = readString(record, key);
  if (!isAddress(value, { strict: false })) {
    throw new Error(`Explorer sent a malformed ${key}.`);
  }
  return value;
}
