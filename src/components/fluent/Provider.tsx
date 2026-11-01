"use client";

import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { ReactNode } from "react";

export function Provider({ children }: { children: ReactNode }) {
  return <FluentProvider theme={webLightTheme}>{children}</FluentProvider>;
}
