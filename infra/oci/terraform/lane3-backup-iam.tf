resource "oci_identity_dynamic_group" "lane3_backup_core" {
  count          = var.enable_lane3_backup_iam ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-lane3-backup-core"
  description    = "teswa-core-01 only: write/read objects in teswa-backups for Lane 3 backup verification"
  matching_rule  = "ALL {instance.id = '${oci_core_instance.core[0].id}'}"
  freeform_tags  = var.freeform_tags
}

resource "oci_identity_policy" "lane3_backup_core" {
  count          = var.enable_lane3_backup_iam ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-lane3-backup-core-policy"
  description    = "Core-only object access to the private teswa-backups bucket"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.lane3_backup_core[0].name} to manage objects in compartment ${oci_identity_compartment.teswa.name} where target.bucket.name='teswa-backups'"
  ]
  freeform_tags = var.freeform_tags
}
