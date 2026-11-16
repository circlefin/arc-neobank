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

// The one place errors leave the app for monitoring. Connect an error tracker, like Sentry or
// Datadog, here: the server, the browser, and every money flow report through it.

export type ErrorReport = {
  // What failed, like "swap" or "server render".
  area: string;
  error: unknown;
  // Plain details to search by. Never amounts tied to a person, keys, or session data.
  context?: Record<string, string>;
};

export function reportError({ area, error, context }: ErrorReport) {
  console.error(`[${area}]`, error, ...(context ? [context] : []));
}
