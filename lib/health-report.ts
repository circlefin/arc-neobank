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
// What a health check found. `detail` is shown to signed-in developers, so secrets are removed first.
export type ServiceStatus = {
  name: string;
  isUp: boolean;
  latencyMilliseconds: number;
  detail: string | null;
};

// For anyone who asks, like an uptime monitor: up or down per service, and nothing else.
export function toPublicHealth(statuses: ServiceStatus[]) {
  return {
    status: statuses.every(({ isUp }) => isUp) ? "ok" : "degraded",
    services: Object.fromEntries(statuses.map(({ name, isUp }) => [name, isUp ? "up" : "down"])),
  };
}

// Error text can carry a URL with a key in it, like ZeroDev's project ID. Each secret becomes a mark.
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]) {
  return secrets.reduce<string>(
    (redacted, secret) => (secret ? redacted.replaceAll(secret, "[redacted]") : redacted),
    text,
  );
}
