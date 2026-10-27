function f(x, w) {
  const out = [];
  for (let i = 0; i < x.length - w.length; i++) {
    let acc = 0;
    for (let j = 0; j < w.length; j++) {
      acc += x[i + j] * w[j];
    }
    out.push(acc);
  }
  return out;
}

module.exports = { f };
