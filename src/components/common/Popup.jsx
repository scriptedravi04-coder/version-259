import React, { forwardRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { backdropMotion, panelMotion, isSheetViewport, shouldCloseSheet } from "../../lib/motion";

// Session 37 — building blocks so every popup opens and closes the same way.
//
//   <Presence>{open && (
//     <PopupBackdrop className="fixed inset-0 bg-black/50 flex items-end sm:items-center" onClick={close}>
//       <PopupPanel kind="auto" below={640} onClose={close} className="...">…</PopupPanel>
//     </PopupBackdrop>
//   )}</Presence>
//
// kind: "sheet" (phone bottom sheet) · "modal" (centered popup) · "auto" (sheet under
// `below` px, popup above) · "drawer" (from the right) · "fade".
// A sheet with onClose can be dragged down by its top edge to close, like big apps.
// These only change how things move — what the popup shows and does stays in the screen.

// `propagate`: when a screen hides a popup that itself uses <Presence>, the inner one still
// plays its closing animation instead of vanishing.
export function Presence({ children, ...props }) {
  return <AnimatePresence propagate {...props}>{children}</AnimatePresence>;
}

export const PopupBackdrop = forwardRef(function PopupBackdrop({ children, ...props }, ref) {
  return (
    <motion.div ref={ref} {...backdropMotion} {...props}>
      {children}
    </motion.div>
  );
});

const POSITIONED = /(^|\s)(absolute|fixed|relative|sticky)(\s|$)/;

export const PopupPanel = forwardRef(function PopupPanel(
  { kind = "auto", below = 768, onClose, drag = true, as = "div", className = "", style, children, ...props },
  ref
) {
  // Decide once, so the popup leaves the same way it came in even if the window resizes.
  const [motionProps] = useState(() => panelMotion(kind, below));
  const [isSheet] = useState(() => kind === "sheet" || (kind === "auto" && isSheetViewport(below)));
  const controls = useDragControls();
  const canDrag = isSheet && drag && typeof onClose === "function";

  const Comp = as === "form" ? motion.form : motion.div;
  const needsPosition = canDrag && !POSITIONED.test(className) && !(style && style.position);

  return (
    <Comp
      ref={ref}
      {...motionProps}
      {...(canDrag
        ? {
            drag: "y",
            dragControls: controls,
            dragListener: false,
            dragConstraints: { top: 0, bottom: 0 },
            dragElastic: { top: 0, bottom: 0.7 },
            dragMomentum: false,
            onDragEnd: (_e, info) => { if (shouldCloseSheet(info)) onClose(); },
          }
        : {})}
      className={`${className}${needsPosition ? " relative" : ""}`}
      style={style}
      data-sheet={isSheet ? "1" : undefined}
      {...props}
    >
      {canDrag && (
        // Invisible grab strip along the top edge (leaves the corners free for back / close buttons).
        <div
          aria-hidden="true"
          data-testid="sheet-grip"
          onPointerDown={(e) => controls.start(e)}
          style={{ position: "absolute", top: 0, left: 56, right: 56, height: 26, touchAction: "none", cursor: "grab", zIndex: 2 }}
        />
      )}
      {children}
    </Comp>
  );
});
