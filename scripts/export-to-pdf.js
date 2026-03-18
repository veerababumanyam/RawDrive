const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function convert() {
    const mdPath = path.resolve(__dirname, '../docs/GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md');
    const pdfPath = path.resolve(__dirname, '../docs/GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.pdf');
    
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Technical Specification</title>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
        <style>
            body {
                box-sizing: border-box;
                min-width: 200px;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
            }
            .markdown-body {
                box-sizing: border-box;
                min-width: 200px;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
            }
            @media (max-width: 767px) {
                .markdown-body {
                    padding: 15px;
                }
            }
        </style>
    </head>
    <body class="markdown-body">
        <div id="content"></div>
        <script>
            document.getElementById('content').innerHTML = marked.parse(\`${mdContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
        </script>
    </body>
    </html>
    `;
    
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    
    // Add a small delay for marked to finish rendering if needed
    await page.waitForTimeout(1000);
    
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
        printBackground: true
    });
    
    await browser.close();
    console.log('PDF created successfully at ' + pdfPath);
}

convert().catch(err => {
    console.error(err);
    process.exit(1);
});
