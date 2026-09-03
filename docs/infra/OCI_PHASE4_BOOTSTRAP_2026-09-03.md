# Teswa OCI Phase 4 Bootstrap — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** OS INVENTORY GREEN — CORE RUNTIME PREREQUISITES NEXT

## Goal

Prepare the two new Teswa hosts for the future company-owned runtime without moving production traffic yet.

## Hosts

### teswa-edge-01

Future responsibilities:

- Caddy/TLS
- reverse proxy
- edge health endpoint
- no database
- no application secrets in Terraform

### teswa-core-01

Future responsibilities:

- PostgreSQL
- Teswa API
- Realtime
- Workers

These remain separate service/restart boundaries even though they initially share one A1 host.

## Bootstrap sequence

1. Verify Oracle Cloud Agent and Compute Instance Run Command on both hosts.
2. Collect read-only OS/runtime inventory.
3. Apply OS baseline and package updates through Run Command.
4. Install container/runtime prerequisites.
5. Bootstrap PostgreSQL privately.
6. Bootstrap API / Realtime / Worker service units or containers.
7. Bootstrap Caddy on edge.
8. Add monitoring/logging.
9. Add backup/restore jobs.
10. Run internal smoke tests.

## Still forbidden

- no Supabase shutdown
- no production cutover
- no DNS switch
- no migration of live user data
- no public PostgreSQL
- no public SSH requirement
- no secrets printed in Run Command output

The first Phase 4 action is read-only readiness verification only.


## Preflight result

Both Teswa instances passed the Oracle Cloud Agent readiness gate:

- `teswa-core-01`: RUNNING
- `teswa-edge-01`: RUNNING
- management enabled
- monitoring enabled
- plugins enabled
- Compute Instance Run Command: RUNNING
- Compute Instance Monitoring: RUNNING
- `phase4_preflight=PASS`

The next step is a read-only guest OS inventory through Run Command. No package installation or guest OS mutation is included yet.


## Run Command ACCEPTED timeout diagnosis

The first read-only OS inventory command remained in `ACCEPTED` for the full client polling window and never reached `IN_PROGRESS`.

This indicates that the guest script itself did not start.

Oracle documents this behavior when the instance can run the plugin but is not authorized to poll its command execution through a dynamic group and `instance-agent-command-execution-family` policy. New dynamic-group membership can take up to 30 minutes to become effective.

The repository previously enabled the Run Command plugin but did not create this instance-principal IAM path.

Remediation:

1. create a Teswa-only dynamic group matching instances in `teswa-platform`;
2. grant only `use instance-agent-command-execution-family` in `teswa-platform`, restricted to the target instance;
3. wait for IAM/dynamic-group propagation;
4. retry a read-only Run Command before any bootstrap mutation.


## Run Command IAM plan review

Read-only diagnosis confirmed:

- no existing `teswa-run-command-instances` dynamic group
- no existing `teswa-run-command-policy`
- the core inventory command remained `ACCEPTED`
- edge had no pending accepted command

The saved Terraform IAM plan was reviewed:

- 2 creates
- 0 changes
- 0 destroys
- `phase4_iam_plan_guard=PASS`

Approved resources:

1. root-tenancy dynamic group `teswa-run-command-instances`, matching instances in the dedicated `teswa-platform` compartment;
2. root policy `teswa-run-command-policy`, granting only `use instance-agent-command-execution-family` in `teswa-platform` with `request.instance.id=target.instance.id`.

The policy statement matches Oracle's documented Run Command instance-principal requirement.

No compute, network, storage, DNS, database, Nova, or Supabase resource changes are part of this plan.

**Status:** IAM SAVED PLAN REVIEWED — APPROVED FOR APPLY.


## IAM verifier correction

The first post-apply verifier printed `dynamic_group_rule_present=false` but still returned PASS.

That was a verifier defect, not an approved state: the list response was not a reliable source for validating the matching rule, and the check was informational only.

The verifier now:

- resolves the dynamic group ID from the list;
- fetches the full dynamic group with `oci iam dynamic-group get`;
- requires the matching rule to contain `instance.compartment.id`;
- requires the rule to contain the actual Teswa compartment OCID;
- fails if either rule check is false;
- checks Terraform drift after persisting the IAM feature gate as enabled.

Do not proceed to guest bootstrap until the corrected verifier is green.


## Run Command IAM verification result

The corrected post-apply IAM verifier is green:

- dynamic group state: ACTIVE
- dynamic group matching-rule field present
- dynamic group rule matches the Teswa compartment
- policy state: ACTIVE
- `instance-agent-command-execution-family` statement present
- same-instance condition present
- `terraform_drift=none`
- `phase4_iam_verify=PASS`

The Run Command authorization path is now closed on the OCI control plane. Guest execution may still wait for normal dynamic-group propagation.


## Run Command agent recovery result

After the IAM propagation window elapsed with the guest inventory still in `ACCEPTED`, a guarded soft reset was performed on `teswa-core-01` only.

Observed recovery:

- instance transitioned `STOPPING -> RUNNING`;
- Compute Instance Run Command plugin returned `RUNNING`;
- Compute Instance Monitoring plugin returned `RUNNING`;
- recovery gate returned `recovery=PASS`.

No production cutover, Supabase change, Nova change, DNS change, or data mutation occurred.

The next step is a fresh read-only OS inventory Run Command.


## Soft reset timing correction

The initial recovery helper used a 600-second instance-state timeout. Oracle documents that `SOFTRESET` can wait up to 15 minutes for the guest OS to shut down gracefully before forcing the power cycle. Therefore a 10-minute helper timeout can report a false recovery failure while OCI is still within the documented graceful reboot window.

Both guarded recovery helpers now allow 20 minutes for the instance lifecycle transition. This changes only client-side waiting; it does not trigger any additional reboot or infrastructure mutation.


## Edge soft reset completion

The guarded `SOFTRESET` on `teswa-edge-01` remained in `STOPPING` beyond the helper's original 10-minute client timeout, but OCI subsequently completed the lifecycle transition successfully:

- `13:02:42Z STOPPING`
- `13:03:14Z STOPPING`
- `13:03:46Z RUNNING`

No second reset was issued.

The OS inventory helper now accepts an optional target instance name so the already-green Core inventory does not need to be rerun while validating Edge recovery.

Example:

`bash ../inventory/run-phase4-os-inventory.sh teswa-edge-01`


## OS inventory closure

The read-only guest inventory is green on both hosts.

### teswa-core-01

- Oracle Linux 9.8
- aarch64
- 1 vCPU visible
- ~5.5 GiB RAM available to the guest
- 4 GiB swap
- 50 GB boot disk, ~20 GB free on root
- SELinux Enforcing
- firewalld active/enabled
- no Podman/Docker/Node runtime installed yet
- Run Command execution: SUCCEEDED / exit 0

### teswa-edge-01

- Oracle Linux 9.8
- x86_64
- 2 logical CPUs visible
- ~498 MiB RAM available to the guest
- ~497 MiB swap
- 50 GB boot disk, ~25 GB free on root
- SELinux Enforcing
- firewalld active/enabled
- no Podman/Docker/Node runtime installed yet
- Run Command execution: SUCCEEDED / exit 0

The Edge guest-memory result is materially lower than the shape-level 1 GB allocation previously reported by OCI. Runtime sizing will therefore follow the live guest measurement.

### Runtime consequence

- Edge remains intentionally minimal: native Caddy later, no Docker/Podman/Node workload.
- Core will carry PostgreSQL 17 plus the API/Realtime/Worker runtime.
- PostgreSQL will be native and localhost-only initially, which satisfies Lane 4's private-target preflight and avoids container/network complexity for the database.
- App service isolation on Core will use Podman/systemd boundaries later.
- Supabase remains production authority; no cutover is included.

**OS inventory gate:** CLOSED / GREEN.


## Core prerequisite privilege failure

The first Core package-bootstrap Run Command failed before any package mutation:

- Run Command state: FAILED
- exit code: 10
- guest message: `sudo: a password is required`
- guard result: `baseline=FAIL reason=no_privileged_execution`

This is expected OCI behavior: Compute Instance Run Command executes as the `ocarun` user by default. Administrator commands require an explicit privilege path.

Because `teswa-core-01` is intentionally private and has no public SSH exposure, the recovery design is:

1. enable the Oracle Cloud Agent `Bastion` plugin on Core;
2. create a temporary OCI Bastion with a client /32 allowlist;
3. allow TCP/22 into the Core app NSG only from the Bastion private endpoint /32;
4. create a short-lived Managed SSH session as `opc`;
5. install Oracle's documented `ocarun` sudoers entry and validate it with `visudo`;
6. rerun the guarded Core prerequisite bootstrap;
7. delete the temporary Bastion and port-22 ingress after the privilege bootstrap is proven.

No public SSH rule is introduced, and no Supabase/Nova/DNS/data change is part of this recovery.


## Temporary Bastion plan review correction

The first saved temporary-Bastion plan was not approved for apply even though its structural guard passed.

Review found the Bastion private endpoint was targeted at `teswa-public-edge`. OCI's Bastion guidance for private-host administration uses a private target subnet (either the target host subnet itself or another private subnet that can reach it). The Teswa Core already lives in `teswa-private-app`, which has the required VCN reachability and NAT egress.

The Bastion target subnet has therefore been corrected to `teswa-private-app`.

This correction does not open any public SSH path. The only SSH ingress remains TCP/22 from the Bastion private endpoint /32 to the Core app NSG, and the Bastion client allowlist remains the detected Cloud Shell source /32.

The original saved plan must not be applied; regenerate and review a fresh plan after this correction.


## Temporary Bastion corrected plan approval

The regenerated saved plan was reviewed after moving the Bastion endpoint to the private app subnet.

Observed plan:

- 2 creates
- 1 in-place update
- 0 destroys
- create `oci_bastion_bastion.admin[0]`
- create `oci_core_network_security_group_security_rule.bastion_to_core_ssh[0]`
- update `oci_core_instance.core[0]` only to enable the `Bastion` Oracle Cloud Agent plugin
- Bastion target subnet is the Teswa private app subnet
- SSH ingress is limited to TCP/22 from the Bastion private endpoint /32
- client allowlist is the current Cloud Shell source /32
- no public SSH exposure
- no Nova, Supabase, DNS, storage, database, or application-routing changes

`phase4_bastion_plan_guard=PASS`

**Decision:** APPROVED FOR APPLY using the reviewed saved plan only.


## Temporary Bastion verifier stdin bug

The first post-apply verifier stopped immediately after confirming:

- `bastion_state=ACTIVE`
- `private_endpoint_assigned=true`

This was a verifier bug, not evidence of a Bastion failure. The NSG rule check attempted to pipe JSON into `python3 -` while also supplying the Python program through a here-document. The here-document replaced standard input, so the JSON stream was unavailable to `json.load(sys.stdin)`.

The verifier now writes the NSG JSON to a temporary file and passes that file to Python explicitly. The temporary file is removed on exit.

No OCI resource mutation is required for this correction. Re-run the verifier only.


## Temporary Bastion verifier CLI flag correction

The second verifier run again stopped immediately after the Bastion state checks. The remaining issue was the OCI CLI flag used to list NSG rules.

For `oci network nsg rules list`, Oracle's CLI requires `--nsg-id`, not `--network-security-group-id`.

The verifier has been corrected to use the documented flag. No OCI mutation is required; re-run the verifier only.


## Temporary Bastion enum normalization drift

The post-apply drift verifier found a forced Bastion replacement even though the live Bastion was healthy.

Root cause:

- Terraform configuration used `bastion_type = "standard"`
- OCI normalized the live API value to `"STANDARD"`
- the provider treated the case-only difference as a ForceNew change

This was configuration drift, not infrastructure drift.

The Terraform enum has been normalized to `"STANDARD"`, matching the live OCI state. Do not apply the replacement plan shown by the verifier. Re-run the verifier after pulling this correction; the expected result is zero drift.


## Temporary Bastion verification green

The temporary administrative Bastion is now fully verified:

- Bastion state: ACTIVE
- private endpoint assigned
- Core SSH ingress rule matches the Bastion private endpoint /32
- Core Bastion plugin: RUNNING
- Terraform drift: none
- `phase4_admin_bastion_verify=PASS`

This closes the temporary access-path verification gate. The next action is the one-time Oracle-documented `ocarun` sudo bootstrap through a short-lived Managed SSH session, followed immediately by a fresh Run Command prerequisite bootstrap.

The Bastion remains temporary and must be removed after the Run Command privilege path is proven.


## Cloud Shell FIPS SSH key correction

The first one-time Bastion sudo bootstrap stopped before creating a session because Cloud Shell is operating in FIPS mode and rejected an ED25519 ephemeral key:

`ED25519 keys are not allowed in FIPS mode`

No Bastion session or guest mutation occurred.

The helper now generates an ephemeral 3072-bit RSA SSH key instead. The key remains local to the temporary helper directory and is removed on exit.


## Managed SSH connection failure diagnosis

The first short-lived Managed SSH session reached `ACTIVE`, but the client connection then failed with:

`kex_exchange_identification: Connection closed by remote host`

The failure occurred before the sudoers bootstrap ran, so no guest mutation was performed.

Oracle documents this error pattern when Bastion cannot reach the target on the requested port, and Managed SSH also requires a running OpenSSH server on the target instance.

Before changing network or firewall state, Lane 3 now performs a read-only Core diagnostic covering:

- `sshd` active/enabled state;
- TCP/22 listener presence;
- relevant `sshd_config` directives;
- Core addresses/routes;
- firewalld active zone/services;
- localhost TCP/22 reachability.

No second Bastion bootstrap attempt should be made until this read-only diagnostic is reviewed.


## Bastion SSH root cause

The read-only Core diagnostic proved:

- `sshd` is active and enabled;
- TCP/22 listens on IPv4 and IPv6;
- localhost TCP/22 is reachable;
- the Core NIC is up on the private app subnet.

The remaining network model exposed the actual Bastion failure: `teswa-private-app` intentionally used the empty security list, while the OCI Bastion private endpoint is not attached to the Core app NSG. Therefore the Bastion endpoint had no subnet-level egress rule permitting it to initiate TCP/22 to Core.

Oracle's Bastion guidance requires both target ingress and Bastion-side egress. For a Bastion sharing the target subnet, Oracle explicitly calls for TCP/22 egress from the Bastion subnet.

Remediation is temporary and least-privilege:

- create `teswa-admin-bastion-egress`;
- permit stateful TCP/22 egress only to the exact Core private IP /32;
- temporarily associate that security list with `teswa-private-app`;
- retain the existing Core ingress restricted to the Bastion private endpoint /32;
- remove the temporary egress list and association after the `ocarun` bootstrap is complete.

No public SSH, Internet ingress, Nova, Supabase, DNS, or application routing is changed.


## Bastion connectivity saved-plan approval

The temporary Bastion connectivity saved plan was reviewed and approved.

Observed plan:

- 1 create
- 1 in-place update
- 0 destroys
- create `oci_core_security_list.admin_bastion_egress[0]`
- update `oci_core_subnet.private_app` only to associate the temporary security list
- egress rule is stateful TCP/22 to the exact Core private IP /32
- no ingress added to the subnet
- no public SSH
- no instance replacement/reboot
- no Nova, Supabase, DNS, database, storage, or application-routing changes

`phase4_bastion_connectivity_plan_guard=PASS`

**Decision:** APPROVED FOR APPLY using the reviewed saved plan only.


## Bastion connectivity verifier port-shape correction

The first post-apply Bastion connectivity verifier reported:

- egress security list attached: true
- security list state: AVAILABLE
- Core TCP/22 egress rule: false

Review found the verifier was checking `tcp-options.min/max` directly. OCI's Security List API represents destination ports under `tcp-options.destination-port-range.min/max`.

The Terraform rule itself is correct; only the verifier's JSON path was wrong. The verifier now checks the documented nested destination-port-range structure.

No OCI mutation is required. Re-run the verifier only.


## Bastion connectivity verification green

The temporary Bastion connectivity path is now fully verified:

- temporary egress security list attached to `teswa-private-app`;
- security list state: AVAILABLE;
- stateful TCP/22 egress to the exact Core private IP /32: present;
- Terraform drift: none;
- `phase4_bastion_connectivity_verify=PASS`.

The one-time `ocarun` sudo bootstrap may now be retried through a fresh Managed SSH session.


## Bastion second connection failure

After the temporary Bastion TCP/22 egress path was applied and verified with zero Terraform drift, a fresh Managed SSH session still reached `ACTIVE` but the SSH client again failed with:

`kex_exchange_identification: Connection closed by remote host`

A subsequent Core prerequisite Run Command also failed exactly as expected because the `ocarun` sudoers entry still does not exist:

- Run Command user: `ocarun`
- `sudo: a password is required`
- `baseline=FAIL reason=no_privileged_execution`

This proves the privilege state is unchanged.

The next action remains read-only. A deeper diagnostic now inspects:

- static firewalld zone configuration for SSH allowance;
- effective sshd policy;
- Bastion plugin paths/logs readable by `ocarun`;
- Oracle Cloud Agent log references to Bastion/session failures;
- recent sshd journal entries where available.

No additional Bastion session or package mutation should be attempted before reviewing this evidence.


## Run Command diagnostic output truncation

Oracle documents that plain-text Run Command responses are limited to the last 1 KB. The first deep Bastion diagnostic therefore cannot be relied on as a complete multi-section transcript when it prints more than that limit.

The visible portion did still prove that the Oracle Linux public firewalld zone includes the SSH service and that `sshd` is installed.

Before another guest-side diagnostic, Lane 3 now checks the client-side Bastion allowlist path because Oracle documents the same remote-close symptom when the connecting machine's public IP is outside the Bastion CIDR allowlist. Cloud Shell public IPs are dynamic between Cloud Shell sessions.

The client-path diagnostic is read-only and compares the current Cloud Shell public IPv4 address against the live Bastion allowlist. No OCI resource is changed.


## Canonical Bastion target-subnet ingress

The Cloud Shell client-path diagnostic is green:

- Bastion ACTIVE
- private endpoint assigned
- current Cloud Shell public IP is inside the Bastion allowlist
- diagnostic PASS

That removes client allowlisting as the cause of the Managed SSH remote close.

Oracle's Bastion troubleshooting guidance specifically instructs allowing the Bastion private endpoint IP into the target subnet on the Managed SSH port. Although the Core app NSG already has an equivalent ingress rule, Lane 3 will now add the canonical subnet Security List ingress as a temporary bootstrap-only control to remove NSG interpretation from the remaining path.

The existing temporary Bastion connectivity Security List will therefore also include:

- stateful TCP/22 ingress
- source: exact live Bastion private endpoint /32

No public ingress is added. The rule remains temporary and will be removed with the Bastion bootstrap controls.


## Canonical ingress Terraform cycle correction

The first canonical target-subnet ingress plan failed before planning with a Terraform dependency cycle:

`oci_bastion_bastion.admin -> oci_core_subnet.private_app -> oci_core_security_list.admin_bastion_egress -> oci_bastion_bastion.admin`

The cycle was introduced because the subnet referenced the temporary Security List, while that Security List directly referenced the Bastion resource's computed private endpoint IP, and the Bastion itself targets the same subnet.

No OCI resource changed.

The cycle is removed by snapshotting the already-created live Bastion private endpoint IP into the ignored local connectivity tfvars file. Terraform now consumes that exact /32 as an input value instead of a resource dependency.

The connectivity preflight now captures and validates both:

- Core private IP /32
- live Bastion private endpoint IP /32

The canonical ingress plan must be regenerated only after re-running the connectivity preflight.


## Canonical Bastion ingress saved-plan approval

The regenerated canonical target-subnet ingress plan was reviewed after removing the Terraform dependency cycle.

Observed plan:

- 0 creates
- 1 in-place update
- 0 destroys
- only `oci_core_security_list.admin_bastion_egress[0]` changes
- new ingress is stateful TCP/22
- source is the exact live Bastion private endpoint /32
- no subnet replacement
- no instance change or reboot
- no public ingress
- no Nova, Supabase, DNS, database, storage, or application-routing change

`phase4_bastion_ingress_plan_guard=PASS`

**Decision:** APPROVED FOR APPLY using the reviewed saved plan only.


## Canonical Bastion ingress verification green

The temporary canonical target-subnet SSH path is now fully verified:

- Bastion-side egress Security List remains attached;
- Security List state: AVAILABLE;
- stateful TCP/22 egress to the exact Core private IP /32: present;
- stateful TCP/22 ingress from the exact Bastion private endpoint /32: present;
- Terraform drift: none;
- `phase4_bastion_connectivity_verify=PASS`.

The network path now matches the documented OCI Bastion pattern at both subnet directions. The next action is a fresh Managed SSH session for the one-time `ocarun` sudo bootstrap.


## Managed SSH key-readiness diagnosis

After canonical Bastion ingress/egress, client allowlisting, Bastion plugin, and Core sshd were all verified green, a fresh Managed SSH connection still closed during SSH negotiation.

Oracle's Managed SSH troubleshooting documentation states that the target user's `AuthorizedKeysFile` must contain the same SSH public key configured for the Managed SSH session.

Lane 3's current Terraform Core resource does not declare launch metadata for either `ssh_authorized_keys` or `user_data`. The Bastion bootstrap helper, meanwhile, generates a brand-new ephemeral RSA key for every session. If Core was launched without an SSH key, that ephemeral session key cannot authenticate as `opc`.

Before any further network changes, Lane 3 now checks the live instance launch metadata read-only and reports only presence/count booleans, never key contents.

Oracle also documents that the reserved `ssh_authorized_keys` and `user_data` metadata fields cannot be added or changed after launch. If the live key is absent, the remediation must be an explicit instance-bootstrap/recovery decision rather than another metadata update attempt.


## Core launch metadata root cause confirmed

The live Core metadata diagnostic is definitive:

- `ssh_authorized_keys_present=false`
- `ssh_authorized_keys_nonempty_lines=0`
- `user_data_present=false`

This explains why every Managed SSH session reached the Bastion control plane but failed during SSH authentication/negotiation: the ephemeral/session public key had never been installed for `opc` on the target instance.

Oracle requires the Managed SSH session key to exist in the target user's AuthorizedKeysFile, and OCI reserves `ssh_authorized_keys` and `user_data` as launch-time-only metadata.

### Recovery decision

`teswa-core-01` is still pre-production and contains no Teswa database, migrated user data, API runtime, Realtime runtime, Worker runtime, or application secrets. The only guest activity so far has been read-only inventory/diagnostics and failed package bootstrap attempts that exited before package mutation.

Therefore the clean recovery is a controlled Core-only replacement before any stateful workload is introduced.

The replacement design:

1. generate a persistent FIPS-compatible RSA-3072 bootstrap key locally in Cloud Shell;
2. keep the private key only under `~/.ssh`;
3. pass only the public key through ignored local Terraform variables;
4. preserve the existing Core private IPv4 during replacement;
5. launch Core with `ssh_authorized_keys`;
6. launch Core with minimal root cloud-init that creates and validates the Oracle `ocarun` passwordless-sudo entry;
7. keep the same image, shape, subnet, NSG, hostname, boot size, and agent settings;
8. make no Edge, Nova, Supabase, DNS, storage, database, or application-routing change.

The replacement must be reviewed as a saved Terraform plan before apply. Apply requires the explicit `TESWA_ALLOW_CORE_REPLACEMENT=YES` guard.


## Core replacement saved-plan review

The guarded Core replacement plan was reviewed.

Observed:

- preflight generated a persistent RSA-3072 bootstrap key locally with private-key mode 600;
- no production cutover, Supabase change, Nova change, or data migration is included;
- exactly one Terraform resource changes: `oci_core_instance.core[0]`;
- action is destroy/create replacement forced by adding launch metadata;
- launch metadata contains both the SSH public key and minimal cloud-init user data;
- the replacement VNIC configuration pins the current Core private IPv4;
- plan guard passed;
- no Edge, Bastion, NSG, subnet, Object Storage, Vault, Notifications, IAM, Nova, Supabase, DNS, or database resource changes are planned.

Because the replacement destroys the currently allocated A1 instance before OCI launches the replacement, host capacity is the final operational risk. Oracle documents Compute Capacity Reports as the mechanism to check whether the requested shape configuration has available host capacity before launching an instance.

Lane 3 therefore adds a read-only capacity preflight for `VM.Standard.A1.Flex` at exactly 1 OCPU / 6 GB in the Core's current availability domain. The guarded apply helper reruns this check immediately before Terraform apply and refuses to proceed unless capacity status is `AVAILABLE`.

**Plan decision:** structurally approved, conditional on a fresh `capacity_preflight=PASS` immediately before apply.


## Core replacement capacity preflight numeric normalization

The first capacity preflight stopped before making a capacity-report request with `unexpected_core_shape`.

The live Core is already known and Terraform-managed as A1 Flex 1 OCPU / 6 GB. The helper compared OCI JSON numeric values as shell strings against literal `1` and `6`; OCI may serialize those values as `1.0` and `6.0`.

The helper now:

- prints the observed shape/OCPU/memory values;
- validates OCPU and memory numerically rather than by exact string formatting;
- remains read-only;
- does not alter the reviewed replacement plan.

No OCI compute resource changed during the failed preflight.


## A1 replacement blocked by host capacity

The fresh A1 capacity report returned:

- observed Core shape: `VM.Standard.A1.Flex`
- observed Core allocation: 1 OCPU / 6 GB
- requested replacement allocation: 1 OCPU / 6 GB
- capacity status: `OUT_OF_HOST_CAPACITY`
- capacity preflight: FAIL

**Decision:** the saved destroy/create Core replacement plan must not be applied. Destroying the currently allocated A1 instance while the availability domain reports no host capacity could strand Teswa without a Core host.

The replacement apply helper is now hard-disabled while this recovery path is superseded.

### Safe recovery direction

Oracle documents the supported boot-volume repair workflow: stop the affected instance, detach its boot volume, attach that boot volume to another Linux instance as a data volume, repair it, detach it from the helper, reattach it to the original instance, and start the original instance.

This avoids releasing the scarce A1 host allocation.

Lane 3 will use a temporary `VM.Standard.E2.1.Micro` rescue helper only if all of these read-only gates pass first:

- at least one E2 Micro service-limit slot remains;
- at least 47 GB of Always Free boot-volume capacity remains for the temporary helper;
- a fresh E2 host-capacity report for the Core availability domain returns AVAILABLE;
- the existing Core boot volume is detected and remains preserved.

The helper will be launched with root cloud-init enabling `ocarun` sudo, used only to mount the detached Core boot volume and install the missing `opc` authorized key plus `ocarun` sudoers file, then removed after the Core is restored.

No production cutover, Supabase change, Nova change, DNS change, or data migration is part of this rescue.


## Boot-volume rescue preflight attachment lookup correction

The first rescue preflight failed before any OCI mutation with `core_identity_incomplete`.

Root cause was in the helper: it attempted to read `boot-volume-id` directly from `oci compute instance get`. OCI exposes the boot volume relationship through the Boot Volume Attachment API, not as a direct instance field.

The preflight now:

- reads the Core availability domain from the instance;
- lists the Core's boot-volume attachments in that availability domain;
- requires exactly one non-detached attachment with a boot-volume ID;
- prints only boolean resolution status, not the volume OCID;
- remains fully read-only.

No Core, volume, E2 helper, network, Nova, Supabase, DNS, or data resource changed during the failed preflight.


## E2 rescue limit scope correction

The first E2 rescue preflight resolved the existing Core boot-volume attachment correctly, then failed at the E2 service-limit query with OCI `InvalidParameter: availabilityDomain`.

Oracle documents `vm-standard-e2-1-micro-count` as an Availability-Domain-scoped Compute limit. For AD-scoped limits, `GetResourceAvailability` requires the matching `--availability-domain` parameter; omitting it returns HTTP 400 `InvalidParameter`.

The preflight now passes the Core's current availability domain to the E2 Micro resource-availability query. The regional free block-storage query remains unchanged and intentionally omits an availability domain.

No Core, boot volume, helper VM, network, Nova, Supabase, DNS, or data resource changed during the failed query.


## Both spare-compute rescue paths blocked

The read-only rescue preflight now shows:

- E2 Micro service-limit availability: 1
- E2 Micro used: 1
- Always Free block storage available: 53 GB
- Always Free block storage used: 147 GB
- E2 host-capacity status in the Core availability domain: `OUT_OF_HOST_CAPACITY`

The A1 replacement path was already blocked by `OUT_OF_HOST_CAPACITY`.

**Decision:** stop pursuing any recovery that depends on launching replacement or helper compute. Service limits and free storage are sufficient, but physical host capacity is not currently available.

### Capacity-independent recovery

Oracle's supported Instance Console Connection is specifically intended for remote troubleshooting of existing VM instances. Oracle Linux 9.x is supported, and Oracle documents using the serial console to boot into a maintenance bash shell, edit system files, and add/reset the `opc` SSH key.

This path does not require:

- a replacement A1 host;
- a temporary E2 helper;
- a new boot volume;
- public SSH;
- detaching the existing Core boot volume.

Lane 3 will therefore repair the existing Core in place through the serial console:

1. create a temporary instance serial-console connection authenticated by the local RSA bootstrap key;
2. reboot the existing Core and interrupt the UEFI/GRUB boot sequence;
3. boot the selected Oracle Linux entry with `init=/bin/bash`;
4. load SELinux policy and remount root read/write;
5. install the existing bootstrap public key for `opc`;
6. create and validate the `ocarun` sudoers entry;
7. reboot normally;
8. verify Managed SSH/Run Command privilege;
9. delete the temporary serial-console connection.

This keeps the current scarce A1 allocation intact and removes all host-capacity dependency from the recovery.


## Serial-console preflight JSON parsing correction

The first serial-console recovery preflight failed locally with Python `JSONDecodeError` before creating any OCI console connection or mutating the Core.

The failure came from the helper's unnecessary file-based JSON parsing around OCI CLI reads. The recovery does not require full response documents: it only needs the Core lifecycle state, shape, and the count of ACTIVE/CREATING console connections.

The helper now queries those scalar values directly through OCI CLI JMESPath:

- Core lifecycle state via `data."lifecycle-state"`;
- Core shape via `data.shape`;
- active/creating console connection count via `length(...)`.

It also rejects an empty/non-numeric connection count instead of attempting to parse an empty JSON file.

No OCI resource, guest file, Core lifecycle state, Nova, Supabase, DNS, or data changed during the failed preflight.


## Serial-console empty-list normalization

The second serial-console preflight reached the console-connection lookup but reported `console_connection_count_unresolved`.

This is a CLI representation issue for an empty instance-console-connection list: the JMESPath `length(...)` expression can render an empty/null raw result instead of the numeric string `0`.

The preflight does not need an exact count; it only needs to know whether any ACTIVE/CREATING connection exists. It now queries the first matching connection ID:

- empty / `null` / `None` => zero active connections;
- any ID => one-or-more active connections.

The guarded connection-creation helper independently refuses to create a second connection when an ACTIVE/CREATING connection exists.

No OCI resource, guest state, Core lifecycle, Nova, Supabase, DNS, or data changed during this failed preflight.


## Serial-console recovery preflight green

The capacity-independent Core recovery preflight is green:

- Core is RUNNING;
- shape remains `VM.Standard.A1.Flex`;
- bootstrap RSA private key exists locally with mode 600;
- no ACTIVE/CREATING serial-console connection exists;
- maintenance payload is generated locally with mode 600;
- no A1 replacement is required;
- no E2 helper is required;
- no host-capacity dependency remains;
- `serial_recovery_preflight=PASS`.

The next approved action is limited to creating a temporary OCI instance serial-console connection for `teswa-core-01`. This creates the console access object only; it does not reboot or mutate the guest OS.


## Serial-console connection active

The temporary OCI instance serial-console connection for `teswa-core-01` is now ACTIVE.

Verified:

- connection string returned;
- local connection file created with mode 600;
- guest mutation: none;
- network change: none;
- public SSH exposure: none.

The next action is connection-only: source the local connection file and open the SSH-backed serial console. Accept the OCI console host key if prompted, then press Enter to activate the serial console. Do not reboot or edit GRUB until the live console output is confirmed.


## Serial-console public-key authentication correction

The first connection attempt reached Oracle's instance-console SSH endpoint and passed host-key validation, but authentication failed with:

`Permission denied (publickey)`

followed by a closed key-exchange.

Oracle's current serial-console documentation requires the selected private identity file to be specified with `-i` on **both** SSH layers in the Linux/Mac connection command: the outer console SSH command and the nested SSH `ProxyCommand`. The service-provided connection string can omit that identity argument when a non-default key/ssh-agent is used.

The original helper only replaced placeholder key tokens if they happened to appear in OCI's returned connection string; it did not inject `-i` when the returned string contained no placeholder. That allowed an ACTIVE console resource to exist while the local SSH client authenticated with the wrong/default key.

Lane 3 now:

- keeps the existing ACTIVE console connection;
- retrieves its current connection string read-only;
- injects the persistent Core bootstrap RSA private key into every SSH layer;
- adds `IdentitiesOnly=yes` to force that key;
- rewrites only the ignored local connection-command file;
- performs no reboot, guest mutation, network mutation, or OCI resource mutation.

The console connection does not need to be recreated for this correction.


## Serial-console SSH authentication succeeded

After repairing the local connection command to force the persistent RSA identity through both SSH layers, the next console connection attempt progressed past the previous `Permission denied (publickey)` failure.

Observed:

- Oracle instance-console gateway accepted the outer SSH identity;
- the proxied target instance host key prompt was reached and accepted;
- no public-key denial was returned after the target host key was added;
- the SSH process remained attached instead of returning to the Cloud Shell prompt.

This is the expected state for an attached serial console before console output is activated. The next action is non-mutating: send one or two newline characters to the attached console and inspect the current guest console output before any reboot or GRUB interaction.


## Serial-console login prompt confirmed

The serial console is fully interactive and currently shows:

`core01 login:`

This confirms that both SSH layers and the guest serial console are functioning. No username/password login is required for the recovery because the instance was launched without an administrator SSH key.

The next action is a controlled maintenance reboot of the existing Core while keeping the serial console attached. Oracle's supported Oracle Linux recovery flow is:

1. reboot the existing instance;
2. immediately press Esc or F5 repeatedly in the serial console to intercept UEFI/boot;
3. if the UEFI menu appears, select **Boot Manager**, then **UEFI Oracle BlockVolume**, press Enter, then press Esc repeatedly until GRUB appears;
4. highlight the first Oracle Linux kernel and press `e`;
5. append `init=/bin/bash` to the kernel command line;
6. boot the edited entry with Ctrl+X;
7. load SELinux policy and remount root read/write before changing keys/configuration.

Lane 3 adds a guarded helper that triggers only a `SOFTRESET` of `teswa-core-01` and refuses to run unless an ACTIVE serial-console connection exists. It does not wait for the reboot to finish, specifically so the operator can immediately catch UEFI/GRUB in the already attached console.
