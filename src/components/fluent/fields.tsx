"use client";

import { Button, Input, Select, Textarea } from "@fluentui/react-components";
import type { ComponentProps } from "react";

export function FButton(props: ComponentProps<typeof Button>) {
  return <Button {...props} />;
}

export function FInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} />;
}

export function FTextarea(props: ComponentProps<typeof Textarea>) {
  return <Textarea {...props} />;
}

export function FSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} />;
}
