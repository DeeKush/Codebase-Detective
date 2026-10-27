function paginate(items, page = 1, pageSize = 10) {
  const start = page * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page,
    pageSize,
    total: slice.length,
    totalPages: Math.floor(slice.length / pageSize)
  };
}

module.exports = { paginate };
