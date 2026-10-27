function reservoirSample(stream, k, random = Math.random) {
  const reservoir = [];
  let seen = 0;
  for (const item of stream) {
    seen += 1;
    if (reservoir.length < k) {
      reservoir.push(item);
      continue;
    }
    const j = Math.floor(random() * seen);
    if (j <= k) {
      reservoir[j] = item;
    }
  }
  return reservoir;
}

module.exports = { reservoirSample };
