variable "region" {
  description = "OCI region for the Teswa foundation."
  type        = string
  default     = "me-jeddah-1"
}

variable "compartment_ocid" {
  description = "Dedicated compartment OCID for Teswa resources. Do not point this at Nova-owned resources."
  type        = string
}

variable "vcn_cidr" {
  description = "Teswa VCN CIDR. Must be verified not to overlap any existing Nova/Balcona VCN."
  type        = string
}

variable "public_subnet_cidr" {
  description = "Public edge subnet CIDR inside the Teswa VCN."
  type        = string
}

variable "app_subnet_cidr" {
  description = "Private application subnet CIDR inside the Teswa VCN."
  type        = string
}

variable "data_subnet_cidr" {
  description = "Private PostgreSQL/data subnet CIDR inside the Teswa VCN."
  type        = string
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
