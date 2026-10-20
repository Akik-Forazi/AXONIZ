"use client";

import { WorkspaceShell } from "@/components/axoniz/workspace-shell";

export default function AXONIZLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
