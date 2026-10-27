const { tickets } = require('./data');
const { filterTickets } = require('./filter');
const { sortTickets } = require('./sort');
const { paginate } = require('./paginate');

function listTickets({ status, text, sortBy, direction, page, pageSize } = {}) {
  const filtered = filterTickets(tickets, { status, text });
  const pageResult = paginate(filtered, page, pageSize);
  pageResult.items = sortTickets(pageResult.items, sortBy, direction);
  return pageResult;
}

module.exports = { listTickets };
