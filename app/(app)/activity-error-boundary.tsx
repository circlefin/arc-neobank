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

import { WarningTriangle } from "iconoir-react";
import { catchError, type ErrorInfo } from "next/error";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function ActivityError({ title }: { title: string }, { retry }: ErrorInfo) {
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <WarningTriangle />
          <AlertTitle>We couldn&apos;t load your transactions</AlertTitle>
          <AlertDescription>Your money is safe. Try again.</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => retry()}
            >
              Try again
            </Button>
          </AlertAction>
        </Alert>
      </CardContent>
    </Card>
  );
}

// The activity comes from Arc's explorer, which can be down while the chain is fine.
export const ActivityErrorBoundary = catchError(ActivityError);
