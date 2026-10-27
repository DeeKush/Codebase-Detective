# Bug report

Some of our listeners never get notified. It only happens when an earlier listener on the same event was registered with `once` or removes itself while the event is being handled. In that case the listener registered right after it does not run for that event. If the first listener is a normal one, everything works.
