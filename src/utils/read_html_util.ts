// src/utils/readHtmlTemplate.ts
import fs from "fs";
import path from "path";

export function readHtmlTemplate(templateName: string): string {
  const templatePath = path.join(
    __dirname,
    "..",
    "assets",
    "email_templates",
    templateName
  );
  return fs.readFileSync(templatePath, "utf-8");
}
