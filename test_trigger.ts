async function trigger() {
  const res = await fetch("http://localhost:3000/api/crawl", { method: "POST" });
  console.log(await res.text());
}
trigger();
