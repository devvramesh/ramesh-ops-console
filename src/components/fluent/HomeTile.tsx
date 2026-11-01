"use client";

import { Caption1, Card, Text } from "@fluentui/react-components";
import Link from "next/link";

export function HomeTile({ href, title, description, count }: { href: string; title: string; description: string; count: number }) {
  return (
    <Link href={href} className="no-underline">
      <Card appearance="filled-alternative" className="h-full">
        <div className="flex items-baseline justify-between gap-3">
          <Text weight="semibold">{title}</Text>
          <Text size={600} weight="semibold" className="text-neutral-600">
            {count}
          </Text>
        </div>
        <Caption1 className="text-neutral-500">{description}</Caption1>
      </Card>
    </Link>
  );
}
