# Versioning and isolation

Each release is an indivisible tuple:

```text
source commit + app version + extension version + application identity
+ Chrome profile + Electron data directory + release artifacts
```

The v0.1.1 and v0.2.1 tuples must remain independently installable. Do not load
both extension versions into one active test runtime and do not use temporary
directories for an extension that must survive a machine or browser restart.

Development work happens in the private repository. A reviewed, verified
snapshot is promoted here; private debug history is not merged wholesale.
