import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements no layout, so it has no `scrollIntoView`.
 *
 * The component calls it to keep the highlighted option visible while somebody
 * arrows through a list taller than its panel — real behaviour in a real
 * browser, and an environment gap here rather than a defect there. Stubbed in
 * the TEST SETUP rather than guarded in the component: a browser that genuinely
 * lacked this is something we would want to hear about, and a `?.` in the
 * source would silence it for ever.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no layout in jsdom, so there is nothing to scroll */
  };
}
