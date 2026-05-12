async function run() {
  const res = await fetch('https://www.praxis.nl/search?text=yarenza&currentPage=1', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  console.log(html.substring(0, 500));
  
  // Try to find JSON or something
  const matches = html.match(/"name":"([^"]*yarenza[^"]*)"/gi);
  if (matches) {
    console.log(matches.slice(0, 10));
  } else {
    console.log("No matches found.");
  }
}
run();
