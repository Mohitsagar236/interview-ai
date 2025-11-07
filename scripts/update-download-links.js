// Update Download Links Helper
// This script helps update download.js with GitHub release URLs

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n🔗 Update Download Links\n');
console.log('This will update public/download.js with your GitHub release URLs\n');

// Ask for GitHub repo info
rl.question('GitHub username (default: Mohitsagar236): ', (username) => {
    username = username || 'Mohitsagar236';
    
    rl.question('GitHub repo (default: interview-ai): ', (repo) => {
        repo = repo || 'interview-ai';
        
        rl.question('Version tag (default: v0.1.0): ', (version) => {
            version = version || 'v0.1.0';
            
            rl.question('Windows filename (default: Interview.AI.Setup.0.1.0.exe): ', (windowsFile) => {
                windowsFile = windowsFile || 'Interview.AI.Setup.0.1.0.exe';
                
                // Generate URLs
                const baseUrl = `https://github.com/${username}/${repo}/releases/download/${version}`;
                const windowsUrl = `${baseUrl}/${windowsFile}`;
                const macUrl = `${baseUrl}/Interview-AI-0.1.0.dmg`;
                const linuxUrl = `${baseUrl}/interview-ai-0.1.0.AppImage`;
                
                // Read current download.js
                const downloadJsPath = path.join(__dirname, 'public', 'download.js');
                let content = fs.readFileSync(downloadJsPath, 'utf8');
                
                // Update DOWNLOAD_URLS
                const newUrls = `const DOWNLOAD_URLS = {
        windows: '${windowsUrl}',
        mac: '${macUrl}', // Update when available
        linux: '${linuxUrl}' // Update when available
    };`;
                
                // Replace the DOWNLOAD_URLS object
                content = content.replace(
                    /const DOWNLOAD_URLS = \{[\s\S]*?\};/,
                    newUrls
                );
                
                // Write back
                fs.writeFileSync(downloadJsPath, content);
                
                console.log('\n✅ Updated download.js successfully!\n');
                console.log('Download URLs:');
                console.log(`  Windows: ${windowsUrl}`);
                console.log(`  macOS:   ${macUrl}`);
                console.log(`  Linux:   ${linuxUrl}`);
                console.log('\n📝 Next steps:');
                console.log('  1. git add public/download.js');
                console.log('  2. git commit -m "Update desktop app download links"');
                console.log('  3. git push origin main\n');
                
                rl.close();
            });
        });
    });
});
