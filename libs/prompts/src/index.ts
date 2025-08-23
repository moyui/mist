import { readFileSync } from 'fs';
import { join } from 'path';

export const getMarkdownContent = (filename: string): string => {
  const filePath = join(__dirname, `./${filename}.md`);
  return readFileSync(filePath, 'utf-8');
};
