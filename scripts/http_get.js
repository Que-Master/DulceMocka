const http = require('http');

const url = process.argv[2];
if (!url) { console.error('Usage: node http_get.js <url>'); process.exit(1); }

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', data);
  });
}).on('error', err => { console.error('ERR', err.message); });
