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
  }

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
  }

  lifecycle {
    precondition {
      condition     = var.core_image_ocid != ""
      error_message = "core_image_ocid must be pinned by the Phase 3 preflight."
    }
  }
}
