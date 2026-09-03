resource "oci_bastion_bastion" "admin" {
  count          = var.enable_admin_bastion ? 1 : 0
  bastion_type   = "standard"
  compartment_id = oci_identity_compartment.teswa.id
  target_subnet_id = oci_core_subnet.public_edge.id
  name           = "teswa-admin-bastion"
  client_cidr_block_allow_list = var.admin_bastion_client_cidrs
  max_session_ttl_in_seconds   = 1800
  freeform_tags = var.freeform_tags

  lifecycle {
    precondition {
      condition     = length(var.admin_bastion_client_cidrs) > 0
      error_message = "admin_bastion_client_cidrs must contain at least one reviewed client CIDR when the temporary bastion is enabled."
    }
  }
}

resource "oci_core_network_security_group_security_rule" "bastion_to_core_ssh" {
  count                     = var.enable_admin_bastion ? 1 : 0
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "${oci_bastion_bastion.admin[0].private_endpoint_ip_address}/32"
  source_type               = "CIDR_BLOCK"

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}
