resource "oci_identity_dynamic_group" "teswa_core_lane4_rehearsal_readonly" {
  count          = var.enable_lane4_rehearsal_readonly_iam ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-core-lane4-rehearsal-readonly"
  description    = "Only teswa-core-01 may read Lane 4 rehearsal migration artifacts"
  matching_rule  = "ALL {instance.id = '${var.lane4_rehearsal_core_instance_ocid}'}"
  freeform_tags  = var.freeform_tags

  lifecycle {
    precondition {
      condition     = !var.enable_lane4_rehearsal_readonly_iam || trimspace(var.lane4_rehearsal_core_instance_ocid) != ""
      error_message = "lane4_rehearsal_core_instance_ocid must be provided locally when Lane 4 rehearsal read-only IAM is enabled."
    }
  }
}

resource "oci_identity_policy" "teswa_core_lane4_rehearsal_readonly" {
  count          = var.enable_lane4_rehearsal_readonly_iam ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-core-lane4-rehearsal-readonly-policy"
  description    = "Read-only Object Storage access for teswa-core-01 to Lane 4 rehearsal artifacts"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly[0].name} to read buckets in compartment ${oci_identity_compartment.teswa.name} where target.bucket.name='teswa-backups'",
    "Allow dynamic-group ${oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly[0].name} to manage objects in compartment ${oci_identity_compartment.teswa.name} where all {target.bucket.name='teswa-backups', target.object.name='lane4-rehearsal/*', any {request.permission='OBJECT_INSPECT', request.permission='OBJECT_READ'}}"
  ]
  freeform_tags = var.freeform_tags
}
