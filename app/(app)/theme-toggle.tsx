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

import { HalfMoon, SunLight } from "iconoir-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DARK_THEME, LIGHT_THEME } from "../constants";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="rounded-full text-foreground/40 hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
      aria-label="Switch theme"
      onClick={() =>
        setTheme(resolvedTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME)
      }
    >
      <SunLight className="hidden dark:block" />
      <HalfMoon className="dark:hidden" />
    </Button>
  );
}
