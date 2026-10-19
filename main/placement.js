// Pure: where to put the popup so it sits next to the cursor but fully inside the work area.
export function placeWindow(cursor, size, workArea) {
  let x = cursor.x + 8;
  let y = cursor.y + 8;
  x = Math.min(x, workArea.x + workArea.width - size.width);
  y = Math.min(y, workArea.y + workArea.height - size.height);
  x = Math.max(x, workArea.x);
  y = Math.max(y, workArea.y);
  return { x: Math.round(x), y: Math.round(y) };
}
