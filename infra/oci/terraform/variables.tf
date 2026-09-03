variable "region" {
  description = "OCI region for the Teswa foundation."
  type        = string
  default     = "me-jeddah-1"
}

variable "tenancy_ocid" {
  description = "OCI tenancy OCID used only as the parent for the dedicated Teswa compartment."
  type        = string
}

variable "vcn_cidr" {
  description = "Teswa-only VCN CIDR. Nova is 10.0.0.0/16; this default is intentionally non-overlapping."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public edge subnet CIDR inside the Teswa VCN."
  type        = string
  default     = "10.20.0.0/24"
}

variable "app_subnet_cidr" {
  description = "Private application subnet CIDR inside the Teswa VCN."
  type        = string
  default     = "10.20.10.0/24"
}

variable "data_subnet_cidr" {
  description = "Private PostgreSQL/data subnet CIDR inside the Teswa VCN."
  type        = string
  default     = "10.20.20.0/24"
}

variable "enable_object_storage" {
  description = "Create private Teswa Object Storage buckets."
  type        = bool
  default     = false
}

variable "enable_vault" {
  description = "Create a DEFAULT OCI Vault for future Teswa server-side secrets. Real secret values are never stored in Terraform."
  type        = bool
  default     = false
}

variable "enable_notifications" {
  description = "Create a Teswa monitoring notification topic."
  type        = bool
  default     = false
}

variable "freeform_tags" {
  description = "Common non-sensitive tags."
  type        = map(string)
  default = {
    product    = "teswa"
    managed_by = "terraform"
    lane       = "oci-foundation"
  }
}


variable "enable_compute_phase3" {
  description = "Create the Teswa Phase 3 edge/core compute foundation."
  type        = bool
  default     = false
}

variable "core_image_ocid" {
  description = "Pinned Oracle Linux image OCID for teswa-core-01. Generated locally by the Phase 3 preflight."
  type        = string
  default     = ""
}

variable "edge_image_ocid" {
  description = "Pinned Oracle Linux image OCID for teswa-edge-01. Generated locally by the Phase 3 preflight."
  type        = string
  default     = ""
}


variable "enable_run_command_iam" {
  description = "Create the least-privilege dynamic group and IAM policy required for Teswa instances to poll Run Command executions."
  type        = bool
  default     = true
}


variable "enable_admin_bastion" {
  description = "Create a temporary OCI Bastion admin path for private-core bootstrap. Keep false outside reviewed bootstrap windows."
  type        = bool
  default     = false
}

variable "admin_bastion_client_cidrs" {
  description = "Client CIDRs allowed to connect to the temporary Teswa admin bastion. Generated locally and never committed."
  type        = list(string)
  default     = []
}


variable "enable_admin_bastion_connectivity" {
  description = "Temporarily attach least-privilege Bastion egress to the private app subnet for Core SSH bootstrap."
  type        = bool
  default     = false
}

variable "admin_bastion_target_cidr" {
  description = "Exact private target CIDR for the temporary Bastion SSH egress rule. Generated locally and never committed."
  type        = string
  default     = ""
}
