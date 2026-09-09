# Persistent extension runtimes

Each version directory contains an exact unpacked extension release artifact.
Chrome development profiles should load one matching version from here instead
of loading a build from `/private/tmp` or a mutable private development branch.

Browser profiles, cookies, local storage, logs, downloads, and Electron data do
not belong below this directory.
