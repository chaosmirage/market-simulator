// @vitest-environment node
// Node environment on purpose: this spec reads the document text from the
// source tree and asserts on its bytes -- no DOM involved. The browser-side
// effect of the policy (a clean console on the served app) is exercised by
// the running app itself.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The deny-by-default content-security baseline the served document must
 * carry, directive by directive. The static host sets no response headers of
 * its own, so this in-document meta is the only channel the policy ships
 * through: 'wasm-unsafe-eval' scopes WebAssembly compilation instead of a
 * blanket script eval, 'unsafe-inline' styles cover the framework's runtime
 * style injection, and every script, image, font, connection, and worker
 * stays same-origin with plugins and foreign form targets refused.
 */
const CSP_BASELINE = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const DOCUMENT_URL = new URL('./index.html', import.meta.url);

function readServedDocument(): string {
  return readFileSync(DOCUMENT_URL, 'utf8');
}

function cspMetaContents(html: string): string[] {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return metaTags
    .filter((tag) =>
      /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)
    )
    .map((tag) => tag.match(/content\s*=\s*"([^"]*)"/i)?.[1] ?? '');
}

describe('the document security baseline', () => {
  it('carries exactly one content-security-policy meta with the deny-by-default allowlist', () => {
    expect(cspMetaContents(readServedDocument())).toEqual([CSP_BASELINE]);
  });

  it('places the policy inside the head, where the browser honors it', () => {
    const html = readServedDocument();
    const position = html.search(/<meta\b[^>]*Content-Security-Policy[^>]*>/i);

    expect(position).toBeGreaterThan(-1);
    expect(position).toBeLessThan(html.indexOf('</head>'));
  });
});
