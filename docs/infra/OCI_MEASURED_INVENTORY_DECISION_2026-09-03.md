# Teswa OCI Measured Inventory Decision — 2026-09-03

## Measured tenancy facts

Source: read-only OCI inventory executed in Cloud Shell against the user's tenancy.

- Home/subscribed region: `me-jeddah-1`.
- Running compute instances: 1.
- Running instance name: `nova-backend`.
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

## Ownership decision

The only running A1 VM is confirmed to be `nova-backend`.

This resolves the ownership blocker.

**Hard boundary:** Nova infrastructure is out of scope for the Teswa OCI lane. Do not stop, resize, reboot, reimage, attach Teswa services to, change firewall rules for, change boot volume settings for, or otherwise repurpose `nova-backend`.

## Always Free interpretation

OCI service-limit values are not the same thing as Always Free entitlement.

The tenancy reports larger regional A1 service-limit ceilings, but `nova-backend` already consumes 2 OCPUs / 12 GB RAM, which matches the current documented Always Free A1 allowance.

Therefore:

1. Do not interpret `standard-a1-core-regional-count=16` or `standard-a1-memory-regional-count=96` as free capacity.
2. Do not provision another A1 instance for Teswa under the assumption that it is Always Free.
3. The A1 Always Free compute pool is treated as fully occupied by Nova.
4. Teswa must use other measured capacity or an explicitly approved paid compute lane.

Oracle also documents up to two Always Free `VM.Standard.E2.1.Micro` AMD instances. These are only 1 GB RAM each and are not sufficient as the single host for PostgreSQL + API + Realtime + workers. They may still be useful for tiny edge/monitoring roles, subject to a resource-availability check.

## Capacity already clearly unused in the snapshot

These are inventory observations, not billing promises:

- no Object Storage buckets currently exist;
- no OCI load balancers currently exist;
- no Vault currently exists;
- no alarms/notification topics currently exist;
- only 47 GB of boot volume is currently allocated in the tenancy snapshot.

Whether a new use of these services is free must be checked against current billing/free-tier rules before provisioning.

## E2 Micro availability result

A read-only `limits resource-availability get` check returned:

- available: 2
- used: 0
- fractional availability: 2.0
- fractional usage: 0.0

Therefore both Always Free `VM.Standard.E2.1.Micro` slots are currently unused in the active availability domain.

This does **not** change the data-plane decision: 1 GB RAM per E2 Micro is too constrained to treat either instance as the sole company-grade PostgreSQL + API + Realtime + Workers host. They remain auxiliary capacity.

## Next gate

Lock the Teswa-specific network/storage/secrets/monitoring topology as code, isolated from the existing Nova VCN/resources.

Remaining read-only checks before any apply:

- block-storage capacity relevant to the Always Free pool;
- load-balancer `lb-10mbps-count` resource availability if managed ingress is selected;
- exact Nova VCN/subnet ownership only to ensure Teswa creates new, non-overlapping resources.

No provisioning or production cutover is allowed during this gate.

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

Compute placement is now constrained by a clear rule:

- Nova keeps the existing A1 VM exclusively.
- Teswa gets no A1 Always Free compute unless capacity/billing circumstances change explicitly.
- E2 Micro may be auxiliary only.
- A real Teswa application/database host requires either a separate paid/trial compute allocation or a different architecture that does not compromise Nova.
