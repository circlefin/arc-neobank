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

import { Search } from "iconoir-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  ACTIVITY_KINDS,
  type Activity,
  type ActivityKind,
  type ActivityPage,
} from "@/lib/activity";
import { ACTIVITY_LABELS, ActivityList, formatAmount } from "../activity-list";
import { loadMoreActivity } from "./actions";
import { FiltersDialog } from "./filters-dialog";

export function ActivityFeed({ firstPage }: { firstPage: ActivityPage }) {
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<ActivityKind[]>([...ACTIVITY_KINDS]);

  if (firstPage.activities.length === 0 && !firstPage.nextCursor) {
    return (
      <Empty className="p-2">
        <EmptyDescription>No transactions yet</EmptyDescription>
      </Empty>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <InputGroup className="w-full sm:w-60">
          <InputGroupInput
            placeholder="Search…"
            aria-label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <FiltersDialog kinds={kinds} onKindsChange={setKinds} />
      </div>
      {/* New activity at the top shifts every page, so start paging over. */}
      <ActivityPages
        key={firstPage.activities[0]?.id}
        firstPage={firstPage}
        isShown={(activity) =>
          kinds.includes(activity.kind) && matchesSearch(activity, search)
        }
      />
    </>
  );
}

type ActivityPagesProps = {
  firstPage: ActivityPage;
  isShown: (activity: Activity) => boolean;
};

function ActivityPages({ firstPage, isShown }: ActivityPagesProps) {
  const [olderActivities, setOlderActivities] = useState<Activity[]>([]);
  const [nextCursor, setNextCursor] = useState(firstPage.nextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const shownActivities = [...firstPage.activities, ...olderActivities].filter(
    isShown,
  );

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const page = await loadMoreActivity(nextCursor);
      setOlderActivities((loaded) => [...loaded, ...page.activities]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      console.error("Failed to load more transactions", error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {shownActivities.length > 0 ? (
        <ActivityList activities={shownActivities} />
      ) : (
        <Empty className="p-2">
          <EmptyDescription>
            {nextCursor
              ? "No matching transactions yet. Load more to look further back."
              : "No matching transactions"}
          </EmptyDescription>
        </Empty>
      )}
      {loadFailed && (
        <p role="alert" className="text-sm text-destructive">
          We couldn&apos;t load more transactions. Try again.
        </p>
      )}
      {nextCursor && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="self-start"
          disabled={isLoading}
          onClick={loadMore}
        >
          {isLoading && <Spinner data-icon="inline-start" />}
          Load more
        </Button>
      )}
    </>
  );
}

function matchesSearch(activity: Activity, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    ACTIVITY_LABELS[activity.kind],
    activity.counterparty,
    activity.counterpartyName ?? "",
    activity.memo ?? "",
    formatAmount(activity.amount),
    activity.otherAmount ? formatAmount(activity.otherAmount) : "",
  ].some((text) => text.toLowerCase().includes(query));
}
