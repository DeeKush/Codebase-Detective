# Ticket list endpoint

Contract for `listTickets(query)`:

- `status` (optional): exact match on the ticket status.
- `text` (optional): case-insensitive substring match on the title.
- `sortBy`: `createdAt` or `priority`. `priority` order is low < medium < high < urgent.
- `direction`: `asc` or `desc` (default `desc`). Ties are broken by `id` ascending.
- `page` is 1-based, `pageSize` defaults to 10 and is clamped to 1..50.
- Response: `{ items, page, pageSize, total, totalPages }`, where `total` counts every ticket that
  matches the filters (not just the current page). The stored data must never be reordered.
