// @vitest-environment node
// Node environment on purpose: this spec reads the global stylesheet from
// the source tree and pins its registrations -- no DOM involved. The
// browser-side effect (themed components, icon glyphs drawn from the
// bundled font files) is exercised by the running app itself.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The registrations the served bundle's global stylesheet carries: the
 * Angular Material prebuilt theme first, then the self-hosted icon-font
 * stylesheet whose @font-face files the builder emits as same-origin
 * assets (the document's content-security baseline admits no remote font
 * origin). CSS admits @import only ahead of other rules, so nothing may
 * precede these two statements.
 */
const EXPECTED_REGISTRATIONS = [
  "@import '@angular/material/prebuilt-themes/azure-blue.css';",
  "@import 'material-icons/iconfont/material-icons.css';",
];

const STYLES_URL = new URL('./styles.css', import.meta.url);

function importedStyleSheets(css: string): string[] {
  return (css.match(/@import[^;]+;/g) ?? []).map((statement) =>
    statement.trim()
  );
}

describe('the global stylesheet registrations', () => {
  it('imports the Material theme and the bundled icon font ahead of any other rule', () => {
    const css = readFileSync(STYLES_URL, 'utf8');

    expect(importedStyleSheets(css)).toEqual(EXPECTED_REGISTRATIONS);
    expect(css.indexOf('@import')).toBe(0);
  });
});
