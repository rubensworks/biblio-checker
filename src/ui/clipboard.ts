/**
 * Copy both a rich text and a plain text representation to the clipboard.
 *
 * Mail clients that accept rich text keep the links clickable, while everything
 * else falls back to the plain text flavour.
 *
 * @param html The rich text flavour.
 * @param text The plain text flavour.
 * @returns Whether the copy succeeded.
 */
export async function copyRichText(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      // Keys are MIME types, which are not identifiers
      const flavours: Record<string, Blob> = {};
      flavours['text/html'] = new Blob([ html ], { type: 'text/html' });
      flavours['text/plain'] = new Blob([ text ], { type: 'text/plain' });
      await navigator.clipboard.write([ new ClipboardItem(flavours) ]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaSelection(text);
  }
}

/**
 * Copy plain text to the clipboard.
 *
 * @param text The text to copy.
 * @returns Whether the copy succeeded.
 */
export async function copyPlainText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaSelection(text);
  }
}

/**
 * Copy text without the asynchronous clipboard API, for browsers that block it.
 *
 * @param text The text to copy.
 * @returns Whether the copy succeeded.
 */
function copyViaSelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
