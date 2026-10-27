function sortTickets(tickets, sortBy = 'createdAt', direction = 'desc') {
  const sorted = tickets.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
  return direction === 'desc' ? sorted : sorted.reverse();
}

module.exports = { sortTickets };
