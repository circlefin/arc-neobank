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

import { Plus } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";
import { CONTACT_NAME_MAX_LENGTH } from "@/app/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addContact } from "./actions";

export function AddContactDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <Plus data-icon="inline-start" />
        Add contact
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <AddContactForm onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddContactForm({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const isInvalidAddress = address !== "" && !isAddress(address);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const problem = await addContact({ name, address });
      if (problem) {
        setError(problem);
        return;
      }
      toast.success("Contact saved", {
        description: `You can now pick ${name.trim()} when you send.`,
      });
      onComplete();
    } catch (caught) {
      console.error(caught);
      setError("We couldn't save the contact. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add contact</DialogTitle>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="contact-name">Name</FieldLabel>
        <Input
          id="contact-name"
          required
          autoComplete="off"
          placeholder="Acme Supplies"
          maxLength={CONTACT_NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => {
            setError(undefined);
            setName(event.target.value);
          }}
        />
      </Field>

      <Field data-invalid={isInvalidAddress}>
        <FieldLabel htmlFor="contact-address">Wallet address</FieldLabel>
        <Input
          id="contact-address"
          required
          autoComplete="off"
          placeholder="0x…"
          aria-invalid={isInvalidAddress}
          value={address}
          onChange={(event) => {
            setError(undefined);
            setAddress(event.target.value.trim());
          }}
        />
        {isInvalidAddress && (
          <FieldError>That isn&apos;t a valid wallet address.</FieldError>
        )}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || name.trim() === "" || !isAddress(address)}
      >
        {pending ? "Saving contact…" : "Save contact"}
      </Button>
    </form>
  );
}
