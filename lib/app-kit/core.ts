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

import { AppKit, isKitError } from "@circle-fin/app-kit";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import { formatUnits, parseUnits } from "viem";
import { ONRAMP_WIDGET_BASE_URL } from "@/app/constants";
import { getChainClient } from "@/lib/business-account";
import { APP_CHAINS, requireChainById } from "@/lib/chains";
import { BASIS_POINTS_PER_WHOLE } from "@/lib/format";
import { recordFailure } from "@/lib/diagnostics";
import { reportError } from "@/lib/monitoring";
import { TOKEN_DECIMALS } from "@/lib/tokens";
import { USER_REJECTED } from "./kernel-provider";

// No API key: the kits refuse one in the browser, and reads and quotes don't need it.
export const appKit = new AppKit({
  onramp: { widgetBaseUrl: ONRAMP_WIDGET_BASE_URL },
});

// For reads on the server, where there is no passkey. It can't sign or send anything.
export function createReadOnlyAdapter() {
  return new ViemAdapter(
    {
      getPublicClient: ({ chain }) => getChainClient(requireChainById(chain.id).viem),
      getWalletClient: () => {
        throw new Error("The read-only adapter can't sign.");
      },
    },
    {
      // Lets reads name the business account's address explicitly.
      addressContext: "developer-controlled",
      supportedChains: APP_CHAINS.map((chain) => chain.kit),
    },
  );
}

// App Kit takes and returns decimal strings. The app keeps base units.
export function toKitAmount(amount: bigint, decimals = TOKEN_DECIMALS) {
  return formatUnits(amount, decimals);
}

// App Kit leaves out an amount it couldn't work out. That's a failure, not zero.
export function requireKitAmount(amount: string | null | undefined, what: string) {
  if (amount === null || amount === undefined) throw new Error(`App Kit didn't return ${what}.`);
  return fromKitAmount(amount);
}

// A fee as App Kit quotes it: what it's called, the token it's in, and how much.
export type KitFee = { name: string; token: string; amount: string | null | undefined };

// A fee in another token can't be shown as one amount, so it's a failure rather than left out.
export function sumFeesInToken(fees: readonly KitFee[], token: string, quotedBy: string) {
  return fees.reduce((total, fee) => {
    if (fee.token !== token) {
      throw new Error(`${quotedBy} quoted ${fee.name} in ${fee.token}, not ${token}.`);
    }
    return total + requireKitAmount(fee.amount, fee.name);
  }, BigInt(0));
}

export function fromKitAmount(amount: string, decimals = TOKEN_DECIMALS) {
  // Fees can carry more decimals than a token; round them to what it can hold.
  const [whole, fraction = ""] = amount.split(".");
  return parseUnits(`${whole}.${fraction.slice(0, decimals)}`, decimals);
}

// App Kit gives rates and ratios as fractions, like 0.042. The app keeps basis points.
export function fromKitRatio(ratio: number) {
  return BigInt(Math.round(ratio * Number(BASIS_POINTS_PER_WHOLE)));
}

// What every completed operation returns, whichever kit ran it.
export type OperationReceipt = { transactionHash: string; explorerUrl?: string };

// A failed operation in words a finance operator acts on. The raw error stays in `detail`.
export type OperationError = { message: string; detail: string; canRetry: boolean };

// Carries an OperationError that was already described, like one returned by a server action.
export class OperationFailure extends Error {
  constructor(readonly failure: OperationError) {
    super(failure.message);
  }
}

export function describeOperationError(
  caught: unknown,
  otherwise: string,
): OperationError {
  if (caught instanceof OperationFailure) return caught.failure;
  const detail = describeDetail(caught);
  if (isRejected(caught)) {
    return { message: "Passkey wasn't confirmed. Nothing was sent.", detail, canRetry: true };
  }
  if (!isKitError(caught)) return { message: otherwise, detail, canRetry: true };
  // Quotes can come back for amounts too small to actually route.
  if (caught.name === "INPUT_UNSUPPORTED_ROUTE") {
    return { message: "There's no route for this amount right now. Try a larger amount.", detail, canRetry: false };
  }

  switch (caught.type) {
    case "BALANCE":
      return { message: "There isn't enough money available for this.", detail, canRetry: false };
    case "LIQUIDITY":
      return { message: "There isn't enough liquidity right now. Try a smaller amount.", detail, canRetry: false };
    case "INPUT":
      return { message: "Some details aren't valid. Check them and try again.", detail, canRetry: false };
    case "NETWORK":
    case "RPC":
    case "RATE_LIMIT":
    case "SERVICE":
      return { message: "We couldn't reach the network. Try again in a moment.", detail, canRetry: true };
    case "ONCHAIN":
      return { message: "The network turned this down, so no money moved.", detail, canRetry: true };
    default:
      return { message: otherwise, detail, canRetry: caught.recoverability !== "FATAL" };
  }
}

// Describes a failed operation for the user and reports it for monitoring. A dismissed passkey
// prompt, or an amount the balance or market can't cover, is an answer rather than a fault, so
// it isn't reported: quotes hit those on every keystroke.
export function failOperation(
  area: string,
  caught: unknown,
  otherwise: string,
): OperationError {
  if (!isRejected(caught) && !isExpectedRefusal(caught)) reportError({ area, error: caught });
  const described = describeOperationError(caught, otherwise);
  recordFailure(area, described.message, described.detail);
  return described;
}

const EXPECTED_REFUSALS: readonly string[] = ["BALANCE", "LIQUIDITY", "INPUT"];

function isExpectedRefusal(caught: unknown) {
  return isKitError(caught) && EXPECTED_REFUSALS.includes(caught.type);
}

const MAX_CAUSE_DEPTH = 6;

// App Kit wraps the wallet's error, so look through the causes for "user rejected".
function isRejected(caught: unknown) {
  return readCauses(caught).some(
    ({ code, name, message }) =>
      code === USER_REJECTED ||
      name === "NotAllowedError" ||
      /user rejected|wasn't confirmed/i.test(message ?? ""),
  );
}

// The useful reason is often a few causes down, like a paymaster's "no sponsoring policy".
function describeDetail(caught: unknown) {
  const lines = readCauses(caught).map(
    ({ name, code, message, details, text }) =>
      `${name ?? "Error"}${code !== undefined ? ` (${String(code)})` : ""}: ${details ?? message ?? text}`,
  );
  return [...new Set(lines)].join("\n");
}

type CauseFields = {
  name?: string;
  code?: unknown;
  message?: string;
  details?: string;
  text: string;
};

// The error and the causes under it, each read as plain fields.
function readCauses(caught: unknown) {
  const causes: CauseFields[] = [];
  let error = caught;
  while (error && causes.length < MAX_CAUSE_DEPTH) {
    if (typeof error !== "object") {
      causes.push({ text: String(error) });
      break;
    }
    causes.push({
      name: readString(error, "name"),
      code: "code" in error ? error.code : undefined,
      message: readString(error, "message"),
      details: readString(error, "details"),
      text: String(error),
    });
    error = "cause" in error ? error.cause : undefined;
  }
  return causes;
}

// Reads inherited fields too, like an Error's name.
function readString(error: object, field: string) {
  const value: unknown = Reflect.get(error, field);
  return typeof value === "string" ? value : undefined;
}
