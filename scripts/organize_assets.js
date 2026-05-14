const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const cssDir = path.join(publicDir, 'css');
const jsDir = path.join(publicDir, 'js');

// Create directories if they don't exist
if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir);
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir);

// Get all files in public directory
const files = fs.readdirSync(publicDir);

// Filter files
const cssFiles = files.filter(f => f.endsWith('.css'));
const jsFiles = files.filter(f => f.endsWith('.js'));
const htmlFiles = files.filter(f => f.endsWith('.html'));

// Move CSS files
cssFiles.forEach(file => {
    fs.renameSync(path.join(publicDir, file), path.join(cssDir, file));
    console.log(`Moved ${file} to public/css/`);
});

// Move JS files
jsFiles.forEach(file => {
    fs.renameSync(path.join(publicDir, file), path.join(jsDir, file));
    console.log(`Moved ${file} to public/js/`);
});

// Update HTML files
htmlFiles.forEach(file => {
    const htmlPath = path.join(publicDir, file);
    let content = fs.readFileSync(htmlPath, 'utf8');

    // Regex for CSS hrefs: href="/filename.css"
    cssFiles.forEach(cssFile => {
        const regex = new RegExp(`href="/${cssFile}"`, 'g');
        content = content.replace(regex, `href="/css/${cssFile}"`);
    });

    // Regex for JS src: src="/filename.js"
    jsFiles.forEach(jsFile => {
        const regex = new RegExp(`src="/${jsFile}"`, 'g');
        content = content.replace(regex, `src="/js/${jsFile}"`);
    });

    fs.writeFileSync(htmlPath, content, 'utf8');
    console.log(`Updated ${file}`);
});

console.log('Done organizing assets.');
