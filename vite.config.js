import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        school: "school.html",
        teacher: "teacher.html"
      }
    }
  }
});
