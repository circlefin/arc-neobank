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

import { InfoCircle } from "iconoir-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Stats({ children }: { children: React.ReactNode }) {
  return (
    <Card
      size="sm"
      className="grid auto-cols-fr grid-flow-col text-center"
    >
      {children}
    </Card>
  );
}

type StatProps = {
  label: string;
  value: string;
  valueClassName?: string;
  info?: string;
};

export function Stat({ label, value, valueClassName, info }: StatProps) {
  return (
    <div className="flex flex-col gap-1 px-2">
      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {label}
        {info && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-4"
                  aria-label={`About ${label.toLowerCase()}`}
                />
              }
            >
              <InfoCircle />
            </TooltipTrigger>
            <TooltipContent>{info}</TooltipContent>
          </Tooltip>
        )}
      </p>
      <p className={valueClassName ?? "text-base"}>{value}</p>
    </div>
  );
}
