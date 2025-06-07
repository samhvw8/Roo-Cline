import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
	test: {
		include: ["**/__tests__/**/*.spec.ts"],
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
	},
})
