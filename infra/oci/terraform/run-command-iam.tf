resource "oci_identity_dynamic_group" "teswa_run_command" {
  count          = var.enable_run_command_iam ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-run-command-instances"
  description    = "Teswa platform instances allowed to poll OCI Run Command executions"
  matching_rule  = "ALL {instance.compartment.id = '${oci_identity_compartment.teswa.id}'}"
  freeform_tags  = var.freeform_tags
}

resource "oci_identity_policy" "teswa_run_command" {
  count          = var.enable_run_command_iam ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "teswa-run-command-policy"
  description    = "Least-privilege policy allowing Teswa instances to poll and report their own Run Command executions"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.teswa_run_command[0].name} to use instance-agent-command-execution-family in compartment ${oci_identity_compartment.teswa.name} where request.instance.id=target.instance.id"
  ]
  freeform_tags = var.freeform_tags
}
