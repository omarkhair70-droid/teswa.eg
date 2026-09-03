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
