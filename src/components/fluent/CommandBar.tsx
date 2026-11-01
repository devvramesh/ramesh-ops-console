"use client";

import { Toolbar } from "@fluentui/react-components";
import type { ReactNode } from "react";

export function CommandBar({ children }: { children: ReactNode }) {
  return (
    <Toolbar size="small" className="rounded border border-neutral-200 bg-white px-2">
      {children}
    </Toolbar>
  );
}
