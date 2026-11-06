"use client";
import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "../lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 animate-pop-in overflow-hidden rounded-[16px] border bg-popover p-1.5 text-popover-foreground shadow-xl", className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn("flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-sm font-medium outline-none select-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4", destructive && "text-destructive data-[highlighted]:bg-destructive/10", className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />;
}
