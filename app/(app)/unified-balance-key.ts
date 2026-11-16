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

import { b64ToBytes } from "@zerodev/webauthn-key";
import { bytesToHex, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { OperationFailure } from "@/lib/app-kit/core";

// Browser only. Unified Balance only accepts transfers signed by a plain key, never by a smart
// account. This key comes from the passkey each time it's needed, so only whoever holds the
// passkey can sign with it, and nothing stores it.

// Any other salt gets an unrelated secret from the same passkey.
const KEY_SALT = new TextEncoder().encode("arcbeat-neobank unified balance key");
const CHALLENGE_BYTES = 32;
// The key's address is public, so the browser keeps it to save a passkey prompt on each deposit.
const SIGNER_STORAGE_PREFIX = "unified-balance-signer:";

// Asks a passkey prompt for the key's secret too. Signing in asks, so deposits needn't.
export const UNIFIED_BALANCE_KEY_EXTENSION = { prf: { eval: { first: KEY_SALT } } };

// Asks for the passkey, so it's also the passkey confirmation for the move it signs.
export async function unlockUnifiedBalanceKey(passkeyId: string): Promise<Hex> {
  const credential = await navigator.credentials.get({
    publicKey: {
      // Nothing checks this assertion. Only the secret derived alongside it is used.
      challenge: crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES)),
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: new Uint8Array(b64ToBytes(passkeyId)) }],
      userVerification: "required",
      extensions: UNIFIED_BALANCE_KEY_EXTENSION,
    },
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("The browser returned no passkey.");
  }
  const key = rememberUnifiedBalanceSigner(passkeyId, credential.getClientExtensionResults());
  if (!key) {
    throw new OperationFailure({
      message: "This passkey can't sign for Unified Balance here. Try an up-to-date browser, or your phone.",
      detail: "The passkey returned no PRF result.",
      canRetry: false,
    });
  }
  return key;
}

// Keeps the key's address from a prompt that asked for its secret. Null when the browser or the
// passkey couldn't give the secret.
export function rememberUnifiedBalanceSigner(
  passkeyId: string,
  results: AuthenticationExtensionsClientOutputs,
): Hex | null {
  const secret = results.prf?.results?.first;
  if (!secret) return null;
  const key = bytesToHex(toBytes(secret));
  localStorage.setItem(signerStorageKey(passkeyId), privateKeyToAddress(key));
  return key;
}

// The address that signs for Unified Balance with this passkey.
export async function getUnifiedBalanceSigner(passkeyId: string): Promise<Address> {
  const stored = localStorage.getItem(signerStorageKey(passkeyId));
  if (stored !== null && isAddress(stored)) return stored;
  return privateKeyToAddress(await unlockUnifiedBalanceKey(passkeyId));
}

function signerStorageKey(passkeyId: string) {
  return `${SIGNER_STORAGE_PREFIX}${passkeyId}`;
}

function toBytes(source: BufferSource) {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
}
