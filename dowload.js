const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const linksFile = 'C:\\Users\\miked\\Downloads\\sjj_mp3_links.txt';
const downloadFolder = "C:\\Users\\miked\\Downloads\\Music\\JW";

// Create folder if it doesn't exist
if (!fs.existsSync(downloadFolder)) {
  fs.mkdirSync(downloadFolder, { recursive: true });
}

async function downloadFile(url, filepath) {
  try {
    console.log(`Fetching: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
      return false;
    }

    // Convert Web Stream to Node.js stream
    const nodeStream = Readable.fromWeb(response.body);
    const fileStream = fs.createWriteStream(filepath);

    // Use pipeline for better error handling
    await pipeline(nodeStream, fileStream);
    return true;

  } catch (error) {
    console.error(`Error downloading from ${url}:`, error.message);
    return false;
  }
}

async function main() {
  try {
    const lines = fs.readFileSync(linksFile, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    console.log(`Found ${lines.length} URLs to download`);

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < lines.length; i++) {
      const url = lines[i];
      console.log(`\n[${i + 1}/${lines.length}] Processing: ${url}`);

      try {
        // Extract filename from URL
        const urlObj = new URL(url);
        let filename = path.basename(urlObj.pathname);

        // If no filename in URL, generate one
        if (!filename || filename === '/') {
          filename = `audio_${Date.now()}_${i}.mp3`;
        }

        // Ensure .mp3 extension
        if (!filename.toLowerCase().endsWith('.mp3')) {
          filename += '.mp3';
        }

        const filepath = path.join(downloadFolder, filename);

        if (fs.existsSync(filepath)) {
          console.log(`Already exists: ${filename}`);
          skipped++;
          continue;
        }

        console.log(`Downloading: ${filename}`);
        const success = await downloadFile(url, filepath);

        if (success) {
          console.log(`✅ Downloaded: ${filename}`);
          downloaded++;
        } else {
          console.log(`❌ Failed: ${filename}`);
          failed++;
        }

        // Small delay to be nice to the server
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing URL ${url}:`, error.message);
        failed++;
      }
    }

    console.log(`\n🎉 Download Summary:`);
    console.log(`✅ Downloaded: ${downloaded}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📁 Files saved to: ${downloadFolder}`);

  } catch (error) {
    console.error('Error reading links file:', error.message);
  }
}

main().catch(console.error);
