import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  const portable = mode === "portable";
  return {
    plugins: [
      react(),
      ...(portable
        ? [
            viteSingleFile({
              removeViteModuleLoader: true,
              outputFileName: "Lume.html",
            }),
          ]
        : []),
    ],
    ...(portable ? { publicDir: false, build: { outDir: "releases" } } : {}),
  };
});
