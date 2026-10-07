/**
 * Grid Lanes fallback.
 *
 * `display: grid-lanes` takes the row alignment out of CSS Grid, which is what
 * leaves dead space under a card that is shorter than its neighbour. Safari
 * 26.4+ has shipped it, but Chrome, Edge and Firefox still keep it behind a
 * flag, and there the rows stay aligned and the gap comes back.
 *
 * So where Grid Lanes is missing we lay the cards out by hand, to the same two
 * rules it uses: every card goes into the emptiest lane, unless the difference
 * is small enough that holding the sorted order matters more. That keeps the
 * card order reading the same way in every browser.
 *
 * The stylesheet stays in charge of the lane widths and the breakpoints: this
 * measures them off the cards rather than repeating either.
 */

/** True where the stylesheet can already do the layout, so we stay out of it. */
const hasLanes = typeof CSS !== 'undefined' && CSS.supports('display', 'grid-lanes');

/** Added only once the cards have been placed, so a throw leaves the grid be. */
const ACTIVE_CLASS = 'rm-grid--measured';

/**
 * Used when the browser cannot report `flow-tolerance` at all; mirrors the 4rem
 * in styles.css.
 */
const FALLBACK_TOLERANCE = 64;

/**
 * Resolves a length to pixels. A browser that has not implemented
 * `flow-tolerance` hands the length back as it was specified rather than
 * resolved, so `4rem` arrives intact and has to be scaled by the root font size -
 * without this it would read as 4px and the card order would shuffle.
 */
function toPx(value: string, fallback = 0, rootSize = 16): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (value.endsWith('rem') || value.endsWith('em')) return parsed * rootSize;
  return parsed;
}

/** Hands the grid back to the browser, inline styles and all. */
function release(grid: HTMLElement, cards: HTMLElement[]): void {
  grid.classList.remove(ACTIVE_CLASS);
  grid.style.removeProperty('height');
  for (const card of cards) {
    card.style.removeProperty('width');
    card.style.removeProperty('transform');
  }
}

/** Places `grid`'s cards into lanes. A no-op once Grid Lanes is available. */
export function layoutCards(grid: HTMLElement | null): void {
  if (!grid || hasLanes) return;

  const cards = Array.from(grid.children) as HTMLElement[];
  if (cards.length === 0) {
    release(grid, cards);
    return;
  }

  // Measure with the cards back in the grid, because that is what gives them
  // their lane width - and read that width off a card rather than out of the
  // computed `grid-template-columns`, which engines hand back stale: QQ Browser
  // reported 259px lanes while the grid was actually laying them out at 361px,
  // which put every card in the wrong place.
  release(grid, cards);

  const style = window.getComputedStyle(grid);
  const rootSize = toPx(window.getComputedStyle(document.documentElement).fontSize, 16);
  const gap = toPx(style.columnGap, 0, rootSize);
  const rowGap = toPx(style.rowGap, 0, rootSize);
  const tolerance = toPx(style.getPropertyValue('flow-tolerance'), FALLBACK_TOLERANCE, rootSize);

  // Read the boxes with `getBoundingClientRect` rather than `offsetWidth` /
  // `offsetHeight`, which round to whole pixels. Rounding the lane width changes
  // how the text wraps, so a card can come back a little taller or shorter than
  // the height measured here.
  const cardWidth = cards[0].getBoundingClientRect().width;
  const heights = cards.map((card) => card.getBoundingClientRect().height);

  // Phones are a single lane, which already stacks without gaps.
  const laneCount = cardWidth > 0 ? Math.round((grid.clientWidth + gap) / (cardWidth + gap)) : 1;
  if (laneCount < 2) return;

  grid.classList.add(ACTIVE_CLASS);

  const filled = Array.from({ length: laneCount }, () => 0);

  cards.forEach((card, index) => {
    let lane = index % laneCount;
    let emptiest = 0;
    for (let i = 1; i < laneCount; i += 1) {
      if (filled[i] < filled[emptiest]) emptiest = i;
    }
    // Reading order wins unless another lane is more than `tolerance` shorter.
    if (filled[lane] - filled[emptiest] > tolerance) lane = emptiest;

    card.style.width = `${cardWidth}px`;
    card.style.transform = `translate(${lane * (cardWidth + gap)}px, ${filled[lane]}px)`;

    filled[lane] += heights[index] + rowGap;
  });

  grid.style.height = `${Math.max(...filled) - rowGap}px`;
}
