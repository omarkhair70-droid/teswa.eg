# Phase 4 OS Inventory Review Contract

The first Run Command in Phase 4 is intentionally read-only.

It collects only:

- OS release/kernel
- CPU and memory
- root filesystem/block-device layout
- SELinux/firewalld state
- presence/version of runtime binaries
- listening TCP sockets
- package-manager presence/version

It does not:

- install, update, or refresh package metadata
- edit files
- create users
- change firewall rules
- change SELinux
- start/stop/restart services
- expose SSH
- print environment variables or secret files

The output is used to choose the exact Oracle Linux hardening/bootstrap steps for core and edge separately.
