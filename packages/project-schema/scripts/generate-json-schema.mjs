import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProjectDocumentJsonSchema } from '../src/index.ts';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(packageDirectory, '..', '..', 'schemas', 'project.schema.json');
const schema = generateProjectDocumentJsonSchema();

await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
