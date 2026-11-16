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

import type { NextRequest } from "next/server";
import { BACKUP_PASSKEY_HEADER, PASSKEY_ID_HEADER } from "@/app/constants";
import {
  getSignedInUser,
  signInWithPasskey,
  type SignedInUser,
} from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { parsePasskeyPublicKey } from "@/lib/stored-passkey";

const ZERODEV_PROJECT_ID = requireEnv(
  "ZERODEV_PROJECT_ID",
  process.env.ZERODEV_PROJECT_ID,
);

const ZERODEV_PASSKEY_SERVER_URL = `https://passkeys.zerodev.app/api/v3/${ZERODEV_PROJECT_ID}`;

const PASSKEY_SERVER_PATHS = new Set([
  "register/options",
  "register/verify",
  "login/options",
  "login/verify",
]);

// ZeroDev smart accounts can only verify P-256 (ES256) passkeys.
const P256_ALGORITHM = -7;

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/passkeys/[...path]">,
) {
  const path = (await context.params).path.join("/");
  if (!PASSKEY_SERVER_PATHS.has(path)) {
    return new Response("Not found", { status: 404 });
  }

  const user = await getSignedInUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const origin = request.headers.get("origin");
  if (!origin) return new Response("Missing origin", { status: 400 });

  const requestBody = await request.text();
  // ZeroDev checks the passkey against the page's origin.
  const response = await fetch(`${ZERODEV_PASSKEY_SERVER_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: requestBody,
  });
  const body: unknown = await response.json();
  if (!response.ok) return Response.json(body, { status: response.status });

  if (path === "register/options") return Response.json(toRegisterOptions(body));
  const passkeyId = request.headers.get(PASSKEY_ID_HEADER);
  if (path === "login/options" && passkeyId) {
    return Response.json(allowOnlyPasskey(body, passkeyId));
  }
  if (
    path === "login/verify" &&
    !request.headers.has(BACKUP_PASSKEY_HEADER)
  ) {
    const signedIn = await signInWithVerifiedLogin(user, requestBody, body);
    // ZeroDev's client throws on this, so the page shows the passkey was wrong.
    if (!signedIn) return Response.json({ verification: { verified: false } });
  }
  return Response.json(body);
}

async function signInWithVerifiedLogin(
  user: SignedInUser,
  loginRequest: string,
  loginResult: unknown,
) {
  const request: unknown = JSON.parse(loginRequest);
  if (
    !isObject(request) ||
    !isObject(request.cred) ||
    typeof request.cred.id !== "string" ||
    !isObject(loginResult) ||
    !isObject(loginResult.verification) ||
    typeof loginResult.pubkey !== "string"
  ) {
    throw new Error("Unexpected passkey login from ZeroDev.");
  }
  if (loginResult.verification.verified !== true) return false;

  return signInWithPasskey(
    user,
    request.cred.id,
    await parsePasskeyPublicKey(loginResult.pubkey),
  );
}

function toRegisterOptions(registerOptions: unknown) {
  if (
    !isObject(registerOptions) ||
    !isObject(registerOptions.options) ||
    !Array.isArray(registerOptions.options.pubKeyCredParams)
  ) {
    throw new Error("Unexpected passkey registration options from ZeroDev.");
  }

  registerOptions.options.pubKeyCredParams =
    registerOptions.options.pubKeyCredParams.filter(
      (param: unknown) => isObject(param) && param.alg === P256_ALGORITHM,
    );
  // The Unified Balance key comes from the passkey's PRF. Security keys only offer it if asked now.
  const { extensions } = registerOptions.options;
  registerOptions.options.extensions = {
    ...(isObject(extensions) ? extensions : {}),
    prf: {},
  };
  return registerOptions;
}

function allowOnlyPasskey(loginOptions: unknown, passkeyId: string) {
  if (!isObject(loginOptions)) {
    throw new Error("Unexpected passkey login options from ZeroDev.");
  }

  loginOptions.allowCredentials = [{ id: passkeyId, type: "public-key" }];
  return loginOptions;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
