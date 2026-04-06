import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import Navbar from "../src/components/Navbar";
import "../src/index.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const SITE_URL = "https://www.riverwatch.earth";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "River Watch — England's River Health, Made Visible",
    template: "%s | River Watch",
  },
  description:
    "Explore decades of water quality data from every river, lake and estuary in England. Interactive maps, pollution indicators, and health trends — all free and open source.",
  keywords: [
    "river water quality",
    "England rivers",
    "water pollution",
    "Environment Agency",
    "sampling points",
    "river health",
    "water quality data",
    "river map",
    "fish surveys",
    "invertebrate monitoring",
  ],
  authors: [{ name: "Laurence Wayne", url: "https://laurence-wayne.com/about" }],
  creator: "Laurence Wayne",
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: SITE_URL,
    siteName: "River Watch",
    title: "River Watch — England's River Health, Made Visible",
    description:
      "Explore decades of water quality data from every river, lake and estuary in England. Interactive maps, pollution indicators, and health trends — all free and open source.",
    images: [
      {
        url: "/thumbnail.png",
        width: 1200,
        height: 630,
        alt: "River Watch — interactive map of England's river water quality",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "River Watch — England's River Health, Made Visible",
    description:
      "Explore decades of water quality data from every river, lake and estuary in England. Interactive maps, pollution indicators, and health trends — all free and open source.",
    images: ["/thumbnail.png"],
  },
  icons: {
    icon: { url: "/logo.png", type: "image/png" },
    apple: "/logo.png",
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Serif+Display&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
        <Navbar />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
