// Flickr / bumagaz-style justified layout.
//
// Given a list of items with known aspect ratios and a container
// width, computes rows of tiles where every tile in a row has the
// same height, tile widths are proportional to their aspect ratios,
// and the row's total width fills the container exactly.
//
// The last row is capped so a single trailing photo doesn't blow up
// to full width (which looks broken).
//
// Aspects must be known up front. Public gallery pulls them from a
// JSON generated at build time by scripts/measure-photos.mjs; client
// gallery pulls them from Drive's imageMediaMetadata. Either way,
// there's no reflow after the initial render.

export interface JustifyItem {
  id: string;
  aspect: number;
}

export interface LaidOutTile {
  id: string;
  width: number;
}

export interface LaidOutRow {
  height: number;
  items: LaidOutTile[];
}

export function justifyLayout(
  items: JustifyItem[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): LaidOutRow[] {
  if (containerWidth <= 0 || items.length === 0) return [];
  const rows: LaidOutRow[] = [];
  let current: JustifyItem[] = [];

  const rawWidthOf = (row: JustifyItem[]) =>
    row.reduce((s, i) => s + i.aspect * targetRowHeight, 0);

  const flush = (isLast: boolean) => {
    if (current.length === 0) return;
    const rawWidth = rawWidthOf(current);
    const totalGap = gap * (current.length - 1);
    const availableWidth = Math.max(0, containerWidth - totalGap);
    // For the last row, don't stretch above target — a single trailing
    // photo shouldn't inflate to fill the container. Middle rows scale
    // freely (usually shrinking a bit) so the row fills width exactly.
    const scale = isLast
      ? Math.min(1, availableWidth / rawWidth)
      : availableWidth / rawWidth;
    const rowHeight = targetRowHeight * scale;
    rows.push({
      height: rowHeight,
      items: current.map((i) => ({ id: i.id, width: i.aspect * rowHeight })),
    });
    current = [];
  };

  for (const item of items) {
    current.push(item);
    const rawWidth = rawWidthOf(current);
    const totalGap = gap * (current.length - 1);
    if (rawWidth + totalGap >= containerWidth) {
      flush(false);
    }
  }
  flush(true);
  return rows;
}
