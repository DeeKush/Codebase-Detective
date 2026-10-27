# Event Bus

- `Emitter`: `on`, `once`, `off`, `emit`, `listenerCount`. `on` returns an unsubscribe function.
- `Bus`: topic publish/subscribe built on `Emitter`. Subscribers to `"*"` receive `(topic, payload)` for every topic.
- Every handler registered when `emit` starts must be called, even if another handler unsubscribes during the emit.
