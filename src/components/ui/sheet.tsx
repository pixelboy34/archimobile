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
  half = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "bottom" | "right";
  title: string;
  tall?: boolean;
  /** ~50dvh bottom sheet — keeps the model visible */
  half?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/55 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface/96 text-fg shadow-border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[min(46dvh,26rem)] overflow-hidden rounded-t-[1.25rem] border-t pb-[env(safe-area-inset-bottom)]",
          side === "right" &&
            "inset-y-0 right-0 h-full w-full max-w-md overflow-hidden border-l sm:max-w-sm",
          tall && side === "bottom" && !half && "max-h-[min(52dvh,30rem)]",
          half && side === "bottom" && "max-h-[min(40dvh,22rem)]",
          className,
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        {...props}
      >
        <div className="sheet-handle mx-auto mt-2.5" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
          <DialogPrimitive.Title className="font-display text-[15px] font-semibold tracking-tight">
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
