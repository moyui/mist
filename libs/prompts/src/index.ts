import { readFileSync } from 'fs';
import { join } from 'path';

export const getMarkdownContent = (filename: string): string => {
  const filePath = join(process.cwd(), 'libs/prompts/src', `${filename}.md`);
  return readFileSync(filePath, 'utf-8');
};
