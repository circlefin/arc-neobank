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

import { requireEnv } from "./env";

// Server only: the URL carries the ZeroDev project ID. Each chain needs gas sponsorship in the
// ZeroDev dashboard.
export function zeroDevRpcUrl(chainId: number) {
  const projectId = requireEnv("ZERODEV_PROJECT_ID", process.env.ZERODEV_PROJECT_ID);
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}
