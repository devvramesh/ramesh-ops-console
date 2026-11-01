"use client";

import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import type { ReactNode } from "react";

export function Notice({ intent, title, children }: { intent: "error" | "warning" | "info"; title?: string; children: ReactNode }) {
  return (
    <MessageBar intent={intent}>
      <MessageBarBody>
        {title && <MessageBarTitle>{title}</MessageBarTitle>}
        {children}
      </MessageBarBody>
    </MessageBar>
  );
}
