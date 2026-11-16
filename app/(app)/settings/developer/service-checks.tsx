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
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkServices } from "@/lib/health";

// The same checks as /api/health, with what each found. Secrets are removed from the details.
export async function ServiceChecks() {
  const statuses = await checkServices();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Checked from the server, at most every 30 seconds. Uptime monitors can
          ask <code>/api/health</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3 text-sm">
          {statuses.map(({ name, isUp, latencyMilliseconds, detail }) => (
            <li key={name} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-4">
                <span>{name}</span>
                <Badge variant={isUp ? "secondary" : "destructive"}>
                  {isUp ? "Up" : "Down"} · {latencyMilliseconds} ms
                </Badge>
              </div>
              {detail && (
                <p className="break-words text-xs text-muted-foreground">{detail}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
