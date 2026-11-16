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

import { FilterList } from "iconoir-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/activity";
import { ACTIVITY_LABELS } from "../activity-list";

type FiltersDialogProps = {
  kinds: ActivityKind[];
  onKindsChange: (kinds: ActivityKind[]) => void;
};

export function FiltersDialog({ kinds, onKindsChange }: FiltersDialogProps) {
  const anchor = useComboboxAnchor();
  // Edited here, and only shown in the list once applied.
  const [draftKinds, setDraftKinds] = useState(kinds);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setDraftKinds(kinds);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <FilterList data-icon="inline-start" />
        Filters
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Filter transactions</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="transaction-types">Transaction type</FieldLabel>
          <Combobox
            multiple
            items={ACTIVITY_KINDS}
            value={draftKinds}
            onValueChange={setDraftKinds}
            itemToStringLabel={(kind: ActivityKind) => ACTIVITY_LABELS[kind]}
          >
            <ComboboxChips ref={anchor}>
              <ComboboxValue>
                {draftKinds.map((kind) => (
                  <ComboboxChip key={kind}>{ACTIVITY_LABELS[kind]}</ComboboxChip>
                ))}
              </ComboboxValue>
              <ComboboxChipsInput id="transaction-types" />
            </ComboboxChips>
            <ComboboxContent anchor={anchor}>
              <ComboboxEmpty>No matching type.</ComboboxEmpty>
              <ComboboxList>
                {(kind: ActivityKind) => (
                  <ComboboxItem key={kind} value={kind}>
                    {ACTIVITY_LABELS[kind]}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        <div className="flex gap-2">
          <DialogClose
            render={<Button type="button" className="flex-1" />}
            onClick={() => onKindsChange(draftKinds)}
          >
            Apply filters
          </DialogClose>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraftKinds([...ACTIVITY_KINDS])}
          >
            Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
