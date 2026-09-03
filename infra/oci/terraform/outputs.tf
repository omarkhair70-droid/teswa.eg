output "teswa_compartment_id" {
  value       = oci_identity_compartment.teswa.id
  description = "Dedicated Teswa platform compartment OCID."
}

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


output "media_bucket_name" {
  value       = var.enable_object_storage ? oci_objectstorage_bucket.media[0].name : null
  description = "Private Teswa media bucket name when enabled."
}

output "backups_bucket_name" {
  value       = var.enable_object_storage ? oci_objectstorage_bucket.backups[0].name : null
  description = "Private versioned Teswa backups bucket name when enabled."
}

output "teswa_vault_id" {
  value       = var.enable_vault ? oci_kms_vault.teswa[0].id : null
  description = "Default Teswa Vault OCID when enabled."
}

output "ops_notification_topic_id" {
  value       = var.enable_notifications ? oci_ons_notification_topic.teswa_ops[0].topic_id : null
  description = "Teswa operations notification topic OCID when enabled."
}
