import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "react/no-unescaped-entities": "off", "@next/next/no-img-element": "off", "@next/next/no-page-custom-font": "off" } },
  { ignores: ["drizzle/**", ".next/**"] },
];
export default eslintConfig;
