"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogContent({
  className,
  children,
  side = "right",
  ...props
}: DialogPrimitive.Popup.Props & { side?: "right" | "left" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      {/* A sheet that slides in from the screen edge, and back out the same way on close. */}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-side={side}
        className={cn(
          "group/dialog fixed inset-y-2.5 z-50 flex w-[calc(100%-1.25rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 text-foreground shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)] ring-1 ring-foreground/5 backdrop-blur-xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-foreground/20 before:to-transparent motion-reduce:transition-none",
          // Floats off the screen edges, and slides a little past its own width so the
          // shadow is gone too when it is closed.
          side === "right"
            ? "right-2.5 data-ending-style:translate-x-[calc(100%+1.5rem)] data-starting-style:translate-x-[calc(100%+1.5rem)]"
            : "left-2.5 data-ending-style:-translate-x-[calc(100%+1.5rem)] data-starting-style:-translate-x-[calc(100%+1.5rem)]",
          className
        )}
        {...props}
      >
        {children}
        {/* Close sits on the sheet's inner edge — top-left for a right-hand sheet. */}
        <DialogPrimitive.Close
          title="Close (Esc)"
          className="absolute top-4 flex size-9 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-muted-foreground shadow-xs transition-all duration-150 outline-none group-data-[side=left]/dialog:right-4 group-data-[side=right]/dialog:left-4 hover:scale-105 hover:border-foreground/25 hover:bg-muted hover:text-foreground active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-none flex-col gap-1 border-b border-border/80 bg-card/45 px-6 py-4 backdrop-blur-md group-data-[side=left]/dialog:pr-16 group-data-[side=right]/dialog:pl-16",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription }
