import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Menuly",
    short_name: "Menuly",
    description: "Weekly Meal Planning & Grocery List",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#c2613a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
