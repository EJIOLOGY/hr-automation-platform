import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HR Operations",
    short_name: "HR Ops",
    description: "HR operations workspace for conversations and requests.",
    start_url: "/dashboard/analytics",
    scope: "/dashboard/",
    display: "standalone",
    background_color: "#f5f9f8",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
