export const dynamic = "force-static";

export default function sitemap() {
  return [
    {
      url: "https://riverwatch.earth",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://riverwatch.earth/map",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
