const PRIORITY_RANK = { low: 1, medium: 2, high: 3, urgent: 4 };

function filterTickets(tickets, { status, text } = {}) {
  return tickets.filter(ticket => {
    if (status && ticket.status !== status) return false;
    if (text && !ticket.title.includes(text)) return false;
    return true;
  });
}

module.exports = { filterTickets, PRIORITY_RANK };
