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

import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import type { WebAuthnKey } from "@zerodev/webauthn-key";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import {
  createAccountClient,
  createBusinessAccount,
  createOperatorAccount,
  getChainClient,
  type OperatorPermission,
} from "@/lib/business-account";
import {
  APP_CHAINS,
  ARC,
  explorerTransactionUrl,
  requireChainById,
  type AppChain,
} from "@/lib/chains";
import type { OperationReceipt } from "./core";
import { KernelProvider, type KernelClient } from "./kernel-provider";

// The business account as App Kit sees it: an ordinary wallet, backed by the passkey.
export type BusinessWallet = {
  address: Address;
  adapter: ViemAdapter;
  // Runs a payment once per idempotency key. A retry after an earlier try went through gets that
  // try's receipt instead of paying again.
  runOnce<T>(
    idempotencyKey: string,
    operation: (wallet: BusinessWallet) => Promise<T>,
  ): Promise<T | OperationReceipt>;
};

type SentOperation = { chain: AppChain; hash: Hex };

// Browser only: every operation is signed with the passkey. Nothing is signed until one is sent.
export function createBusinessWallet(
  passkey: WebAuthnKey,
  address: Address,
): BusinessWallet {
  return createKernelWallet(address, async (chain) =>
    createAccountClient(
      await createBusinessAccount(passkey, address, chain.viem),
      chain.viem,
    ),
  );
}

// Browser only: the Operator's passkey pays within its permission, which exists on Arc only.
export function createOperatorWallet(
  address: Address,
  permission: OperatorPermission,
  ownerPasskey: WebAuthnKey,
): BusinessWallet {
  return createKernelWallet(address, async (chain) => {
    if (chain.viem.id !== ARC.viem.id) {
      throw new Error(`An Operator can't pay on ${chain.label}.`);
    }
    return createAccountClient(
      await createOperatorAccount(address, permission, ownerPasskey),
    );
  });
}

// The same wallet for any ZeroDev account client, one per chain. Tests use a key instead of a passkey.
export function createKernelWallet(
  address: Address,
  createClient: (chain: AppChain) => Promise<KernelClient>,
): BusinessWallet {
  const clients = new Map<number, Promise<KernelClient>>();
  // The operation each idempotency key's latest try sent.
  const sent = new Map<string, SentOperation>();

  function clientFor(chain: AppChain) {
    let client = clients.get(chain.viem.id);
    if (!client) {
      client = createClient(chain);
      clients.set(chain.viem.id, client);
    }
    return client;
  }

  function createAdapter(
    recordSend?: (chain: AppChain, send: () => Promise<Hex>) => Promise<Hex>,
  ) {
    const providers = new Map<number, KernelProvider>();

    function providerFor(chainId: number) {
      let provider = providers.get(chainId);
      if (!provider) {
        const chain = requireChainById(chainId);
        provider = new KernelProvider({
          chainId,
          address,
          publicClient: getChainClient(chain.viem),
          getKernelClient: () => clientFor(chain),
          recordSend: recordSend && ((send) => recordSend(chain, send)),
        });
        providers.set(chainId, provider);
      }
      return provider;
    }

    return new ViemAdapter(
      {
        getPublicClient: ({ chain }) => getChainClient(requireChainById(chain.id).viem),
        getWalletClient: ({ chain }) =>
          createWalletClient({
            account: { address, type: "json-rpc" },
            chain,
            transport: custom(providerFor(chain.id)),
          }),
      },
      {
        addressContext: "user-controlled",
        supportedChains: APP_CHAINS.map((chain) => chain.kit),
      },
    );
  }

  // The earlier try's receipt if it went through. Null if it reverted, so nothing moved.
  async function settle({ chain, hash }: SentOperation): Promise<OperationReceipt | null> {
    const client = await clientFor(chain);
    // Waits while the operation is still pending, so a retry can't overtake it.
    const { success, receipt } = await client.waitForUserOperationReceipt({ hash });
    if (!success) return null;
    return {
      transactionHash: receipt.transactionHash,
      explorerUrl: explorerTransactionUrl(chain, receipt.transactionHash),
    };
  }

  const wallet: BusinessWallet = {
    address,
    adapter: createAdapter(),
    async runOnce(idempotencyKey, operation) {
      const earlier = sent.get(idempotencyKey);
      if (earlier) {
        const receipt = await settle(earlier);
        if (receipt) return receipt;
        sent.delete(idempotencyKey);
      }

      let hasSent = false;
      const adapter = createAdapter(async (chain, send) => {
        // Each payment is one batched operation, so the latest one says whether it went through.
        if (hasSent) throw new Error("A payment sent a second operation, so a retry couldn't check it.");
        hasSent = true;
        const hash = await send();
        sent.set(idempotencyKey, { chain, hash });
        return hash;
      });
      return operation({ ...wallet, adapter });
    },
  };
  return wallet;
}
