// Keeping a touch-opened context menu alive across the finger lift.
//
// ADR 0027 touch reconciliation: a long-press opens the context menu DURING the
// hold, while the finger is still down. When the finger lifts, the browser
// synthesises a compatibility mouse sequence (mousedown → mouseup → click) at
// the press point. Portaled to <body>, the MUI Menu backdrop sits under that
// point, so that synthesised mousedown/click immediately dismisses the
// just-opened menu (the "verify on a device" risk ADR 0027 flagged). The
// spec-compliant cure is to cancel the terminating `touchend`, which suppresses
// the whole compat-mouse sequence; we also swallow a stray backdrop
// mousedown/click in the capture phase as a belt-and-suspenders fallback for
// environments that synthesise the click without a cancelable touchend. The
// menu therefore survives the lift; a later, deliberate tap-away (a fresh touch
// sequence) still dismisses it.
//
// Extracted from `useInteractionManager` for I2/TCH-09: the canvas gesture
// machine is no longer the only long-press that opens a menu — the label
// hit-proxies own their own presses (ADR 0031 §4), so they hold their own timer
// and need the same lift suppression.

/**
 * Arm the one-shot suppression for the lift that is about to end a long press.
 *
 * Everything self-removes after the terminating event (or 700 ms as an outer
 * net), so it can never eat a real interaction.
 */
export const suppressLongPressGestureEnd = () => {
  let timer: ReturnType<typeof setTimeout>;
  const cleanup = () => {
    window.removeEventListener('touchend', onTouchEnd, true);
    window.removeEventListener('mousedown', onBackdropMouse, true);
    window.removeEventListener('click', onBackdropMouse, true);
    clearTimeout(timer);
  };
  const onTouchEnd = (ev: TouchEvent) => {
    // Cancel the compat-mouse sequence the lift would otherwise synthesise.
    if (ev.cancelable) ev.preventDefault();
    // I2/TCH-03: this IS the terminating lift the suppression exists for, so it
    // is over. Cancelling the touchend suppresses the whole compat sequence,
    // which means the `click` that `onBackdropMouse` waited on to clean up never
    // arrives — the capture listeners then stayed armed for the full 700 ms and
    // swallowed the user's deliberate tap-away, so a just-opened context menu
    // could not be dismissed for most of a second. Tear down as soon as this
    // lift is handled; the macrotask hop lets any compat events that DO still
    // fire (non-cancelable touchend) land inside the window first.
    setTimeout(cleanup, 0);
  };
  const onBackdropMouse = (ev: MouseEvent) => {
    if ((ev.target as HTMLElement | null)?.closest('.MuiBackdrop-root')) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    // The click is the last event of the sequence — clean up once it lands.
    if (ev.type === 'click') cleanup();
  };
  window.addEventListener('touchend', onTouchEnd, {
    capture: true,
    passive: false
  });
  window.addEventListener('mousedown', onBackdropMouse, true);
  window.addEventListener('click', onBackdropMouse, true);
  timer = setTimeout(cleanup, 700);
};
