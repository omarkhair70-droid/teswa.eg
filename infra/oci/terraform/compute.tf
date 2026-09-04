locals {
  phase8b_edge_proxy_caddy_block = var.enable_phase8b_internal_proxy ? join("\n", [
    "handle /internal/api-health {",
    "  rewrite * /healthz",
    "  reverse_proxy http://${var.phase8b_core_private_ip}:3100",
    "}",
    "",
    "handle /internal/realtime-health {",
    "  rewrite * /healthz",
    "  reverse_proxy http://${var.phase8b_core_private_ip}:3200",
    "}",
  ]) : ""

  phase8b_edge_proxy_boot_verify = var.enable_phase8b_internal_proxy ? join("\n", [
    "curl --fail --silent --show-error \"http://$EDGE_PRIVATE_IP:8080/internal/api-health\" | grep -Fq '\"service\":\"teswa-api\"'",
    "curl --fail --silent --show-error \"http://$EDGE_PRIVATE_IP:8080/internal/realtime-health\" | grep -Fq '\"service\":\"teswa-realtime\"'",
  ]) : ""
}

data "oci_identity_availability_domains" "teswa" {
  compartment_id = var.tenancy_ocid
}

resource "oci_core_nat_gateway" "app_egress" {
  count          = var.enable_compute_phase3 ? 1 : 0
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-app-nat"
  block_traffic  = false
  freeform_tags  = var.freeform_tags
}

resource "oci_core_route_table" "private_app" {
  count          = var.enable_compute_phase3 ? 1 : 0
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-private-app-routes"
  freeform_tags  = var.freeform_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.app_egress[0].id
  }
}

resource "oci_core_network_security_group_security_rule" "edge_egress" {
  count                     = var.enable_compute_phase3 ? 1 : 0
  network_security_group_id = oci_core_network_security_group.edge.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

resource "oci_core_network_security_group_security_rule" "app_egress" {
  count                     = var.enable_compute_phase3 ? 1 : 0
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

resource "oci_core_instance" "edge" {
  count               = var.enable_compute_phase3 ? 1 : 0
  availability_domain = data.oci_identity_availability_domains.teswa.availability_domains[0].name
  compartment_id      = oci_identity_compartment.teswa.id
  display_name        = "teswa-edge-01"
  shape               = "VM.Standard.E2.1.Micro"
  freeform_tags       = var.freeform_tags

  create_vnic_details {
    assign_public_ip = true
    display_name     = "teswa-edge-01-primary"
    hostname_label   = "edge01"
    nsg_ids          = [oci_core_network_security_group.edge.id]
    subnet_id        = oci_core_subnet.public_edge.id
    private_ip       = var.enable_phase8b_internal_proxy ? var.phase8b_edge_private_ip : null
  }

  metadata = {
    user_data = base64encode(<<-EOF
      #!/bin/bash
      set -Eeuo pipefail

      exec 3>/dev/console || true
      CADDY_VERSION="2.11.4"
      CADDY_ASSET="caddy_$${CADDY_VERSION}_linux_amd64.tar.gz"
      CADDY_BASE_URL="https://github.com/caddyserver/caddy/releases/download/v$${CADDY_VERSION}"
      TMPDIR_CADDY="$(mktemp -d)"
      EDGE_PRIVATE_IP="$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"

      cleanup() {
        rc=$?
        if [ "$rc" -ne 0 ]; then
          printf '%s\n' "TESWA_PHASE8_CADDY_BOOT=FAIL rc=$rc" >&3 || true
        fi
        rm -rf "$TMPDIR_CADDY"
      }
      trap cleanup EXIT

      printf '%s\n' 'TESWA_PHASE8_CADDY_BOOT=START' >&3 || true
      [ -n "$EDGE_PRIVATE_IP" ]

      install -d -m 0750 /etc/sudoers.d
      printf '%s\n' 'ocarun ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/101-oracle-cloud-agent-run-command
      chmod 0440 /etc/sudoers.d/101-oracle-cloud-agent-run-command
      /usr/sbin/visudo -cf /etc/sudoers.d/101-oracle-cloud-agent-run-command

      command -v curl >/dev/null
      command -v tar >/dev/null
      command -v sha512sum >/dev/null

      curl --fail --silent --show-error --location \
        --retry 5 --retry-delay 2 --connect-timeout 10 --max-time 300 \
        -o "$TMPDIR_CADDY/$CADDY_ASSET" \
        "$CADDY_BASE_URL/$CADDY_ASSET"
      curl --fail --silent --show-error --location \
        --retry 5 --retry-delay 2 --connect-timeout 10 --max-time 120 \
        -o "$TMPDIR_CADDY/caddy_checksums.txt" \
        "$CADDY_BASE_URL/caddy_$${CADDY_VERSION}_checksums.txt"

      (
        cd "$TMPDIR_CADDY"
        grep "  $CADDY_ASSET$" caddy_checksums.txt > caddy_asset_checksum.txt
        [ -s caddy_asset_checksum.txt ]
        sha512sum -c caddy_asset_checksum.txt
        tar -xzf "$CADDY_ASSET" caddy
      )

      install -o root -g root -m 0755 "$TMPDIR_CADDY/caddy" /usr/bin/caddy
      restorecon -v /usr/bin/caddy >/dev/null 2>&1 || true

      getent group caddy >/dev/null 2>&1 || groupadd --system caddy
      id caddy >/dev/null 2>&1 || useradd --system --gid caddy --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy
      install -d -o root -g caddy -m 0750 /etc/caddy
      install -d -o caddy -g caddy -m 0750 /var/lib/caddy /var/log/caddy

      cat > /etc/caddy/Caddyfile <<CADDYFILE
      {
        auto_https off
        admin off
      }

      http://$${EDGE_PRIVATE_IP}:8080 {
        respond /healthz "teswa-edge-caddy-ok" 200
      ${local.phase8b_edge_proxy_caddy_block}
        respond 404
      }
      CADDYFILE
      chown root:caddy /etc/caddy/Caddyfile
      chmod 0640 /etc/caddy/Caddyfile
      restorecon -Rv /etc/caddy >/dev/null 2>&1 || true

      cat > /etc/systemd/system/caddy.service <<'UNIT'
      [Unit]
      Description=Teswa Edge Caddy
      Documentation=https://caddyserver.com/docs/
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=notify
      User=caddy
      Group=caddy
      ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
      ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
      TimeoutStopSec=5s
      LimitNOFILE=1048576
      PrivateTmp=true
      ProtectSystem=full
      AmbientCapabilities=CAP_NET_BIND_SERVICE
      CapabilityBoundingSet=CAP_NET_BIND_SERVICE
      NoNewPrivileges=true
      Environment=XDG_DATA_HOME=/var/lib/caddy
      Environment=XDG_CONFIG_HOME=/var/lib/caddy

      [Install]
      WantedBy=multi-user.target
      UNIT
      chmod 0644 /etc/systemd/system/caddy.service
      restorecon -v /etc/systemd/system/caddy.service >/dev/null 2>&1 || true

      if systemctl is-active --quiet firewalld; then
        firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="${var.app_subnet_cidr}" port port="8080" protocol="tcp" accept'
        firewall-cmd --reload
      fi

      /usr/bin/caddy validate --config /etc/caddy/Caddyfile
      systemctl daemon-reload
      systemctl enable --now caddy.service

      for _ in $(seq 1 30); do
        if curl --fail --silent --show-error "http://$EDGE_PRIVATE_IP:8080/healthz" | grep -qx 'teswa-edge-caddy-ok'; then
          break
        fi
        sleep 1
      done
      curl --fail --silent --show-error "http://$EDGE_PRIVATE_IP:8080/healthz" | grep -qx 'teswa-edge-caddy-ok'
      ${local.phase8b_edge_proxy_boot_verify}
      ss -ltnH | awk '$4 ~ /(^|:)80$/ || $4 ~ /(^|:)443$/ {found=1} END {exit found ? 1 : 0}'
      ss -ltnH | awk -v addr="$EDGE_PRIVATE_IP:8080" '$4 == addr {found=1} END {exit found ? 0 : 1}'

      install -d -m 0755 /var/lib/teswa
      printf '%s\n' "version=$(/usr/bin/caddy version | awk '{print $1}') listener=$EDGE_PRIVATE_IP:8080 public_listener=false phase8b_proxy=${var.enable_phase8b_internal_proxy}" > /var/lib/teswa/phase8-caddy-boot-pass
      chmod 0644 /var/lib/teswa/phase8-caddy-boot-pass
      printf '%s\n' "TESWA_PHASE8_CADDY_BOOT=PASS version=$(/usr/bin/caddy version | awk '{print $1}') listener=$EDGE_PRIVATE_IP:8080 public_listener=false phase8b_proxy=${var.enable_phase8b_internal_proxy}" >&3 || true
    EOF
    )
  }

  source_details {
    source_type             = "image"
    source_id               = var.edge_image_ocid
    boot_volume_size_in_gbs = 50
    boot_volume_vpus_per_gb = 10
  }

  agent_config {
    are_all_plugins_disabled = false
    is_management_disabled   = false
    is_monitoring_disabled   = false
  }

  lifecycle {
    precondition {
      condition     = var.edge_image_ocid != ""
      error_message = "edge_image_ocid must be pinned by the Phase 3 preflight."
    }

    precondition {
      condition     = !var.enable_phase8b_internal_proxy || trimspace(var.phase8b_core_private_ip) != ""
      error_message = "phase8b_core_private_ip must be pinned when the Phase 8B internal proxy is enabled."
    }

    precondition {
      condition     = !var.enable_phase8b_internal_proxy || trimspace(var.phase8b_edge_private_ip) != ""
      error_message = "phase8b_edge_private_ip must preserve the current Edge private IP when the Phase 8B internal proxy is enabled."
    }
  }
}

resource "oci_core_instance" "core" {
  count               = var.enable_compute_phase3 ? 1 : 0
  availability_domain = data.oci_identity_availability_domains.teswa.availability_domains[0].name
  compartment_id      = oci_identity_compartment.teswa.id
  display_name        = "teswa-core-01"
  shape               = "VM.Standard.A1.Flex"
  freeform_tags       = var.freeform_tags

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  create_vnic_details {
    assign_public_ip = false
    display_name     = "teswa-core-01-primary"
    hostname_label   = "core01"
    nsg_ids          = [oci_core_network_security_group.app.id]
    subnet_id        = oci_core_subnet.private_app.id
    private_ip       = var.enable_core_bootstrap_metadata ? var.core_bootstrap_private_ip : null
  }

  metadata = var.enable_core_bootstrap_metadata ? {
    ssh_authorized_keys = var.core_bootstrap_ssh_public_key
    user_data = base64encode(<<-EOF
      #!/bin/bash
      set -Eeuo pipefail
      install -d -m 0750 /etc/sudoers.d
      printf '%s\n' 'ocarun ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/101-oracle-cloud-agent-run-command
      chmod 0440 /etc/sudoers.d/101-oracle-cloud-agent-run-command
      /usr/sbin/visudo -cf /etc/sudoers.d/101-oracle-cloud-agent-run-command
    EOF
    )
  } : {}

  source_details {
    source_type             = "image"
    source_id               = var.core_image_ocid
    boot_volume_size_in_gbs = 50
    boot_volume_vpus_per_gb = 10
  }

  agent_config {
    are_all_plugins_disabled = false
    is_management_disabled   = false
    is_monitoring_disabled   = false

    plugins_config {
      desired_state = "ENABLED"
      name          = "Bastion"
    }
  }

  lifecycle {
    precondition {
      condition     = var.core_image_ocid != ""
      error_message = "core_image_ocid must be pinned by the Phase 3 preflight."
    }

    precondition {
      condition     = !var.enable_core_bootstrap_metadata || trimspace(var.core_bootstrap_ssh_public_key) != ""
      error_message = "core_bootstrap_ssh_public_key must be set when Core bootstrap metadata is enabled."
    }

    precondition {
      condition     = !var.enable_core_bootstrap_metadata || trimspace(var.core_bootstrap_private_ip) != ""
      error_message = "core_bootstrap_private_ip must preserve the current Core private IP during the controlled replacement."
    }
  }
}
