output "teswa_vcn_id" {
  value       = oci_core_vcn.teswa.id
  description = "Teswa-only VCN OCID."
}

output "public_edge_subnet_id" {
  value       = oci_core_subnet.public_edge.id
  description = "Teswa public edge subnet OCID."
}

output "private_app_subnet_id" {
  value       = oci_core_subnet.private_app.id
  description = "Teswa private application subnet OCID."
}

output "private_data_subnet_id" {
  value       = oci_core_subnet.private_data.id
  description = "Teswa private data subnet OCID."
}
