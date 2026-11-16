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
  getValidatorAddress as getPasskeyValidatorAddress,
  PasskeyValidatorContractVersion,
  toPasskeyValidator,
} from "@zerodev/passkey-validator";
import {
  toPermissionValidator,
  WEBAUTHN_SIGNER_CONTRACT_V0_0_4,
} from "@zerodev/permissions";
import {
  CallPolicyVersion,
  ParamCondition,
  toCallPolicy,
  toSignatureCallerPolicy,
  toSudoPolicy,
  toTimestampPolicy,
} from "@zerodev/permissions/policies";
import {
  toWebAuthnSigner,
  WebAuthnSignerVersion,
} from "@zerodev/permissions/signers";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  KernelV3AccountAbi,
  type CreateKernelAccountReturnType,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1, VALIDATOR_TYPE } from "@zerodev/sdk/constants";
import type { WebAuthnKey } from "@zerodev/webauthn-key";
import { cache } from "react";
import {
  concat,
  createPublicClient,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  http,
  pad,
  parseAbi,
  parseAbiParameters,
  slice,
  toFunctionSelector,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { arcTestnet } from "viem/chains";
import { recordUserOperationIncluded, recordUserOperationSent } from "./diagnostics";
import { TOKEN_ADDRESSES, type Token } from "./tokens";

export const ENTRY_POINT = getEntryPoint("0.7");
const PASSKEY_VALIDATOR_VERSION =
  PasskeyValidatorContractVersion.V0_0_3_PATCHED;

const PASSKEY_VALIDATOR_ADDRESS = getPasskeyValidatorAddress(
  ENTRY_POINT,
  KERNEL_V3_1,
  PASSKEY_VALIDATOR_VERSION,
);
// We deployed ZeroDev's WebAuthn signer to Arc Testnet ourselves, at its usual address.
const PERMISSION_PASSKEY_SIGNER_VERSION = WebAuthnSignerVersion.V0_0_4_PATCHED;
// Fixed so the app can find the backup passkey without knowing its key.
const BACKUP_PASSKEY_PERMISSION_ID = "0x00000001";

// ZeroDev's recovery action: swaps the key the passkey validator holds for the account.
const RECOVERY_ACTION_ABI = parseAbi([
  "function doRecovery(address validator, bytes data)",
]);
const RECOVERY_ACTION = {
  address: "0xe884C2868CC82c16177eC73a93f7D9E6F3A5DC6E",
  selector: toFunctionSelector(RECOVERY_ACTION_ABI[0]),
} as const;

const PASSKEY_STORAGE_ABI = parseAbi([
  "function webAuthnValidatorStorage(address account) view returns (uint256 pubKeyX, uint256 pubKeyY)",
  "function webAuthnSignerStorage(bytes32 id, address account) view returns (uint256 pubKeyX, uint256 pubKeyY)",
]);

// Bundler and paymaster calls go through our server, which holds the ZeroDev project id.
const ZERODEV_RPC_PATH = "/api/zerodev";

const arcClient = createPublicClient({ chain: arcTestnet, transport: http() });
const chainClients = new Map<number, PublicClient>([[arcTestnet.id, arcClient]]);

const MILLISECONDS_PER_SECOND = 1_000;

// The Operator's browser never holds the Owner's approval. Our server adds it to their first payment.
const APPROVAL_PLACEHOLDER = "0x";
// Kernel v3.1 reads the first byte of an operation's nonce as its validation mode.
const VALIDATION_MODE_SHIFT = BigInt(248);
const ENABLE_VALIDATION_MODE = BigInt(1);
// How Kernel v3.1 lays out the signature of an operation that turns a permission on.
const HOOK_ADDRESS_SIZE = 20;
const ENABLE_SIGNATURE_PARAMETERS = parseAbiParameters(
  "bytes validatorData, bytes hookData, bytes selectorData, bytes enableSig, bytes userOpSig",
);
const NEVER_INSTALLED_NONCE = 0;
const FIRST_VALIDATION_NONCE = 1;
const VALIDATOR_ID_SIZE = 20;
const NO_HOOK_DATA = "0x";

export type BusinessAccount = CreateKernelAccountReturnType<"0.7">;

// What an Operator's passkey may do with the account: pay up to a limit, in approved tokens, until a date.
export type OperatorPermission = {
  passkey: WebAuthnKey;
  paymentLimit: bigint;
  tokens: readonly Token[];
  expiresAt: string;
};

// The Owner's sign-off on a permission, with the passkey that gave it.
export type OperatorApproval = { signature: Hex; ownerPasskey: WebAuthnKey };

export function getChainClient(chain: Chain) {
  let client = chainClients.get(chain.id);
  if (!client) {
    client = createPublicClient({ chain, transport: http() });
    chainClients.set(chain.id, client);
  }
  return client;
}

// The same passkey gives the account the same address on every chain.
export async function createBusinessAccount(
  passkey: WebAuthnKey,
  address?: Address,
  chain: Chain = arcTestnet,
) {
  const client = getChainClient(chain);
  return createKernelAccount(client, {
    plugins: { sudo: await toBusinessPasskeyValidator(passkey, client) },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    address,
  });
}

export async function hasBackupPasskey(accountAddress: Address) {
  const code = await arcClient.getCode({ address: accountAddress });
  // An account that isn't onchain yet has no backup passkey.
  if (!code) return false;

  const { signer } = await arcClient.readContract({
    address: accountAddress,
    abi: KernelV3AccountAbi,
    functionName: "permissionConfig",
    args: [BACKUP_PASSKEY_PERMISSION_ID],
  });
  return signer === WEBAUTHN_SIGNER_CONTRACT_V0_0_4;
}

export async function readCashBalances(
  accountAddress: Address,
): Promise<Record<Token, bigint>> {
  const [USDC, EURC] = await Promise.all([
    readTokenBalance(accountAddress, "USDC"),
    readTokenBalance(accountAddress, "EURC"),
  ]);
  return { USDC, EURC };
}

// Cached so every card on a page shares one read.
export const getCashBalances = cache(readCashBalances);

export async function isBackupPasskeyFor(
  accountAddress: Address,
  backupPasskey: WebAuthnKey,
) {
  const [pubX, pubY] = await arcClient.readContract({
    address: WEBAUTHN_SIGNER_CONTRACT_V0_0_4,
    abi: PASSKEY_STORAGE_ABI,
    functionName: "webAuthnSignerStorage",
    // Kernel keys signer storage by the permission id, left-aligned in 32 bytes.
    args: [pad(BACKUP_PASSKEY_PERMISSION_ID, { dir: "right" }), accountAddress],
  });
  return pubX === backupPasskey.pubX && pubY === backupPasskey.pubY;
}

export async function readAccountPasskey(accountAddress: Address) {
  const [pubX, pubY] = await arcClient.readContract({
    address: PASSKEY_VALIDATOR_ADDRESS,
    abi: PASSKEY_STORAGE_ABI,
    functionName: "webAuthnValidatorStorage",
    args: [accountAddress],
  });
  return { pubX, pubY };
}

export async function addBackupPasskey(
  passkey: WebAuthnKey,
  accountAddress: Address,
  backupPasskey: WebAuthnKey,
) {
  const passkeyValidator = await toBusinessPasskeyValidator(passkey);
  const account = await createKernelAccount(arcClient, {
    plugins: {
      sudo: passkeyValidator,
      regular: await toBackupPasskeyValidator(backupPasskey),
      action: RECOVERY_ACTION,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    address: accountAddress,
  });
  // The backup passkey may only run a recovery, so it is added by recovering to the current passkey.
  await sendRecovery(account, await passkeyValidator.getEnableData());
}

export async function recoverAccount(
  accountAddress: Address,
  backupPasskey: WebAuthnKey,
  newPasskey: WebAuthnKey,
) {
  const account = await createKernelAccount(arcClient, {
    plugins: {
      regular: await toBackupPasskeyValidator(backupPasskey),
      action: RECOVERY_ACTION,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    address: accountAddress,
  });
  const newPasskeyValidator = await toBusinessPasskeyValidator(newPasskey);
  await sendRecovery(account, await newPasskeyValidator.getEnableData());
}

// The Owner's passkey signs off on the permission. It goes onchain with the Operator's first payment.
export async function approveOperator(
  passkey: WebAuthnKey,
  accountAddress: Address,
  operator: OperatorPermission,
) {
  const account = await createKernelAccount(arcClient, {
    plugins: {
      sudo: await toBusinessPasskeyValidator(passkey),
      regular: await toOperatorValidator(operator),
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    address: accountAddress,
  });
  return account.kernelPluginManager.getPluginEnableSignature(accountAddress);
}

// The business account as the Operator's passkey sees it. The permission goes onchain with its
// first payment, which our server fills in with the Owner's approval.
export async function createOperatorAccount(
  accountAddress: Address,
  operator: OperatorPermission,
  ownerPasskey: WebAuthnKey,
) {
  return createKernelAccount(arcClient, {
    plugins: {
      // Never signs. It only opens the account onchain if the Owner never has.
      sudo: await toBusinessPasskeyValidator(ownerPasskey),
      regular: await toOperatorValidator(operator),
      pluginEnableSignature: APPROVAL_PLACEHOLDER,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    address: accountAddress,
  });
}

// Whether the operation turns a permission on, which only an Operator's first payment does.
export function isPermissionEnabling(nonce: bigint) {
  return nonce >> VALIDATION_MODE_SHIFT === ENABLE_VALIDATION_MODE;
}

// Server only: swaps the Operator's placeholder for the Owner's approval. The Operator's passkey
// signed the operation without it, since the signature isn't part of what it signs.
export function addOperatorApproval(signature: Hex, approvalSignature: Hex) {
  const hook = slice(signature, 0, HOOK_ADDRESS_SIZE);
  const [validatorData, hookData, selectorData, , userOperationSignature] =
    decodeAbiParameters(ENABLE_SIGNATURE_PARAMETERS, slice(signature, HOOK_ADDRESS_SIZE));
  return concat([
    hook,
    encodeAbiParameters(ENABLE_SIGNATURE_PARAMETERS, [
      validatorData,
      hookData,
      selectorData,
      approvalSignature,
      userOperationSignature,
    ]),
  ]);
}

// Where an Operator's permission stands onchain. Kernel keeps the nonce a permission was installed
// at after it's removed, and an approval can never turn that permission on again.
export type OperatorPermissionState = "never installed" | "installed" | "removed";

export async function readOperatorPermissionState(
  accountAddress: Address,
  operator: OperatorPermission,
): Promise<OperatorPermissionState> {
  const code = await arcClient.getCode({ address: accountAddress });
  if (!code) return "never installed";

  const { nonce, hook } = await arcClient.readContract({
    address: accountAddress,
    abi: KernelV3AccountAbi,
    functionName: "validationConfig",
    args: [toValidationId(await toOperatorValidator(operator))],
  });
  if (hook !== zeroAddress) return "installed";
  return nonce === NEVER_INSTALLED_NONCE ? "never installed" : "removed";
}

// Leaves the permission removed onchain, which the Operator's own first payment can't undo. One
// never installed is installed and removed at once, which uses up the Owner's approval.
export async function revokeOperator(
  passkey: WebAuthnKey,
  accountAddress: Address,
  operator: OperatorPermission,
) {
  const calls = await toRevokeOperatorCalls(accountAddress, operator);
  if (calls.length === 0) return;

  const accountClient = createAccountClient(
    await createBusinessAccount(passkey, accountAddress),
  );
  const userOperationHash = await accountClient.sendUserOperation({ calls });
  recordUserOperationSent(accountClient.chain.id, userOperationHash);
  const { success, reason, receipt } = await accountClient.waitForUserOperationReceipt({
    hash: userOperationHash,
  });
  recordUserOperationIncluded(userOperationHash, {
    transactionHash: receipt.transactionHash,
    success,
    revertReason: reason ?? null,
  });
  // The Operator's first payment can land between the read above and this. Revoking again removes it.
  if (!success) throw new Error("Revoke transaction failed onchain.");
}

// The account's own calls that leave the permission removed. None if it already is.
export async function toRevokeOperatorCalls(
  accountAddress: Address,
  operator: OperatorPermission,
) {
  const state = await readOperatorPermissionState(accountAddress, operator);
  if (state === "removed") return [];

  const validator = await toOperatorValidator(operator);
  const validationId = toValidationId(validator);
  const permissionData = await validator.getEnableData(accountAddress);
  const remove = encodeFunctionData({
    abi: KernelV3AccountAbi,
    functionName: "uninstallValidation",
    args: [validationId, permissionData, NO_HOOK_DATA],
  });
  const calls =
    state === "installed"
      ? [remove]
      : [
          encodeFunctionData({
            abi: KernelV3AccountAbi,
            functionName: "installValidations",
            args: [
              [validationId],
              [{ nonce: await readValidationNonce(accountAddress), hook: zeroAddress }],
              [permissionData],
              [NO_HOOK_DATA],
            ],
          }),
          remove,
        ];
  return calls.map((data) => ({ to: accountAddress, data }));
}

// The nonce Kernel installs a new validation at. Opening the account sets it to 1.
async function readValidationNonce(accountAddress: Address) {
  const code = await arcClient.getCode({ address: accountAddress });
  if (!code) return FIRST_VALIDATION_NONCE;
  return arcClient.readContract({
    address: accountAddress,
    abi: KernelV3AccountAbi,
    functionName: "currentNonce",
  });
}

function toValidationId(validator: { getIdentifier(): Hex }) {
  return concat([
    VALIDATOR_TYPE.PERMISSION,
    pad(validator.getIdentifier(), { size: VALIDATOR_ID_SIZE, dir: "right" }),
  ]);
}

function readTokenBalance(accountAddress: Address, token: Token) {
  return arcClient.readContract({
    address: TOKEN_ADDRESSES[token],
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accountAddress],
  });
}

async function toBusinessPasskeyValidator(
  passkey: WebAuthnKey,
  client: PublicClient = arcClient,
) {
  return toPasskeyValidator(client, {
    webAuthnKey: passkey,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    validatorContractVersion: PASSKEY_VALIDATOR_VERSION,
  });
}

async function toBackupPasskeyValidator(backupPasskey: WebAuthnKey) {
  return toPermissionValidator(arcClient, {
    signer: await toWebAuthnSigner(arcClient, {
      webAuthnKey: backupPasskey,
      webAuthnSignerVersion: PERMISSION_PASSKEY_SIGNER_VERSION,
    }),
    policies: [
      // Kernel only lets this validator call the recovery action.
      toSudoPolicy({}),
      // No contract may accept a message it signs, or it could approve payments.
      toSignatureCallerPolicy({ allowedCallers: [] }),
    ],
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
    permissionId: BACKUP_PASSKEY_PERMISSION_ID,
  });
}

async function toOperatorValidator({
  passkey,
  paymentLimit,
  tokens,
  expiresAt,
}: OperatorPermission) {
  return toPermissionValidator(arcClient, {
    signer: await toWebAuthnSigner(arcClient, {
      webAuthnKey: passkey,
      webAuthnSignerVersion: PERMISSION_PASSKEY_SIGNER_VERSION,
    }),
    policies: [
      // Only transfers of approved tokens, each up to the limit. No other call, and no native value.
      toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_5,
        permissions: tokens.map((token) => ({
          target: TOKEN_ADDRESSES[token],
          abi: erc20Abi,
          functionName: "transfer" as const,
          args: [
            null,
            {
              condition: ParamCondition.LESS_THAN_OR_EQUAL,
              value: paymentLimit,
            },
          ] as const,
        })),
      }),
      toTimestampPolicy({
        validUntil: Math.floor(Date.parse(expiresAt) / MILLISECONDS_PER_SECOND),
      }),
      // No contract may accept a message it signs, or it could approve payments past the limit.
      toSignatureCallerPolicy({ allowedCallers: [] }),
    ],
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_V3_1,
  });
}

// Browser only: sends the account's operations on `chain`, with gas paid by ZeroDev's paymaster.
export function createAccountClient(
  account: BusinessAccount,
  chain: Chain = arcTestnet,
) {
  const zeroDevRpc = http(
    new URL(`${ZERODEV_RPC_PATH}?chainId=${chain.id}`, window.location.origin)
      .href,
  );
  const paymaster = createZeroDevPaymasterClient({
    chain,
    transport: zeroDevRpc,
  });
  return createKernelAccountClient({
    account,
    chain,
    client: getChainClient(chain),
    bundlerTransport: zeroDevRpc,
    paymaster: {
      getPaymasterData: (userOperation) =>
        paymaster.sponsorUserOperation({ userOperation }),
    },
  });
}

async function sendRecovery(account: BusinessAccount, passkeyData: Hex) {
  const accountClient = createAccountClient(account);
  const userOperationHash = await accountClient.sendUserOperation({
    callData: encodeFunctionData({
      abi: RECOVERY_ACTION_ABI,
      functionName: "doRecovery",
      args: [PASSKEY_VALIDATOR_ADDRESS, passkeyData],
    }),
  });
  recordUserOperationSent(accountClient.chain.id, userOperationHash);
  const { success, reason, receipt } = await accountClient.waitForUserOperationReceipt({
    hash: userOperationHash,
  });
  recordUserOperationIncluded(userOperationHash, {
    transactionHash: receipt.transactionHash,
    success,
    revertReason: reason ?? null,
  });
  if (!success) throw new Error("Recovery transaction failed onchain.");
}
