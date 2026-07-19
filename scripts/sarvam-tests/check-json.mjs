import extract from 'extract-zip';
import fs from 'fs';
import AdmZip from 'adm-zip';

async function test() {
  const zip = new AdmZip('g:/swaram/sarvam_result.zip');
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.entryName === 'metadata/page_001.json') {
      const data = JSON.parse(entry.getData().toString('utf8'));
      console.log(Object.keys(data));
      console.log("Block keys:", Object.keys(data.blocks[0]));
    }
  }
}
test();
