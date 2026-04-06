import LandingPage from "../src/components/LandingPage";

export const metadata = {
  title: "England's River Health, Made Visible",
  alternates: {
    canonical: "https://www.riverwatch.earth",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "River Watch",
      url: "https://www.riverwatch.earth",
      description:
        "Explore decades of water quality data from every river, lake and estuary in England. Interactive maps, pollution indicators, and health trends — all free and open source.",
      author: {
        "@type": "Person",
        name: "Laurence Wayne",
        url: "https://laurence-wayne.com/about",
      },
    },
    {
      "@type": "WebApplication",
      name: "River Watch",
      url: "https://www.riverwatch.earth/map",
      applicationCategory: "EnvironmentalApplication",
      operatingSystem: "Any",
      description:
        "Interactive map of 111,000+ water quality sampling points, fish survey sites, and invertebrate monitoring stations across England's rivers.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "GBP",
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
