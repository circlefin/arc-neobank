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

import { startAuthentication } from "@simplewebauthn/browser";
import {
  toWebAuthnKey,
  WebAuthnMode,
  type WebAuthnKey,
} from "@zerodev/webauthn-key";
import { parsePasskeyPublicKey, toStoredPasskey } from "@/lib/stored-passkey";
import {
  rememberUnifiedBalanceSigner,
  UNIFIED_BALANCE_KEY_EXTENSION,
} from "./(app)/unified-balance-key";
import { BACKUP_PASSKEY_HEADER, PASSKEY_ID_HEADER } from "./constants";

const PASSKEY_SERVER_URL = "/api/passkeys";
// ZeroDev throws this when our server turns down a passkey.
const LOGIN_NOT_VERIFIED_MESSAGE = "Login not verified";

type SignalUnknownCredential = (options: {
  rpId: string;
  credentialId: string;
}) => Promise<void>;

// Shown next to the email in the browser's passkey list, so the two can be told apart.
type PasskeyRole = "main" | "backup";

export function createPasskey(email: string, role: PasskeyRole) {
  return toWebAuthnKey({
    passkeyName: `${email} (${role})`,
    passkeyServerUrl: PASSKEY_SERVER_URL,
    rpID: window.location.hostname,
    mode: WebAuthnMode.Register,
  });
}

export function requestPasskey() {
  return logIn();
}

export function confirmNewPasskey(newPasskey: WebAuthnKey) {
  return confirmPasskey(newPasskey.authenticatorId);
}

// Asks for this one passkey, and our server checks it still backs the account.
export function confirmPasskey(passkeyId: string) {
  return logIn({ [PASSKEY_ID_HEADER]: passkeyId });
}

export function requestBackupPasskey() {
  return logIn({ [BACKUP_PASSKEY_HEADER]: "true" });
}

// Tells the password manager to stop offering a dead passkey. Not every browser can yet.
export async function forgetPasskey(passkeyId: string) {
  if (!canSignalUnknownCredential(PublicKeyCredential)) return;
  await PublicKeyCredential.signalUnknownCredential({
    rpId: window.location.hostname,
    credentialId: passkeyId,
  });
}

// TypeScript's DOM types don't include the WebAuthn Signal API yet.
function canSignalUnknownCredential(
  api: typeof PublicKeyCredential,
): api is typeof PublicKeyCredential & {
  signalUnknownCredential: SignalUnknownCredential;
} {
  return "signalUnknownCredential" in api;
}

type LoginOptions = Parameters<typeof startAuthentication>[0];

type LoginResult = { verification?: { verified?: unknown }; pubkey?: unknown };

// ZeroDev's passkey login, which also asks the passkey for the Unified Balance key's secret. One
// prompt then covers both, so a first deposit needs no prompt of its own.
async function logIn(passkeyServerHeaders: Record<string, string> = {}): Promise<WebAuthnKey> {
  const rpID = window.location.hostname;
  const options = await postToPasskeyServer<LoginOptions>(
    "login/options",
    { rpID },
    passkeyServerHeaders,
  );
  // simplewebauthn hands the extensions to the browser, and its results back, as they are.
  const { clientExtensionResults, ...credential } = await startAuthentication({
    ...options,
    extensions: { ...options.extensions, ...UNIFIED_BALANCE_KEY_EXTENSION },
  });
  // The secret stays in the browser. The passkey server only checks the signature.
  const result = await postToPasskeyServer<LoginResult>(
    "login/verify",
    { cred: { ...credential, clientExtensionResults: {} }, rpID },
    passkeyServerHeaders,
  );
  if (result.verification?.verified !== true || typeof result.pubkey !== "string") {
    throw new Error(LOGIN_NOT_VERIFIED_MESSAGE);
  }
  rememberUnifiedBalanceSigner(credential.id, clientExtensionResults);
  return toStoredPasskey(credential.id, await parsePasskeyPublicKey(result.pubkey));
}

async function postToPasskeyServer<Body>(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Body> {
  const response = await fetch(`${PASSKEY_SERVER_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Passkey server answered ${response.status} for ${path}.`);
  }
  return response.json();
}

export function describePasskeyError(caught: unknown, otherwise: string) {
  // The browser throws this when the passkey prompt is cancelled or times out.
  if (caught instanceof Error && caught.name === "NotAllowedError") {
    return "Passkey wasn't confirmed. Try again.";
  }
  if (caught instanceof Error && caught.message === LOGIN_NOT_VERIFIED_MESSAGE) {
    return "That passkey can't be used for this account.";
  }
  return otherwise;
}
