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
  b64ToBytes,
  uint8ArrayToHexString,
  type WebAuthnKey,
} from "@zerodev/webauthn-key";
import { bytesToBigInt, isHex, keccak256 } from "viem";

export type PasskeyPublicKey = { pubX: bigint; pubY: bigint };

export function toStoredPasskey(
  authenticatorId: string,
  { pubX, pubY }: PasskeyPublicKey,
): WebAuthnKey {
  return {
    pubX,
    pubY,
    authenticatorId,
    authenticatorIdHash: keccak256(
      uint8ArrayToHexString(b64ToBytes(authenticatorId)),
    ),
    // ZeroDev doesn't use the rpID when signing.
    rpID: "",
  };
}

// Reads a passkey kept as its id and its public key in hex.
export function readStoredPasskey(
  passkeyId: unknown,
  publicX: unknown,
  publicY: unknown,
): WebAuthnKey | null {
  if (typeof passkeyId !== "string" || !isHex(publicX) || !isHex(publicY)) {
    return null;
  }
  return toStoredPasskey(passkeyId, {
    pubX: BigInt(publicX),
    pubY: BigInt(publicY),
  });
}

// Reads the public key a passkey server returns, in SPKI form and base64.
export async function parsePasskeyPublicKey(spkiBase64: string): Promise<PasskeyPublicKey> {
  const key = await crypto.subtle.importKey(
    "spki",
    new Uint8Array(b64ToBytes(spkiBase64)),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  // An uncompressed P-256 key is 0x04, then 32 bytes each of x and y.
  return {
    pubX: bytesToBigInt(rawKey.subarray(1, 33)),
    pubY: bytesToBigInt(rawKey.subarray(33)),
  };
}

export function isSamePublicKey(
  first: PasskeyPublicKey,
  second: PasskeyPublicKey,
) {
  return first.pubX === second.pubX && first.pubY === second.pubY;
}
