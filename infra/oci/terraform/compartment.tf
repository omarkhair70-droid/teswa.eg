resource "oci_identity_compartment" "teswa" {
  compartment_id = var.tenancy_ocid
  name           = "teswa-platform"
  description    = "Teswa isolated company platform resources"
  enable_delete  = false
  freeform_tags  = var.freeform_tags
}
