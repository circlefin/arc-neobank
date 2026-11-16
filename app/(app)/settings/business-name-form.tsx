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

import { useState } from "react";
import { toast } from "sonner";
import { BUSINESS_NAME_MAX_LENGTH } from "@/app/constants";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateBusinessName } from "./actions";

export function BusinessNameForm({ savedName }: { savedName: string | null }) {
  const [name, setName] = useState(savedName ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const problem = await updateBusinessName(name);
      if (problem) {
        setError(problem);
        return;
      }
      toast.success("Business name saved");
    } catch (caught) {
      console.error(caught);
      setError("We couldn't save the name. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="business-name">Name</FieldLabel>
        <Input
          id="business-name"
          required
          autoComplete="organization"
          placeholder="Acme Inc"
          maxLength={BUSINESS_NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => {
            setError(undefined);
            setName(event.target.value);
          }}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="self-start"
        disabled={pending || name.trim() === "" || name.trim() === savedName}
      >
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
