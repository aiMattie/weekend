/** After an editor opened through typing: put the typed character into its input (React controlled inputs need the native setter). */
export function prefillInput(root: ParentNode | null, char: string | undefined, tries = 8): void {
  if (!root || !char) return;
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type=checkbox]), textarea");
  if (!el) {
    if (tries > 0) requestAnimationFrame(() => prefillInput(root, char, tries - 1));
    return;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, char);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  try { el.setSelectionRange(char.length, char.length); } catch { /* not supported for this input type */ }
}
