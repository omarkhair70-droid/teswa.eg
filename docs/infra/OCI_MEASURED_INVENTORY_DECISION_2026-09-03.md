# Teswa OCI Measured Inventory Decision — 2026-09-03

## Measured tenancy facts

Source: read-only OCI inventory executed in Cloud Shell against the user's tenancy.

- Home/subscribed region: `me-jeddah-1`.
- Running compute instances: 1.
- Running instance shape: `VM.Standard.A1.Flex`.
- Running instance allocation: 2 OCPUs / 12 GB RAM.
- Boot volumes: 1 totaling 47 GB.
- Additional block volumes: 0.
- Object Storage buckets: 0.
- Load balancers: 0.
- VCNs: 1.
- Subnets: 2.
- NSGs: 0.
- Vaults: 0.
- Alarms: 0.
- Notification topics: 0.

## Important interpretation

OCI service-limit values are not the same thing as Always Free entitlement.

The tenancy reports larger regional service-limit ceilings for A1 compute, but the current running A1 instance already consumes 2 OCPUs / 12 GB RAM, which matches the current documented Always Free A1 allowance.

Therefore:

1. Do not interpret `standard-a1-core-regional-count=16` or `standard-a1-memory-regional-count=96` as free capacity.
2. Do not provision another A1 instance for Teswa under the assumption that it will remain free after the trial.
3. Do not resize, stop, or repurpose the existing A1 VM until its ownership is explicitly identified.
4. The existing VM may belong to another production lane; the Teswa plan explicitly forbids touching Nova or Balcona.

## Current blocker

The owner of the single running A1 VM must be identified before any compute design decision.

Until then, OCI Phase 0 remains read-only and no production or trial-only compute will be provisioned.

## Capacity already clearly available without touching compute

These are tenancy inventory observations, not billing promises:

- no Object Storage buckets currently exist;
- no OCI load balancers currently exist;
- no Vault currently exists;
- no alarms/notification topics currently exist;
- only 47 GB of boot volume is currently allocated in the tenancy snapshot.

Whether a new use of these services is free must be checked against the current billing/free-tier rules before provisioning.

## Next gate

Run a safe identity-only command for the single VM that prints only:

- display name
- shape
- lifecycle state
- OCPU count
- RAM

No OCID, IP, VNIC, SSH key, secret, or network identifier should be copied into chat.

Once the VM is identified:

- if it is Nova or Balcona infrastructure: leave it completely untouched and design Teswa around separate paid/trial-free capacity choices;
- if it is unused and explicitly approved for Teswa: evaluate reallocation, but still no cutover;
- if ownership is uncertain: stop and keep Phase 0 read-only.

## Topology status

The target architecture remains:

- PostgreSQL
- Teswa API
- Realtime
- Workers/Scheduler
- Object Storage
- TLS/Ingress
- firewall/network policy
- secrets
- backups
- monitoring

But compute placement is deliberately unresolved until the existing A1 VM is identified.
