# Bug report

We use this cache for per-user counters. Entries that are read constantly still get thrown out when the cache is full. For example, with room for two entries I store a counter named `hits` with the value 0 and another entry `b`, read `hits`, then add a third entry. I expected `b` to be evicted because `hits` was just used, but `hits` is gone instead. Counters with a non-zero value seem to behave correctly.
