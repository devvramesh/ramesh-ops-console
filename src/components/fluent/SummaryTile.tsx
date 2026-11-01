"use client";

import { Caption1, Card, Text } from "@fluentui/react-components";

export function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card appearance="filled-alternative" className="min-w-44">
      <Caption1 className="text-neutral-500">{label}</Caption1>
      <Text size={600} weight="semibold" className="block">
        {value}
      </Text>
      {hint && <Caption1 className="text-neutral-500">{hint}</Caption1>}
    </Card>
  );
}
