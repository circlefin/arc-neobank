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

"use client";

import type { WebAuthnKey } from "@zerodev/webauthn-key";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import type { Address } from "viem";
import type { OperationReceipt } from "@/lib/app-kit/core";
import {
  createBusinessWallet,
  createOperatorWallet,
  type BusinessWallet,
} from "@/lib/app-kit/wallet";
import type { OperatorPermission } from "@/lib/business-account";
import { ARC, type AppChain } from "@/lib/chains";
import { reportError } from "@/lib/monitoring";
import { isInActivity } from "./transactions/actions";

// How often, and how long, to wait for activity to show a new transaction.
const LISTED_POLL_MILLISECONDS = 2_000;
const LISTED_WAIT_MILLISECONDS = 60_000;

const BusinessWalletContext = createContext<BusinessWallet | null>(null);

type BusinessWalletProviderProps = {
  passkey: WebAuthnKey;
  address: Address;
  children: React.ReactNode;
};

// One wallet per signed-in session. It signs nothing until an operation is confirmed.
export function BusinessWalletProvider({
  passkey,
  address,
  children,
}: BusinessWalletProviderProps) {
  // A refresh sends the passkey again as a new object, so key on its id.
  const passkeyId = passkey.authenticatorId;
  const wallet = useMemo(
    () => createBusinessWallet(passkey, address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [passkeyId, address],
  );
  return (
    <BusinessWalletContext value={wallet}>{children}</BusinessWalletContext>
  );
}

type OperatorWalletProviderProps = {
  address: Address;
  permission: OperatorPermission;
  ownerPasskey: WebAuthnKey;
  children: React.ReactNode;
};

// The Operator's wallet can only send payments within its permission.
export function OperatorWalletProvider({
  address,
  permission,
  ownerPasskey,
  children,
}: OperatorWalletProviderProps) {
  // A refresh sends the permission again as a new object, so key on what it's made of.
  const passkeyId = permission.passkey.authenticatorId;
  const wallet = useMemo(
    () => createOperatorWallet(address, permission, ownerPasskey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [passkeyId, address, permission.expiresAt, ownerPasskey.authenticatorId],
  );
  return (
    <BusinessWalletContext value={wallet}>{children}</BusinessWalletContext>
  );
}

export function useBusinessWallet() {
  const wallet = useContext(BusinessWalletContext);
  if (!wallet) throw new Error("useBusinessWallet needs a BusinessWalletProvider.");
  return wallet;
}

// Balances live onchain, so after an operation the page reads them again. Activity comes from an
// explorer that lags the chain, so given the operation's receipt, the page reads again once the
// explorer lists it.
export function useRefreshBalances() {
  const router = useRouter();
  return useCallback(
    (receipt?: OperationReceipt, chain: AppChain = ARC) => {
      router.refresh();
      if (!receipt) return;
      waitUntilInActivity(chain, receipt.transactionHash).then(
        (isListed) => isListed && router.refresh(),
        // Balances are already fresh. Only activity waits for the next visit.
        (caught: unknown) => reportError({ area: "activity refresh", error: caught }),
      );
    },
    [router],
  );
}

async function waitUntilInActivity(chain: AppChain, transactionHash: string) {
  const deadline = Date.now() + LISTED_WAIT_MILLISECONDS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LISTED_POLL_MILLISECONDS));
    if (await isInActivity(chain.viem.id, transactionHash)) return true;
  }
  return false;
}
