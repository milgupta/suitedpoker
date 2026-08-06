"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { clientEnv } from "@/lib/env";
import { isPixelConfigured, trackPixel } from "@/lib/meta-client";

/**
 * The Meta pixel.
 *
 * `afterInteractive`, so it never competes with the landing page's LCP — every
 * click on that page costs money, and a tracking script that slows it down
 * loses more conversions than it measures.
 *
 * PageView is fired MANUALLY on each route change. The App Router does not
 * reload between routes, so the pixel's automatic pageview fires once and never
 * again — the same trap PostHog has in 8.1.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pixelId = clientEnv.NEXT_PUBLIC_META_PIXEL_ID;

  useEffect(() => {
    if (!isPixelConfigured()) return;
    trackPixel("PageView");
  }, [pathname, searchParams]);

  if (!isPixelConfigured()) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');`}
    </Script>
  );
}
