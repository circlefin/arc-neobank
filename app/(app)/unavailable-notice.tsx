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

import { WarningTriangle } from "iconoir-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type UnavailableNoticeProps = {
  unavailable: string[];
  // There's EURC but no rate, so totals show each currency on its own.
  eurcUnconverted?: boolean;
};

// A figure that couldn't be read counts as zero, so say which ones are missing.
export function UnavailableNotice({ unavailable, eurcUnconverted = false }: UnavailableNoticeProps) {
  if (unavailable.length === 0 && !eurcUnconverted) return null;
  return (
    <Alert role="status" className="text-warning">
      <WarningTriangle />
      <AlertDescription>
        {unavailable.length > 0 && (
          <>
            We couldn&apos;t read {unavailable.join(", ")} just now, so it isn&apos;t
            in these totals.{" "}
          </>
        )}
        {eurcUnconverted && (
          <>
            We couldn&apos;t get the EURC to USDC rate just now, so your EURC is shown
            on its own instead of added to your dollar totals.{" "}
          </>
        )}
        Refresh to try again.
      </AlertDescription>
    </Alert>
  );
}
