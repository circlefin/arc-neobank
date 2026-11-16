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

"use client";

import { Copy } from "iconoir-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COPIED_TOOLTIP_MILLISECONDS = 1500;

export function AccountAddress({ address }: { address: string }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(
      () => setCopied(false),
      COPIED_TOOLTIP_MILLISECONDS,
    );
    return () => clearTimeout(timeout);
  }, [copied]);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">Account address</p>
      <div className="flex items-center gap-1">
        <p className="min-w-0 font-mono break-all">{address}</p>
        <Tooltip open={hovered || copied} onOpenChange={setHovered}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy account address"
                onClick={copyAddress}
              />
            }
          >
            <Copy />
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
