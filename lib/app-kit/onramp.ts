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

import type { OnrampSession } from "@circle-fin/app-kit";
import type { Address } from "viem";
import { ONRAMP_SESSION_PATH } from "@/app/constants";
import { appKit } from "./core";

// Browser only. Buying USDC with local currency, in Circle's embedded widget.

// Why the widget stopped before the USDC arrived.
export type OnrampStop =
  | "timed-out"
  | "canceled"
  | "unavailable-in-region"
  | "under-review"
  | "rejected"
  | "payment-failed"
  | "failed";

// The widget's codes. Any other code is a plain failure.
const STOPS: Partial<Record<string, OnrampStop>> = {
  SESSION_TIMEOUT: "timed-out",
  CANCELED_BY_CUSTOMER: "canceled",
  NO_PAYMENT_OPTIONS: "unavailable-in-region",
  CUSTOMER_PENDING_REVIEW: "under-review",
  CUSTOMER_REJECTED: "rejected",
  PAYMENT_PROVIDER_ERROR: "payment-failed",
};

export type OnrampSessionRequest = { userId: string; accountAddress: Address };

type OnrampEvents = {
  onReady: () => void;
  // `settles` is false when the USDC landed at once, so no settled event follows.
  onPaid: (settles: boolean) => void;
  onSettled: () => void;
  onStopped: (stop: OnrampStop) => void;
};

type MountOptions = OnrampEvents & {
  session: OnrampSession;
  container: HTMLElement;
  title: string;
};

// Our server mints the session. It only pays into the signed-in user's own account.
export function requestOnrampSession({ userId, accountAddress }: OnrampSessionRequest) {
  return appKit.onramp.fetchSession({
    url: ONRAMP_SESSION_PATH,
    body: { appUserId: userId, destinationAddress: accountAddress },
  });
}

export function mountOnramp({ session, container, title, ...events }: MountOptions) {
  return appKit.onramp.mountIframe({
    session,
    container,
    title,
    onInitializationSuccess: () => events.onReady(),
    onInitializationError: ({ code }) => events.onStopped(toStop(code)),
    onDepositNotCompleted: ({ code }) => events.onStopped(toStop(code)),
    onDepositSubmitted: ({ payload }) => events.onPaid(payload.settlementExpected !== false),
    onDepositSettled: () => events.onSettled(),
  });
}

function toStop(code: string): OnrampStop {
  return STOPS[code] ?? "failed";
}
