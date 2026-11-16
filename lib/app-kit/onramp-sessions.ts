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

import { createAppServerKit } from "@circle-fin/app-kit/server";
import {
  ONRAMP_API_BASE_URL,
  ONRAMP_WIDGET_BASE_URL,
} from "@/app/constants";
import { requireEnv } from "@/lib/env";
import type { OnrampSessionRequest } from "./onramp";

// Server only. It holds the Circle API key.

const CIRCLE_API_KEY = requireEnv(
  "CIRCLE_API_KEY",
  process.env.CIRCLE_API_KEY,
);

const serverKit = createAppServerKit({
  onramp: {
    apiKey: CIRCLE_API_KEY,
    baseUrl: ONRAMP_API_BASE_URL,
    widgetBaseUrl: ONRAMP_WIDGET_BASE_URL,
  },
});

// The business account holds USDC on Arc, so that is all the widget offers.
const ARC_USDC = { pairs: [{ token: "USDC", chain: "arc" }] };

// Sessions are single use and short lived.
export function createOnrampSession({ userId, accountAddress }: OnrampSessionRequest) {
  return serverKit.onramp.createSession({
    appUserId: userId,
    destinationAddress: accountAddress,
    assets: ARC_USDC,
  });
}
