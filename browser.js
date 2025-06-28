// script.js - Working Node.js automation script
const puppeteer = require('puppeteer');

async function automateWebsite() {
  console.log('🚀 Starting browser automation...');

  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: false, // Set to true to run without GUI
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Helps with some systems
    });

    const page = await browser.newPage();
    console.log('✅ Browser launched');

    // Navigate to a website
    const targetUrl = 'https://www.jw.org/en/library/music-songs/'; // Change this to your target URL
    console.log(`📄 Loading page: ${targetUrl}`);

    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    console.log('✅ Page loaded');

    // Wait a bit for any dynamic content
    // await page.waitForTimeout(2000);

    // const classString = "videoFormat jsVideoFormat"
    await page.waitForNetworkIdle()

    // find anchor with href anchorHref
    const anchor = await page.evaluateHandle(() => {
      const anchorHref = "https://www.jw.org/download/?output=html&pub=sjjm&fileformat=MP3%2CAAC%2CM4V%2CMP4%2C3GP&alllangs=0&langwritten=E&txtCMSLang=E&isBible=0"
      const anchorClass = "secondaryButton fileTypeIcon jsDownload jsVideoModal"

      return Array.from(document.querySelectorAll('a')).find(link =>
        link.href === anchorHref
        && link.className.includes('secondaryButton')
        && link.className.includes('fileTypeIcon')
        && link.className.includes('jsDownload')
        && link.className.includes('jsVideoModal')
      )
    })

    if (anchor) {
      // Scroll into view
      await page.evaluate(el => el.scrollIntoView(), anchor);
      await page.waitForNetworkIdle()

      // Click the anchor
      await anchor.click();
      console.log('✅ Anchor clicked successfully');
    } else {
      console.log('❌ Anchor not found');
    }

    // wait for the download modal containing the download button to appear
    // the download buttons has the class "dropdownHandle"
    // loop through all buttons with the class "dropdownHandle" and click one after another
    await page.waitForSelector('.dropdownHandle', { timeout: 10000 });
    const downloadButtons = await page.$$('.dropdownHandle');
    if (downloadButtons.length > 0) {
      console.log(`✅ Found ${downloadButtons.length} download buttons`);
    }
    for (const button of downloadButtons) {
      await button.click();
      console.log('✅ Download button clicked');
      // wait for the div with class "dropdownBody open" to appear
      await page.waitForSelector('.dropdownBody.open', { timeout: 10000 });
      // find the first anchor with the class "secondaryButton resolutionButton" and span with rv-html attribute = "resolution.label" and innerText = "720p"
      const resolutionAnchor = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('a.secondaryButton.resolutionButton')).find(link => {
          const span = link.querySelector('span[rv-html="resolution.label"]');
          return span && span.innerText === '720p';
        });
      })
      if (resolutionAnchor) {
        // Scroll into view
        await page.evaluate(el => el.scrollIntoView(), resolutionAnchor);
        await page.waitForNetworkIdle()

        // get filename from the anchor's href
        const href = await resolutionAnchor.evaluate(el => el.href);
        const filename = href.split('/').pop().split('?')[0];
        console.log(`✅ Found resolution anchor for ${filename}`);

        // check C:\Users\miked\Downloads for the file
        const fs = require('fs');
        const downloadsPath = 'C:\\Users\\miked\\Downloads'; // Adjust this path as needed
        const filePath = `${downloadsPath}\\${filename}`;
        if (fs.existsSync(filePath))
        {
          console.log(`✅ File already exists: ${filePath}`);
        }
        else {
          // Click the resolution anchor
          await resolutionAnchor.click();
          console.log('✅ Resolution anchor clicked successfully');
          // wait for the download to start and finish
          // check the downloads folder for the file
          const checkDownload = async (filePath, timeout = 60000) => {
            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
              if (fs.existsSync(filePath)) {
                console.log(`✅ Download completed: ${filePath}`);
                return true;
              }
              await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
            }
            console.log(`❌ Download did not complete within ${timeout / 1000} seconds`);
            // continue to the next download button
          }
          await page.waitForTimeout(5000); // Adjust this timeout as needed
        }
      } else {
        console.log('❌ Resolution anchor not found');
      }
    }
    console.log("✅ Automation complete!");
  } catch (error) {
    console.error('❌ Automation failed:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// Alternative simple function without Puppeteer dependencies
async function basicExample() {
  console.log('🚀 Running basic Node.js script...');
  console.log('✅ Script is working!');
  console.log('💡 To run browser automation, install Puppeteer first:');
  console.log('   npm install puppeteer');
  console.log('   then run this script again');
}

// Check if Puppeteer is available
async function main() {
  try {
    // Try to require puppeteer
    require.resolve('puppeteer');
    console.log('📦 Puppeteer found, starting automation...');
    await automateWebsite();
  } catch (error) {
    console.log('📦 Puppeteer not found');
    await basicExample();
  }
}

// Actually run the script
main().catch(console.error);
