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
  UserOperationReceiptNotFoundError,
  type UserOperationReceipt,
} from "viem/account-abstraction";
import {
  isAddressEqual,
  isHex,
  numberToHex,
  type Address,
  type EIP1193Parameters,
  type Hex,
  type PublicRpcSchema,
  type RpcTransactionRequest,
  type TypedDataDefinition,
  type WalletRpcSchema,
} from "viem";
import type { BusinessAccount } from "@/lib/business-account";
import { recordUserOperationIncluded, recordUserOperationSent } from "@/lib/diagnostics";

// The parts of a UserOperation's receipt this provider reads.
type OperationReceipt = Pick<UserOperationReceipt, "success" | "reason"> & {
  receipt: Pick<
    UserOperationReceipt["receipt"],
    "transactionHash" | "blockHash" | "blockNumber" | "gasUsed" | "logs"
  >;
};

// The slice of a ZeroDev account client this provider needs.
export type KernelClient = {
  account: Pick<BusinessAccount, "isDeployed" | "signMessage" | "signTypedData">;
  sendUserOperation(args: {
    calls: { to: Address; data: Hex; value: bigint }[];
  }): Promise<Hex>;
  waitForUserOperationReceipt(args: { hash: Hex }): Promise<OperationReceipt>;
  getUserOperationReceipt(args: { hash: Hex }): Promise<OperationReceipt>;
};

type KernelProviderOptions = {
  chainId: number;
  address: Address;
  getKernelClient: () => Promise<KernelClient>;
  publicClient: { request(request: EIP1193Parameters<PublicRpcSchema>): Promise<unknown> };
  // Wraps sending each operation App Kit asks for, so a keyed wallet can record it.
  recordSend?: (send: () => Promise<Hex>) => Promise<Hex>;
};

// What App Kit's Viem adapter can ask of a wallet: wallet calls, and reads it expects the wallet to pass on.
type ProviderRequest =
  | EIP1193Parameters<WalletRpcSchema>
  | EIP1193Parameters<PublicRpcSchema>;

type RpcCall = Pick<RpcTransactionRequest, "data" | "value"> & { to?: Address | null };

// Typed data as it arrives in JSON, before viem checks it against its types.
type JsonTypedData = TypedDataDefinition<Record<string, unknown>, string>;

// EIP-1193 and EIP-5792 error codes.
export const USER_REJECTED = 4001;
export const UNAUTHORIZED = 4100;
export const UNSUPPORTED_METHOD = 4200;
export const UNRECOGNIZED_CHAIN = 4902;
const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
// EIP-5792 status codes for wallet_getCallsStatus.
const CALLS_PENDING = 100;
const CALLS_CONFIRMED = 200;
const CALLS_REVERTED = 500;

export class ProviderRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRpcError";
  }
}

// Answers the wallet calls App Kit's Viem adapter makes, with UserOperations from the business
// account. One provider per chain: the adapter only switches chains in the browser, so a shared
// provider could send an operation to the wrong chain.
export class KernelProvider {
  private deployment: Promise<void> | undefined;

  constructor(private readonly options: KernelProviderOptions) {}

  async request(request: ProviderRequest) {
    try {
      return await this.dispatch(request);
    } catch (caught) {
      throw toProviderError(caught);
    }
  }

  private async dispatch(request: ProviderRequest) {
    const { address, chainId } = this.options;

    switch (request.method) {
      case "eth_chainId":
        return numberToHex(chainId);

      case "eth_accounts":
      case "eth_requestAccounts":
        return [address];

      case "wallet_switchEthereumChain": {
        const [{ chainId: requested }] = request.params;
        if (Number(requested) !== chainId) {
          throw new ProviderRpcError(UNRECOGNIZED_CHAIN, "Wrong chain.");
        }
        return null;
      }

      case "eth_sendTransaction": {
        const [transaction] = request.params;
        this.assertSender(transaction.from);
        // Gas, fee, and nonce fields are for plain wallets. The bundler sets the operation's own.
        return this.confirm(await this.send([transaction]));
      }

      case "wallet_sendCalls": {
        const [batch] = request.params ?? [];
        if (!batch) throw new ProviderRpcError(INVALID_PARAMS, "No calls to send.");
        this.assertSender(batch.from);
        if (batch.chainId && Number(batch.chainId) !== chainId) {
          throw new ProviderRpcError(UNRECOGNIZED_CHAIN, "Wrong chain.");
        }
        // One UserOperation runs every call or none, so a batch needs one passkey prompt.
        return { id: await this.send(batch.calls) };
      }

      case "wallet_getCallsStatus": {
        const [id] = request.params ?? [];
        if (!id) throw new ProviderRpcError(INVALID_PARAMS, "No calls id.");
        return this.callsStatus(requireHex(id));
      }

      case "wallet_getCapabilities":
        return {
          [numberToHex(chainId)]: {
            atomic: { status: "supported" },
            paymasterService: { supported: true },
          },
        };

      case "eth_signTypedData_v4": {
        const [signer, typedData] = request.params;
        this.assertSender(signer);
        await this.deployBeforeSigning();
        const client = await this.options.getKernelClient();
        return client.account.signTypedData(parseTypedData(typedData));
      }

      case "personal_sign": {
        const [message, signer] = request.params;
        this.assertSender(signer);
        await this.deployBeforeSigning();
        const client = await this.options.getKernelClient();
        return client.account.signMessage({ message: { raw: message } });
      }

      case "eth_sign":
      case "eth_signTransaction":
      case "eth_sendRawTransaction":
      case "eth_sendRawTransactionSync":
      case "eth_syncing":
      case "wallet_addEthereumChain":
      case "wallet_addSubAccount":
      case "wallet_connect":
      case "wallet_disconnect":
      case "wallet_getAssets":
      case "wallet_getPermissions":
      case "wallet_grantPermissions":
      case "wallet_requestPermissions":
      case "wallet_revokePermissions":
      case "wallet_sendTransaction":
      case "wallet_showCallsStatus":
      case "wallet_watchAsset":
        throw new ProviderRpcError(UNSUPPORTED_METHOD, `${request.method} is not supported.`);

      default:
        // Reads go straight to the chain.
        return this.options.publicClient.request(request);
    }
  }

  private async send(calls: readonly RpcCall[]) {
    const client = await this.options.getKernelClient();
    const send = () => this.sendRecorded(client, calls.map(toCall));
    return this.options.recordSend ? this.options.recordSend(send) : send();
  }

  private async sendRecorded(client: KernelClient, calls: ReturnType<typeof toCall>[]) {
    const hash = await client.sendUserOperation({ calls });
    recordUserOperationSent(this.options.chainId, hash);
    return hash;
  }

  private async confirm(hash: Hex) {
    const client = await this.options.getKernelClient();
    const { success, reason, receipt } = await client.waitForUserOperationReceipt({
      hash,
    });
    recordIncluded(hash, { success, reason, receipt });
    // The bundle transaction succeeds even when the account's own call reverts, so App Kit
    // would read a failed payment as sent without this check.
    if (!success) {
      throw new ProviderRpcError(
        INTERNAL_ERROR,
        `execution reverted${reason ? `: ${reason}` : ""}`,
      );
    }
    return receipt.transactionHash;
  }

  private async callsStatus(id: Hex) {
    const status = {
      version: "2.0.0",
      id,
      chainId: numberToHex(this.options.chainId),
      atomic: true,
    };
    const operation = await this.readOperation(id);
    if (!operation) return { ...status, status: CALLS_PENDING };
    recordIncluded(id, operation);

    const { receipt } = operation;
    return {
      ...status,
      status: operation.success ? CALLS_CONFIRMED : CALLS_REVERTED,
      receipts: [
        {
          logs: receipt.logs.map(({ address, data, topics }) => ({ address, data, topics })),
          // The account's outcome, not the bundle transaction's.
          status: operation.success ? "0x1" : "0x0",
          blockHash: receipt.blockHash,
          blockNumber: numberToHex(receipt.blockNumber),
          gasUsed: numberToHex(receipt.gasUsed),
          transactionHash: receipt.transactionHash,
        },
      ],
    };
  }

  // Null until the operation is in a block.
  private async readOperation(hash: Hex) {
    const client = await this.options.getKernelClient();
    try {
      return await client.getUserOperationReceipt({ hash });
    } catch (caught) {
      if (caught instanceof UserOperationReceiptNotFoundError) return null;
      throw caught;
    }
  }

  // An account not yet onchain signs in a wrapped format that USDC permits reject.
  private deployBeforeSigning() {
    this.deployment ??= (async () => {
      const client = await this.options.getKernelClient();
      if (await client.account.isDeployed()) return;
      // Not a payment, so it skips the keyed wallet's record.
      const calls = [toCall({ to: this.options.address, data: "0x" })];
      await this.confirm(await this.sendRecorded(client, calls));
    })().catch((caught) => {
      this.deployment = undefined;
      throw caught;
    });
    return this.deployment;
  }

  private assertSender(sender: Address | undefined) {
    if (sender && !isAddressEqual(sender, this.options.address)) {
      throw new ProviderRpcError(UNAUTHORIZED, "Not this account.");
    }
  }
}

function recordIncluded(hash: Hex, { success, reason, receipt }: OperationReceipt) {
  recordUserOperationIncluded(hash, {
    transactionHash: receipt.transactionHash,
    success,
    revertReason: reason ?? null,
  });
}

function toCall({ to, data, value }: RpcCall) {
  if (!to) throw new ProviderRpcError(UNSUPPORTED_METHOD, "Deploying contracts is not supported.");
  return { to, data: data ?? "0x", value: value ? BigInt(value) : BigInt(0) };
}

function requireHex(value: string): Hex {
  if (!isHex(value)) throw new ProviderRpcError(INVALID_PARAMS, `Not a hex value: ${value}`);
  return value;
}

// App Kit sends typed data as JSON. viem builds the domain type itself, so it's left out.
function parseTypedData(json: string): JsonTypedData {
  const parsed: unknown = JSON.parse(json);
  if (!isTypedData(parsed)) throw new ProviderRpcError(INVALID_PARAMS, "Typed data isn't valid.");
  const types = Object.entries(parsed.types).filter(([name]) => name !== "EIP712Domain");
  return { ...parsed, types: Object.fromEntries(types) };
}

function isTypedData(value: unknown): value is JsonTypedData {
  return (
    isObject(value) &&
    isObject(value.types) &&
    typeof value.primaryType === "string" &&
    isObject(value.message)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// A dismissed passkey prompt becomes EIP-1193's "user rejected", which App Kit reports as such.
function toProviderError(caught: unknown) {
  if (caught instanceof ProviderRpcError) return caught;
  if (!(caught instanceof Error)) return new ProviderRpcError(INTERNAL_ERROR, String(caught));
  if (caught.name === "NotAllowedError") {
    return new ProviderRpcError(USER_REJECTED, "Passkey wasn't confirmed.");
  }
  const code = "code" in caught && typeof caught.code === "number" ? caught.code : INTERNAL_ERROR;
  return new ProviderRpcError(code, caught.message);
}
