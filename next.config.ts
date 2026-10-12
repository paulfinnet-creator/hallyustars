import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default function config(phase: string): NextConfig {
  return withNextIntl({
    poweredByHeader: false,
    // next dev times out Google font downloads after 3 s; on a slow connection
    // the ~1,000 CJK font files never finish. Use system fonts in dev only.
    ...(phase === PHASE_DEVELOPMENT_SERVER && {
      turbopack: { resolveAlias: { "@/app/fonts": "./src/app/fonts.dev.ts" } },
    }),
  });
}
