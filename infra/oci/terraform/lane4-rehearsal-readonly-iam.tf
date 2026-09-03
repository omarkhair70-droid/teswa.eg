resource "oci_identity_dynamic_group" "teswa_core_lane4_rehearsal_readonly" {
  count          = var.enable_compute_phase3 && var.enable_object_storage ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-core-lane4-rehearsal-readonly"
  description    = "Only teswa-core-01 may read Lane 4 rehearsal migration artifacts"
  matching_rule  = "ALL {instance.id = '${oci_core_instance.core[0].id}'}"
  freeform_tags  = var.freeform_tags
}

resource "oci_identity_policy" "teswa_core_lane4_rehearsal_readonly" {
  count          = var.enable_compute_phase3 && var.enable_object_storage ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-core-lane4-rehearsal-readonly-policy"
  description    = "Read-only Object Storage access for teswa-core-01 to Lane 4 rehearsal artifacts"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly[0].name} to read buckets in compartment ${oci_identity_compartment.teswa.name} where target.bucket.name='${oci_objectstorage_bucket.backups[0].name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly[0].name} to manage objects in compartment ${oci_identity_compartment.teswa.name} where all {target.bucket.name='${oci_objectstorage_bucket.backups[0].name}', target.object.name='lane4-rehearsal/*', any {request.permission='OBJECT_INSPECT', request.permission='OBJECT_READ'}}"
  ]
  freeform_tags = var.freeform_tags
}
