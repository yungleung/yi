/**
 * The invisible pointer target that keeps one heading hovered while the pointer is in its marker
 * gutter.
 *
 * May import: nothing. Upholds: the target is fixed to the gutter, contains no text and changes no
 * line geometry, so hovering the visible level marker cannot make that marker disappear.
 */

export function headingHoverTarget(): HTMLSpanElement {
  const target = document.createElement('span');
  target.className = 'markdown-heading-hover-target';
  target.setAttribute('data-heading-hover-target', 'true');
  target.setAttribute('aria-hidden', 'true');
  return target;
}
