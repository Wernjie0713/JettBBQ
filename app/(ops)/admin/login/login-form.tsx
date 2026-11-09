"use client";

import { useActionState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { signIn, type SignInState } from "../auth-actions";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {
    error: initialError,
    email: "",
  });

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className="h-10" />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Sign in
      </Button>
    </form>
  );
}
