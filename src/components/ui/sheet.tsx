import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = "bottom",
  title,
  tall = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "bottom" | "right";
  title: string;
  tall?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/70 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface text-fg shadow-border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden rounded-t-lg border-t border-accent/25 pb-[env(safe-area-inset-bottom)]",
          side === "right" &&
            "inset-y-0 right-0 h-full w-full max-w-md overflow-hidden border-l sm:max-w-sm",
          tall && side === "bottom" && "h-[90dvh]",
          className,
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        {...props}
      >
        <div className="mx-auto mt-2 h-px w-12 bg-accent/70" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
          <DialogPrimitive.Title className="font-display text-base font-semibold tracking-tight">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg">
            <X className="size-4" />
            <span className="sr-only">Fermer</span>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
