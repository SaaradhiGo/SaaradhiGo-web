import type { ReactNode } from 'react';

/** The plain text of a cell, for its hover title when it ends in an ellipsis (owner 24 Nov). */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode; title?: string } }).props;
    return props?.title ?? textOf(props?.children);
  }
  return '';
}
