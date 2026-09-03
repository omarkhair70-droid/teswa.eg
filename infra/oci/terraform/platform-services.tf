data "oci_objectstorage_namespace" "teswa" {
  compartment_id = var.compartment_ocid
}

resource "oci_objectstorage_bucket" "media" {
  count          = var.enable_object_storage ? 1 : 0
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.teswa.namespace
  name           = "teswa-media"
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  freeform_tags  = var.freeform_tags
}

resource "oci_objectstorage_bucket" "backups" {
  count          = var.enable_object_storage ? 1 : 0
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.teswa.namespace
  name           = "teswa-backups"
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  freeform_tags  = var.freeform_tags
}

resource "oci_kms_vault" "teswa" {
  count          = var.enable_vault ? 1 : 0
  compartment_id = var.compartment_ocid
  display_name   = "teswa-vault"
  vault_type     = "DEFAULT"
  freeform_tags  = var.freeform_tags
}

resource "oci_ons_notification_topic" "teswa_ops" {
  count          = var.enable_notifications ? 1 : 0
  compartment_id = var.compartment_ocid
  name           = "teswa-ops"
  description    = "Teswa OCI operational alerts"
  freeform_tags  = var.freeform_tags
}
