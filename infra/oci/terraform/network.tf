resource "oci_core_vcn" "teswa" {
  compartment_id = oci_identity_compartment.teswa.id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "teswa-vcn"
  dns_label      = "teswa"
  freeform_tags  = var.freeform_tags
}

# Do not inherit OCI's default security-list behavior. Subnets use this
# intentionally empty list and explicit NSGs below.
resource "oci_core_security_list" "empty" {
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-empty-security-list"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_internet_gateway" "teswa" {
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-igw"
  enabled        = true
  freeform_tags  = var.freeform_tags
}

resource "oci_core_route_table" "public" {
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-public-routes"
  freeform_tags  = var.freeform_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.teswa.id
  }
}

resource "oci_core_network_security_group" "edge" {
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-edge-nsg"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_network_security_group" "app" {
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-app-nsg"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_network_security_group" "data" {
  compartment_id = oci_identity_compartment.teswa.id
  vcn_id         = oci_core_vcn.teswa.id
  display_name   = "teswa-data-nsg"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_network_security_group_security_rule" "edge_https" {
  network_security_group_id = oci_core_network_security_group.edge.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"

  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_network_security_group_security_rule" "edge_http" {
  network_security_group_id = oci_core_network_security_group.edge.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"

  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "edge_to_app" {
  network_security_group_id = oci_core_network_security_group.edge.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = oci_core_network_security_group.app.id
  destination_type          = "NETWORK_SECURITY_GROUP"

  tcp_options {
    destination_port_range {
      min = 3000
      max = 3999
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_from_edge" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.edge.id
  source_type               = "NETWORK_SECURITY_GROUP"

  tcp_options {
    destination_port_range {
      min = 3000
      max = 3999
    }
  }
}

resource "oci_core_network_security_group_security_rule" "app_to_postgres" {
  network_security_group_id = oci_core_network_security_group.app.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = oci_core_network_security_group.data.id
  destination_type          = "NETWORK_SECURITY_GROUP"

  tcp_options {
    destination_port_range {
      min = 5432
      max = 5432
    }
  }
}

resource "oci_core_network_security_group_security_rule" "postgres_from_app" {
  network_security_group_id = oci_core_network_security_group.data.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.app.id
  source_type               = "NETWORK_SECURITY_GROUP"

  tcp_options {
    destination_port_range {
      min = 5432
      max = 5432
    }
  }
}

resource "oci_core_subnet" "public_edge" {
  compartment_id             = oci_identity_compartment.teswa.id
  vcn_id                     = oci_core_vcn.teswa.id
  cidr_block                 = var.public_subnet_cidr
  display_name               = "teswa-public-edge"
  dns_label                  = "edge"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.empty.id]
  freeform_tags              = var.freeform_tags
}

resource "oci_core_subnet" "private_app" {
  compartment_id             = oci_identity_compartment.teswa.id
  vcn_id                     = oci_core_vcn.teswa.id
  cidr_block                 = var.app_subnet_cidr
  display_name               = "teswa-private-app"
  dns_label                  = "app"
  prohibit_public_ip_on_vnic = true
  security_list_ids          = [oci_core_security_list.empty.id]
  freeform_tags              = var.freeform_tags
}

resource "oci_core_subnet" "private_data" {
  compartment_id             = oci_identity_compartment.teswa.id
  vcn_id                     = oci_core_vcn.teswa.id
  cidr_block                 = var.data_subnet_cidr
  display_name               = "teswa-private-data"
  dns_label                  = "data"
  prohibit_public_ip_on_vnic = true
  security_list_ids          = [oci_core_security_list.empty.id]
  freeform_tags              = var.freeform_tags
}
