import { copyFile } from 'node:fs/promises';

for (const file of ['serve.mjs', 'LOCAL-README.md', 'LICENSE', 'ASSET-LICENSES.md']) {
  await copyFile(file, `dist/${file}`);
}
